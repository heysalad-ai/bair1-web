import {
  measurementFields,
  measurementFreshness,
  observationLabel,
} from "./measurement-contract";

export type DeviceMeasurement = Record<string, string | number | null>;
export type DeviceSnapshot = {
  reading: DeviceMeasurement | null;
  telemetry: DeviceMeasurement | null;
};
export type SnapshotEntry =
  | { status: "ready"; snapshot: DeviceSnapshot }
  | { status: "error"; message: string };
export const DEVICE_PAGE_SIZE = 24;
export const SNAPSHOT_BATCH_SIZE = 4;

export function dashboardHref(deviceId?: string, view = "home") {
  const query = new URLSearchParams();
  if (deviceId) query.set("device", deviceId);
  if (view !== "home") query.set("view", view);
  return `/dashboard${query.size ? `?${query}` : ""}`;
}

/** A recent gateway receipt must never make an old sensor value look fresh. */
export function deviceOverview(snapshot: DeviceSnapshot, now: number) {
  for (const field of measurementFields) {
    const fromReading = typeof snapshot.reading?.[field.field] === "number";
    const source = fromReading ? snapshot.reading : snapshot.telemetry;
    const value = source?.[field.field];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (
      field.field === "pressure" &&
      !fromReading &&
      source?.pressureUnit !== "hPa"
    )
      continue;
    const capturedAt = fromReading
      ? source?.capturedAt
      : source?.[`${field.field}At`];
    const time =
      typeof capturedAt === "string" && Number.isFinite(Date.parse(capturedAt))
        ? capturedAt
        : null;
    const freshness = time ? measurementFreshness(time, now) : "unknown";
    const labels = {
      live: "Recent data",
      delayed: "Delayed data",
      offline: "No recent data",
      historical: "Historical data",
      unknown: "Capture time unknown",
      waiting: "Waiting for data",
    };
    return {
      value: value.toFixed(field.digits),
      label: field.label,
      unit: field.unit,
      freshness,
      status: labels[freshness],
      age: time ? observationLabel(time, now) : "Capture time unknown",
    };
  }
  if (snapshot.reading || snapshot.telemetry) {
    const capturedAt =
      snapshot.reading?.capturedAt || snapshot.telemetry?.measurementAt;
    const knownTime =
      typeof capturedAt === "string" && Number.isFinite(Date.parse(capturedAt));
    return {
      value: "—",
      label: "Measurement",
      unit: "",
      freshness: "unknown",
      status: "No measurements reported",
      age: knownTime
        ? `Record: ${observationLabel(capturedAt as string, now)}`
        : snapshot.telemetry?.receivedAt
          ? "Connection event only"
          : "Capture time unknown",
    };
  }
  return {
    value: "—",
    label: "Measurement",
    unit: "",
    freshness: "waiting",
    status: "No readings yet",
    age: "Waiting for the first measurement",
  };
}

/** Variables carry IDs; no client-supplied identity is interpolated into GraphQL. */
export function snapshotBatchQuery(ids: string[]) {
  if (!ids.length || ids.length > SNAPSHOT_BATCH_SIZE)
    throw new RangeError("Invalid snapshot batch size");
  return {
    query: `query DeviceOverview(${ids.map((_, i) => `$id${i}: String!`).join(", ")}) { ${ids.map((_, i) => `r${i}: latestReading(deviceId: $id${i}) { capturedAt receivedAt ${measurementFields.map((field) => field.field).join(" ")} } t${i}: notecardTelemetry(deviceId: $id${i}) { measurementAt receivedAt temperature humidity pressure pressureUnit batteryVoltage temperatureAt humidityAt pressureAt batteryVoltageAt }`).join(" ")} }`,
    variables: Object.fromEntries(ids.map((id, i) => [`id${i}`, id])),
  };
}

export function decodeSnapshotBatch(
  ids: string[],
  result: {
    data?: Record<string, DeviceMeasurement | null>;
    errors?: { path?: (string | number)[]; extensions?: { code?: string } }[];
  },
  httpStatus: number,
): Record<string, SnapshotEntry> {
  return Object.fromEntries(
    ids.map((id, i) => {
      const errors =
        result.errors?.filter(
          (error) =>
            !error.path?.length ||
            [`r${i}`, `t${i}`].includes(String(error.path[0])),
        ) ?? [];
      const denied =
        [401, 403, 404].includes(httpStatus) ||
        errors.some((error) =>
          ["NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN"].includes(
            error.extensions?.code ?? "",
          ),
        );
      if (
        httpStatus !== 200 ||
        errors.length ||
        !result.data ||
        !(`r${i}` in result.data) ||
        !(`t${i}` in result.data)
      )
        return [
          id,
          {
            status: "error",
            message: denied
              ? "Access changed. Refresh your devices."
              : "Readings unavailable. Try refreshing.",
          },
        ];
      return [
        id,
        {
          status: "ready",
          snapshot: {
            reading: result.data[`r${i}`],
            telemetry: result.data[`t${i}`],
          },
        },
      ];
    }),
  );
}

/** Keep device bookmarks through sign-in; never accept an external return URL. */
export function dashboardReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      url.origin !== "https://internal.invalid" ||
      !["/", "/dashboard"].includes(url.pathname)
    )
      return null;
    const id = url.searchParams.get("device");
    const view = url.searchParams.get("view") ?? "home";
    return dashboardHref(
      id && id.length <= 128 ? id : undefined,
      ["map", "analytics", "ai", "developer", "admin"].includes(view)
        ? view
        : "home",
    );
  } catch {
    return null;
  }
}
