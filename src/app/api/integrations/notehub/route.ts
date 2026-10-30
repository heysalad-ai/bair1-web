import { ingestionPaused } from "@/lib/storage-config";
import { NextRequest, NextResponse } from "next/server";
import { getDevice, createDevice, updateDevice } from "@/lib/devices";
import { setNotecardTelemetry, storeReading } from "@/lib/dynamo";
import { normalizeNotehubEvent, verifyNotehubSecret } from "@/lib/notehub";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (ingestionPaused()) return NextResponse.json(
    { ok: false, stored: false, error: "ingestion paused; retain and retry this event" },
    { status: 503, headers: { "Retry-After": "60" } },
  );
  const routeSecret = process.env.NOTEHUB_ROUTE_SECRET;
  const idSalt = process.env.NOTEHUB_DEVICE_ID_SALT ?? routeSecret;
  if (!routeSecret || !idSalt) {
    console.error("[notehub] NOTEHUB_ROUTE_SECRET is not configured");
    return NextResponse.json({ error: "integration unavailable" }, { status: 503 });
  }
  if (!verifyNotehubSecret(req.headers, routeSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const normalized = normalizeNotehubEvent(input, {
      idSalt,
      expectedProduct: process.env.NOTEHUB_PRODUCT_UID,
    });
    const existing = await getDevice(normalized.publicDeviceId);
    if (!existing) {
      await createDevice({
        deviceId: normalized.publicDeviceId,
        name: `Notecard ${normalized.publicDeviceId.slice(-4)}`,
        location: "Private mobile device",
        lat: normalized.lat,
        lng: normalized.lng,
        ownerId: process.env.NOTEHUB_OWNER_ID ?? "",
        orgId: process.env.NOTEHUB_ORG_ID ?? "default",
        status: "active",
        createdAt: new Date().toISOString(),
      });
    } else {
      await updateDevice(normalized.publicDeviceId, {
        status: "active",
        ...(normalized.lat != null && normalized.lng != null
          ? { lat: normalized.lat, lng: normalized.lng }
          : {}),
      });
    }

    await setNotecardTelemetry({
      deviceId: normalized.publicDeviceId,
      capturedAt: normalized.capturedAt,
      receivedAt: normalized.receivedAt,
      temperature: normalized.temperature,
      humidity: normalized.humidity,
      pressure: normalized.pressure,
      batteryVoltage: normalized.batteryVoltage,
      motion: normalized.motion,
      deviceStatus: normalized.deviceStatus,
      transport: normalized.transport,
      lat: normalized.lat,
      lng: normalized.lng,
      locationAccuracy: normalized.locationAccuracy,
      locationSource: normalized.locationSource,
      sourceFile: normalized.sourceFile,
    });

    const hasAirReading = normalized.aqi != null
      || normalized.pm1 != null
      || normalized.pm25 != null
      || normalized.pm4 != null
      || normalized.pm10 != null;
    const storedReading = hasAirReading
      ? await storeReading({
          deviceId: normalized.publicDeviceId,
          timestamp: normalized.capturedAt,
          aqi: normalized.aqi,
          gasRaw: null,
          gasVoltage: null,
          airState: null,
          rssi: null,
          firmwareVersion: normalized.firmwareVersion,
          uptimeMs: null,
          sample: null,
          transport: "notehub",
          rawPayload: normalized.sanitizedPayload,
        })
      : false;

    return NextResponse.json({
      ok: true,
      deviceId: normalized.publicDeviceId,
      telemetryStored: true,
      readingStored: storedReading ? storedReading.outcome === "stored" : false,
      readingOutcome: storedReading ? storedReading.outcome : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid event";
    const status = message === "unexpected Notehub product" ? 403 : 400;
    console.error("[notehub] rejected event:", message);
    return NextResponse.json({ error: "invalid Notehub event" }, { status });
  }
}
