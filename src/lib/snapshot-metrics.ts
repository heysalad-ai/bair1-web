import { measurementFields, type MeasurementField } from "./measurement-contract";
import type { DeviceSnapshot } from "./device-overview";

export type SnapshotMetric = {
  field: MeasurementField;
  label: string;
  unit: string;
  digits: number;
  /** null when the unit is unconfirmed (pressure from telemetry without hPa). */
  value: number | null;
  capturedAt: string | null;
  source: "reading" | "telemetry";
  unconfirmed: boolean;
};

/**
 * Measurements actually present in the latest snapshot, in contract order.
 * Sensor readings win over gateway telemetry; zero is a real value.
 */
export function snapshotMetrics(snapshot: DeviceSnapshot | null | undefined) {
  const result: SnapshotMetric[] = [];
  if (!snapshot) return result;
  for (const item of measurementFields) {
    const fromReading = snapshot.reading?.[item.field];
    const fromTelemetry = snapshot.telemetry?.[item.field];
    const useReading = typeof fromReading === "number" && Number.isFinite(fromReading);
    const raw = useReading ? fromReading : fromTelemetry;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const unconfirmed =
      item.field === "pressure" &&
      !useReading &&
      snapshot.telemetry?.pressureUnit !== "hPa";
    const at = useReading
      ? snapshot.reading?.capturedAt
      : snapshot.telemetry?.[`${item.field}At`];
    result.push({
      field: item.field,
      label: item.label,
      unit: item.unit,
      digits: item.digits,
      value: unconfirmed ? null : raw,
      capturedAt:
        typeof at === "string" && Number.isFinite(Date.parse(at)) ? at : null,
      source: useReading ? "reading" : "telemetry",
      unconfirmed,
    });
  }
  return result;
}

export function formatValue(value: number | null | undefined, digits: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "—";
}

/** Short labels for compact secondary readings on unit cards. */
export const shortLabels: Partial<Record<MeasurementField, string>> = {
  temperature: "Temp",
  humidity: "RH",
  pressure: "Pressure",
  batteryVoltage: "Battery",
  altitudeMeters: "Altitude",
};
