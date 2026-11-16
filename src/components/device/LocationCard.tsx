"use client";

import BearFigure from "@/components/bear/BearFigure";
import { Icon } from "@/components/ui/kit";

type Reading = Record<string, string | number | null> | null;

export function validCoordinates(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Shows only recorded coordinates: a position reported with the latest stored
 * reading, otherwise the registered position. Never a default city, never
 * described as a live GPS fix.
 */
export default function LocationCard({
  lat,
  lng,
  reading,
}: {
  lat: number | null;
  lng: number | null;
  reading: Reading;
}) {
  const reported = validCoordinates(reading?.lat, reading?.lng);
  const latitude = reported ? Number(reading?.lat) : lat;
  const longitude = reported ? Number(reading?.lng) : lng;
  const valid = validCoordinates(latitude, longitude);
  const la = Number(latitude);
  const lo = Number(longitude);
  const query = new URLSearchParams({
    bbox: `${Math.max(-180, lo - 0.015)},${Math.max(-90, la - 0.01)},${Math.min(180, lo + 0.015)},${Math.min(90, la + 0.01)}`,
    layer: "mapnik",
    marker: `${la},${lo}`,
  });
  return (
    <section className="b1-card b1-card-pad" aria-labelledby="location-title">
      <div className="flex items-center gap-2">
        <span className="text-[var(--b1-primary)]">{Icon.pin}</span>
        <h2 id="location-title" className="b1-h2">
          Location
        </h2>
      </div>
      {valid ? (
        <>
          <p className="b1-sub mt-1">
            {reported
              ? "Reported with the latest stored reading — it may be historical, not a live GPS fix."
              : "Registered position for this unit — not a reported or live GPS position."}
          </p>
          <iframe
            className="mt-4 h-64 w-full rounded-xl border-0 bg-[var(--b1-bg)]"
            title="Recorded unit position on OpenStreetMap"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={`https://www.openstreetmap.org/export/embed.html?${query}`}
          />
          <p className="mt-3 text-xs text-[var(--b1-muted)]">
            <a
              className="b1-focus underline underline-offset-4"
              href={`https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=15/${la}/${lo}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in OpenStreetMap
            </a>{" "}
            · {la.toFixed(5)}, {lo.toFixed(5)}
            {reported && typeof reading?.locationAccuracy === "number"
              ? ` · ±${Math.round(reading.locationAccuracy)} m reported`
              : ""}
          </p>
        </>
      ) : (
        <div className="mt-4 flex items-center gap-4">
          <BearFigure mood="empty" size={56} />
          <p className="b1-sub">
            No location has been recorded for this unit. Its readings are still available without one.
          </p>
        </div>
      )}
    </section>
  );
}
