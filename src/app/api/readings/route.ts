import { randomUUID } from "node:crypto";
import { withDeviceRead, DeviceAccessChanged } from "@/lib/device-access";
import { usageGate } from "@/lib/usage-budget";
import { accessibleDevices } from "@/lib/device-access";
import { ingestionPaused } from "@/lib/storage-config";
import {
  validateReadingBody,
  InvalidReadingError,
} from "@/lib/reading-ingestion";
import { NextRequest, NextResponse } from "next/server";
import { extractApiKeyFromHeaders, validateApiKey } from "@/lib/api-keys";
import { getLatestReading, storeReading } from "@/lib/dynamo";
import {
  resolveCellTower,
  resolveWifiAccessPoints,
  type WifiAccessPoint,
} from "@/lib/geolocation";
import { getDevice, claimDeviceForReading, updateDevice } from "@/lib/devices";

export async function POST(req: NextRequest) {
  if (ingestionPaused())
    return NextResponse.json(
      {
        ok: false,
        stored: false,
        error: "ingestion paused; retain and retry this event",
      },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["write:readings"],
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 16 * 1024) {
    return NextResponse.json(
      { error: "reading exceeds 16 KiB" },
      { status: 413 },
    );
  }
  try {
    validateReadingBody(body);
  } catch (error) {
    if (error instanceof InvalidReadingError)
      return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
  const deviceId = String(body.deviceId);
  const pm25 = body.pm25 != null ? Number(body.pm25) : null;
  const aqi = body.aqi == null ? null : Number(body.aqi);
  if (
    aqi !== null &&
    (!["number", "string"].includes(typeof body.aqi) ||
      String(body.aqi).trim() === "" ||
      !Number.isFinite(aqi) ||
      aqi < 0)
  ) {
    return NextResponse.json(
      { error: "aqi must be a non-negative number or null" },
      { status: 400 },
    );
  }
  const gasRaw = body.gasRaw != null ? Number(body.gasRaw) : null;
  const gasVoltage = body.gasVoltage != null ? Number(body.gasVoltage) : null;
  const airState = body.airState ? String(body.airState) : null;
  const rssi = body.rssi != null ? Number(body.rssi) : null;
  const firmwareVersion = body.firmwareVersion
    ? String(body.firmwareVersion)
    : null;
  const uptimeMs = body.uptimeMs != null ? Number(body.uptimeMs) : null;
  const sample = body.sample != null ? Number(body.sample) : null;
  const transport = body.transport ? String(body.transport) : null;

  const identityPayload = structuredClone(body);
  try {
    let existing = await getDevice(deviceId);
    if (!existing && principal.type === "developer") {
      return NextResponse.json(
        {
          error: "enroll this device before uploading",
          code: "DEVICE_ENROLLMENT_REQUIRED",
          action:
            "Sign in to the account that owns the upload key and enroll this board in Devices & access using its one-time enrollment code.",
        },
        { status: 404 },
      );
    }
    if (!existing) {
      const family = body.family ? String(body.family) : "";
      existing = await claimDeviceForReading({
        deviceId,
        ownershipVersion: randomUUID(),
        name: String(
          body.deviceName ??
            body.name ??
            (family ? `${family} sensor` : deviceId),
        ),
        location: "",
        lat: body.lat != null ? Number(body.lat) : null,
        lng: body.lng != null ? Number(body.lng) : null,
        ownerId: principal.type === "developer" ? principal.userId : "",
        orgId: principal.orgId,
        status: "active",
        createdAt: new Date().toISOString(),
      });
    }
    if (
      principal.type === "developer" &&
      (existing.ownerId !== principal.userId ||
        (principal.deviceId && principal.deviceId !== deviceId))
    ) {
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    }

    const wantsLocation =
      body.lat == null &&
      body.lng == null &&
      Boolean(body.cellTower || body.wifiAccessPoints);
    const canGeolocate =
      wantsLocation &&
      !(await usageGate("geolocation", principal.keyId ?? "system-ingestion"));
    // Optional enrichment never blocks measurement acceptance.
    // Resolve cell tower to lat/lng if present and no lat/lng already
    const ct = body.cellTower as Record<string, unknown> | undefined;
    if (canGeolocate && ct && body.lat == null && body.lng == null) {
      const loc = await resolveCellTower({
        mcc: Number(ct.mcc ?? 0),
        mnc: Number(ct.mnc ?? 0),
        lac: Number(ct.lac ?? 0),
        cid: Number(ct.cid ?? 0),
      });
      if (loc) {
        body.lat = loc.lat;
        body.lng = loc.lng;
        body.locationAccuracy = loc.accuracy;
        body.locationSource = "cellTower";
      }
    }

    // Resolve WiFi access points to lat/lng if present and still no lat/lng
    if (canGeolocate && body.lat == null && body.lng == null) {
      const aps = body.wifiAccessPoints;
      if (Array.isArray(aps) && aps.length > 0) {
        const loc = await resolveWifiAccessPoints(aps as WifiAccessPoint[]);
        if (loc) {
          body.lat = loc.lat;
          body.lng = loc.lng;
          body.locationAccuracy = loc.accuracy;
          body.locationSource = "wifiAccessPoints";
        }
      }
    }

    // Network identifiers are transient geolocation inputs, not measurement storage.
    delete body.wifiAccessPoints;
    delete body.cellTower;
    const stored = await storeReading({
      deviceId,
      aqi,
      gasRaw,
      gasVoltage,
      airState,
      rssi,
      firmwareVersion,
      uptimeMs,
      sample,
      transport,
      rawPayload: body,
      identityPayload,
      tenantId: existing.orgId,
      ownershipVersion: existing.ownershipVersion,
      authorizedOwnerId:
        principal.type === "developer" ? principal.userId : undefined,
      capturedAt: (body.capturedAt ??
        body.measuredAt ??
        body.epochSeconds ??
        body.when ??
        null) as string | number | null,
      eventId: body.eventId as string | undefined,
      bootSession: body.bootSession as string | undefined,
      sequence: (body.sequence ?? body.sample) as string | number | undefined,
    });

    if (stored.outcome === "conflict") {
      return NextResponse.json(
        {
          ok: false,
          stored: false,
          outcome: "conflict",
          error: "event identity already used for different data",
        },
        { status: 409 },
      );
    }

    if (body.lat != null && body.lng != null) {
      await updateDevice(
        deviceId,
        { lat: Number(body.lat), lng: Number(body.lng) },
        existing,
      );
    }

    return NextResponse.json({
      ok: true,
      stored: stored.outcome === "stored",
      outcome: stored.outcome,
      capturedAt: stored.capturedAt,
      receivedAt: stored.receivedAt,
      clockQuality: stored.clockQuality,
      deviceId,
      aqi,
      pm25,
      timestamp: stored.timestamp,
    });
  } catch (err: unknown) {
    if (err instanceof DeviceAccessChanged)
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    console.error(
      "[readings] persistence unavailable",
      err instanceof Error ? err.name : "unknown",
    );
    return NextResponse.json(
      {
        ok: false,
        stored: false,
        error: "reading storage unavailable; retry this event",
      },
      { status: 503 },
    );
  }
}

export async function GET(req: NextRequest) {
  const principal = await validateApiKey(
    extractApiKeyFromHeaders(req.headers),
    ["read:readings"],
  );
  if (!principal) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const devices = await accessibleDevices({ kind: "api-key", principal });
    const readings = (
      await Promise.all(
        devices.map((device) =>
          withDeviceRead({ kind: "api-key", principal }, device.deviceId, () =>
            getLatestReading(device.deviceId),
          ),
        ),
      )
    ).filter((reading) => reading !== null);
    readings.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return NextResponse.json({ readings: readings.slice(0, 20) });
  } catch (err: unknown) {
    if (err instanceof DeviceAccessChanged)
      return NextResponse.json({ error: "device not found" }, { status: 404 });
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
