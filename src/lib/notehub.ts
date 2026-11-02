import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const notehubEventSchema = z
  .object({
    event: z.string().optional(),
    device: z.string().min(1),
    best_id: z.string().optional(),
    sn: z.string().optional(),
    product: z.string().optional(),
    file: z.string().optional(),
    when: z.union([z.number(), z.string()]).optional(),
    received: z.union([z.number(), z.string()]).optional(),
    body: z.record(z.string(), z.unknown()).optional().default({}),
    best_lat: z.number().optional(),
    best_lon: z.number().optional(),
    best_location_type: z.string().optional(),
    transport: z.string().optional(),
  })
  .passthrough();

export type NormalizedNotehubEvent = {
  publicDeviceId: string;
  product: string | null;
  sourceFile: string | null;
  capturedAt: string;
  captureKnown: boolean;
  eventId?: string;
  receivedAt: string;
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  pressureUnit: "hPa" | "unknown";
  batteryVoltage: number | null;
  motion: number | null;
  deviceStatus: string | null;
  transport: string | null;
  pm1: number | null;
  pm25: number | null;
  pm4: number | null;
  pm10: number | null;
  aqi: number | null;
  lat: number | null;
  lng: number | null;
  locationAccuracy: number | null;
  locationSource: string | null;
  firmwareVersion: string | null;
  sanitizedPayload: Record<string, unknown>;
};

function numeric(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (
      ["number", "string"].includes(typeof value) &&
      String(value).trim() !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }
  return null;
}

function timestamp(value: number | string | undefined): string | null {
  const millis =
    typeof value === "number"
      ? value > 10_000_000_000
        ? value
        : value * 1000
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;
  return Number.isFinite(millis) &&
    millis >= Date.UTC(2020, 0, 1) &&
    millis <= Date.now() + 60000
    ? new Date(millis).toISOString()
    : null;
}

function safeEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function verifyNotehubSecret(headers: Headers, expected: string) {
  const authorization = headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;
  const supplied = headers.get("x-notehub-route-secret") ?? bearer;
  return Boolean(supplied && safeEqual(supplied, expected));
}

export function pseudonymousNotecardId(deviceUid: string, salt: string) {
  const digest = createHmac("sha256", salt)
    .update(deviceUid)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `NOTECARD-${digest}`;
}

export function normalizeNotehubEvent(
  input: unknown,
  options: { idSalt: string; expectedProduct?: string },
): NormalizedNotehubEvent {
  const event = notehubEventSchema.parse(input);
  if (options.expectedProduct && event.product !== options.expectedProduct) {
    throw new Error("unexpected Notehub product");
  }

  const body = event.body;
  const sourceFile = event.file ?? null;
  const isTemperatureEvent =
    sourceFile?.toLowerCase().includes("temp") ?? false;
  const temperature =
    numeric(body, "temperature", "temp", "temperatureC") ??
    (isTemperatureEvent ? numeric(body, "value") : null);
  const lat = numeric(body, "lat", "latitude") ?? event.best_lat ?? null;
  const lng =
    numeric(body, "lng", "lon", "longitude") ?? event.best_lon ?? null;
  const capture = timestamp(event.when);
  const receivedAt = new Date().toISOString();
  const capturedAt = capture ?? timestamp(event.received) ?? receivedAt;
  const captureKnown = capture != null;
  const pm1 = numeric(body, "pm1", "pm1_0");
  const pm25 = numeric(body, "pm25", "pm2_5", "pm2.5");
  const pm4 = numeric(body, "pm4", "pm4_0");
  const pm10 = numeric(body, "pm10", "pm10_0");
  const pressurePa = numeric(body, "pressurePa");
  const pressureHpa = numeric(body, "pressureHpa");
  const pressure =
    pressureHpa ??
    (pressurePa != null
      ? pressurePa / 100
      : body.pressureUnit === "hPa"
        ? numeric(body, "pressure")
        : body.pressureUnit === "Pa" && numeric(body, "pressure") != null
          ? numeric(body, "pressure")! / 100
          : null);
  const pressureUnit =
    pressure != null ? ("hPa" as const) : ("unknown" as const);
  const batteryVoltage = numeric(
    body,
    "batteryVoltage",
    "battery_voltage",
    "voltage",
  );
  const motion = numeric(body, "motion");
  const deviceStatus = body.status == null ? null : String(body.status);
  const transport = event.transport ?? "notehub";

  const sanitizedPayload: Record<string, unknown> = {
    capturedAt: capture,
    temperature,
    humidity: numeric(body, "humidity", "rh"),
    pressure,
    pressureUnit,
    batteryVoltage,
    motion,
    deviceStatus,
    pm1,
    pm25,
    pm4,
    pm10,
    aqi: numeric(body, "aqi"),
    lat,
    lng,
    locationAccuracy: numeric(body, "locationAccuracy", "accuracy"),
    locationSource: body.locationSource
      ? String(body.locationSource)
      : (event.best_location_type ?? "notecard"),
    sensorModel: body.sensorModel ? String(body.sensorModel) : null,
    board: body.board ? String(body.board) : "Blues Notecard",
    firmwareVersion: body.firmwareVersion ? String(body.firmwareVersion) : null,
    transport,
  };

  return {
    publicDeviceId: pseudonymousNotecardId(event.device, options.idSalt),
    product: event.product ?? null,
    sourceFile,
    capturedAt,
    captureKnown,
    eventId: event.event,
    receivedAt,
    temperature,
    humidity: numeric(body, "humidity", "rh"),
    pressure,
    pressureUnit,
    batteryVoltage,
    motion,
    deviceStatus,
    transport,
    pm1,
    pm25,
    pm4,
    pm10,
    aqi: numeric(body, "aqi"),
    lat,
    lng,
    locationAccuracy: numeric(body, "locationAccuracy", "accuracy"),
    locationSource: body.locationSource
      ? String(body.locationSource)
      : (event.best_location_type ?? "notecard"),
    firmwareVersion: body.firmwareVersion ? String(body.firmwareVersion) : null,
    sanitizedPayload,
  };
}
