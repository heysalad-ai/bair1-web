export type Freshness =
  | "waiting"
  | "live"
  | "delayed"
  | "offline"
  | "historical"
  | "unknown";
export function measurementFreshness(
  timestamp: string | null | undefined,
  now: number,
  expectedSeconds = 60,
): Freshness {
  if (!timestamp) return "waiting";
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || time > now + 60_000) return "unknown";
  const age = Math.max(0, (now - time) / 1000);
  if (age > 86400) return "historical";
  if (age > Math.max(expectedSeconds * 10, 600)) return "offline";
  return age <= Math.max(expectedSeconds * 2, 30) ? "live" : "delayed";
}
export function observationLabel(
  timestamp: string | null | undefined,
  now: number,
) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp)))
    return "No measurement yet";
  const seconds = Math.floor((now - Date.parse(timestamp)) / 1000);
  if (seconds < -60) return "Clock needs checking";
  if (seconds < 60) return "Less than a minute ago";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)} ${Math.floor(seconds / 3600) === 1 ? "hour" : "hours"} ago`;
  return new Date(timestamp).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
export const measurementFields = [
  { field: "pm25", label: "PM2.5", unit: "µg/m³", digits: 1 },
  { field: "pm1", label: "PM1", unit: "µg/m³", digits: 1 },
  { field: "pm4", label: "PM4", unit: "µg/m³", digits: 1 },
  { field: "pm10", label: "PM10", unit: "µg/m³", digits: 1 },
  { field: "temperature", label: "Temperature", unit: "°C", digits: 1 },
  { field: "humidity", label: "Humidity", unit: "% RH", digits: 1 },
  { field: "pressure", label: "Pressure", unit: "hPa", digits: 1 },
  { field: "altitudeMeters", label: "Altitude estimate", unit: "m", digits: 0 },
  { field: "adcD3PinVoltage", label: "D3 pin voltage", unit: "V", digits: 3 },
  { field: "adcD2PinVoltage", label: "D2 pin voltage", unit: "V", digits: 3 },
  {
    field: "adcD3InputVoltage",
    label: "D3 input estimate",
    unit: "V",
    digits: 3,
  },
  {
    field: "adcD2InputVoltage",
    label: "D2 input estimate",
    unit: "V",
    digits: 3,
  },
  { field: "adcD3Raw", label: "D3 ADC", unit: "counts", digits: 0 },
  { field: "adcD2Raw", label: "D2 ADC", unit: "counts", digits: 0 },
  { field: "batteryVoltage", label: "Battery", unit: "V", digits: 2 },
] as const;
export type MeasurementField = (typeof measurementFields)[number]["field"];

export function boundedRange(from: string, to: string) {
  const start = Date.parse(from),
    end = Date.parse(to);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start > end ||
    end - start > 14 * 86400000
  ) {
    throw new RangeError("Choose a valid range of up to 14 days");
  }
  return {
    from: new Date(start).toISOString(),
    to: new Date(end).toISOString(),
  };
}

export const readingSchemaVersion = 2;
export const readingFieldNames = [
  "deviceId",
  "timestamp",
  "capturedAt",
  "receivedAt",
  "clockQuality",
  "altitudeMeters",
  "adcD3Raw",
  "adcD2Raw",
  "adcD3PinVoltage",
  "adcD2PinVoltage",
  "adcD3InputVoltage",
  "adcD2InputVoltage",
  "aqi",
  "gasRaw",
  "gasVoltage",
  "airState",
  "rssi",
  "firmwareVersion",
  "uptimeMs",
  "sample",
  "transport",
  "lat",
  "lng",
  "locationAccuracy",
  "pm1",
  "pm25",
  "pm4",
  "pm10",
  "sensorModel",
  "board",
  "temperature",
  "humidity",
  "pressure",
  "dhtTemp",
  "dhtHum",
  "accelX",
  "accelY",
  "accelZ",
  "gyroX",
  "gyroY",
  "gyroZ",
  "batteryVoltage",
  "batteryLevel",
] as const;

/** Break chart lines across missing values or gaps over five minutes. */
export function historySeries(
  rows: Record<string, string | number | null>[],
  field: string,
) {
  const points = rows
    .map((row) => ({
      time: Date.parse(String(row.timestamp ?? "")),
      value:
        typeof row[field] === "number" && Number.isFinite(row[field])
          ? (row[field] as number)
          : null,
    }))
    .filter((point) => Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);
  const result: { time: number; value: number | null }[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && point.time - previous.time > 300000)
      result.push({ time: previous.time + 1, value: null });
    result.push(point);
  }
  return result;
}
