"use client";

import type { Measurement } from "./MeasurementView";
function coordinates(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
export default function DeviceLocation({
  lat,
  lng,
  reading,
}: {
  lat: number | null;
  lng: number | null;
  reading: Measurement | null;
}) {
  const reported = coordinates(reading?.lat, reading?.lng);
  const latitude = reported ? Number(reading?.lat) : lat;
  const longitude = reported ? Number(reading?.lng) : lng;
  const valid = coordinates(latitude, longitude);
  const marker = `${latitude},${longitude}`;
  const query = new URLSearchParams({
    bbox: `${Math.max(-180, Number(longitude) - 0.015)},${Math.max(-90, Number(latitude) - 0.01)},${Math.min(180, Number(longitude) + 0.015)},${Math.min(90, Number(latitude) + 0.01)}`,
    layer: "mapnik",
    marker,
  });
  return (
    <section
      className="device-location"
      aria-labelledby="device-location-title"
    >
      <h2 id="device-location-title" className="text-2xl font-semibold">
        Device location
      </h2>
      {valid ? (
        <>
          <p className="my-4 text-sm text-muted">
            {reported
              ? "Position from the latest stored reading; this may be historical."
              : "Registered position; this is not a live GPS fix."}
          </p>
          <iframe
            className="h-72 w-full rounded-xl border-0"
            title="Device position on OpenStreetMap"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={`https://www.openstreetmap.org/export/embed.html?${query}`}
          />
          <p className="mt-3 text-sm">
            <a
              className="underline underline-offset-4"
              href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open location map
            </a>{" "}
            · {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </p>
        </>
      ) : (
        <p className="mt-4 text-muted">
          No location has been recorded for this unit. Sensor readings remain
          available without a GPS fix.
        </p>
      )}
    </section>
  );
}
