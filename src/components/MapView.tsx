"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getAqiColor } from "@/lib/aqi";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface SensorPin {
  deviceId: string;
  name: string;
  aqi: number | null;
  lat: number;
  lng: number;
  location: string;
  status: string;
}

interface TrailPoint {
  timestamp: string;
  lat: number;
  lng: number;
  aqi: number | null;
}

const legend = [
  { label: "Good", color: "#8DC44A", range: "0-50" },
  { label: "Moderate", color: "#F5C542", range: "51-100" },
  { label: "Sensitive", color: "#ED8B00", range: "101-150" },
  { label: "Unhealthy", color: "#D63031", range: "151+" },
];

const REFRESH_INTERVAL = 15000; // 15 seconds

export default function MapView({ deviceId }: { deviceId?: string }) {
  const authenticatedFetch = useAuthenticatedFetch();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [sensors, setSensors] = useState<SensorPin[]>([]);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(deviceId ?? null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [trailHours, setTrailHours] = useState(24);

  const fetchDevices = useCallback(async () => {
    try {
      const query = `{
        registeredDevices {
          deviceId name location lat lng status
          latestReading { aqi timestamp lat lng }
        }
      }`;
      const res = await authenticatedFetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      const devices = (json.data?.registeredDevices ?? []).filter((d: SensorPin) => !deviceId || d.deviceId === deviceId);
      const pins: SensorPin[] = devices
        .filter((d: any) => {
          // Use latest reading's lat/lng if available, else device's registered lat/lng
          const lat = d.latestReading?.lat ?? d.lat;
          const lng = d.latestReading?.lng ?? d.lng;
          return lat != null && lng != null;
        })
        .map((d: any) => ({
          deviceId: d.deviceId,
          name: d.name,
          aqi: d.latestReading?.aqi ?? null,
          lat: d.latestReading?.lat ?? d.lat,
          lng: d.latestReading?.lng ?? d.lng,
          location: d.location,
          status: d.status,
        }));
      setSensors(pins);
      if (pins.length > 0 && !selectedDevice) {
        setSelectedDevice(pins[0].deviceId);
      }
      setLastRefresh(new Date());
    } catch {}
    setLoading(false);
  }, [authenticatedFetch, selectedDevice, deviceId]);

  // Fetch location trail for selected device
  const fetchTrail = useCallback(async () => {
    if (!selectedDevice) return;
    try {
      const now = new Date();
      const from = new Date(now.getTime() - trailHours * 3600000);
      const query = `{
        locationTrail(
          deviceId: "${selectedDevice}"
          from: "${from.toISOString()}"
          to: "${now.toISOString()}"
        ) { timestamp lat lng aqi }
      }`;
      const res = await authenticatedFetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setTrail(json.data?.locationTrail ?? []);
    } catch {}
  }, [authenticatedFetch, selectedDevice, trailHours]);

  // Initial load
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Auto-refresh when tracking
  useEffect(() => {
    if (!tracking) return;
    const interval = setInterval(() => {
      fetchDevices();
      fetchTrail();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [tracking, fetchDevices, fetchTrail]);

  // Fetch trail when device changes
  useEffect(() => {
    fetchTrail();
  }, [fetchTrail]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN || map.current) return;
    if (loading) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center: [number, number] =
      sensors.length > 0
        ? [sensors[0].lng, sensors[0].lat]
        : [-0.06, 51.525];

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: sensors.length > 0 ? 13 : 13,
      attributionControl: false,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      // Add trail source and layer
      map.current!.addSource("trail", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Trail line
      map.current!.addLayer({
        id: "trail-line",
        type: "line",
        source: "trail",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#8DC44A",
          "line-width": 3,
          "line-opacity": 0.7,
        },
      });

      // Trail dots
      map.current!.addSource("trail-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.current!.addLayer({
        id: "trail-dots",
        type: "circle",
        source: "trail-points",
        paint: {
          "circle-radius": 4,
          "circle-color": ["get", "color"],
          "circle-stroke-color": "rgba(255,255,255,0.8)",
          "circle-stroke-width": 1,
        },
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers when sensors change
  useEffect(() => {
    if (!map.current) return;

    const currentIds = new Set(sensors.map((s) => s.deviceId));

    // Remove old markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update markers
    sensors.forEach((sensor) => {
      const color = getAqiColor(sensor.aqi);
      const existing = markersRef.current.get(sensor.deviceId);

      if (existing) {
        // Smooth animate to new position
        existing.setLngLat([sensor.lng, sensor.lat]);
        const el = existing.getElement();
        el.style.background = color;
        el.style.boxShadow = `0 0 12px ${color}, 0 2px 8px rgba(0,0,0,0.3)`;
        el.textContent = sensor.aqi == null ? "•" : String(sensor.aqi);
      } else {
        const el = document.createElement("div");
        el.className = "bair1-marker";
        el.style.cssText = `
          width: 40px; height: 40px; border-radius: 50%;
          background: ${color}; border: 3px solid rgba(255,255,255,0.9);
          box-shadow: 0 0 12px ${color}, 0 2px 8px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: #fff;
          cursor: pointer; transition: all 0.3s ease;
        `;
        el.textContent = sensor.aqi == null ? "•" : String(sensor.aqi);
        el.onmouseenter = () => (el.style.transform = "scale(1.2)");
        el.onmouseleave = () => (el.style.transform = "scale(1)");

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([sensor.lng, sensor.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
              <div style="font-family: system-ui; padding: 4px 0;">
                <div style="font-weight: 700; font-size: 14px;">${sensor.name}</div>
                <div style="font-size: 12px; color: #666; margin-top: 2px;">${sensor.aqi == null ? "Environmental telemetry" : `AQI ${sensor.aqi}`} · ${sensor.location}</div>
                <div style="font-size: 11px; color: #999; margin-top: 2px;">${sensor.lat.toFixed(4)}, ${sensor.lng.toFixed(4)}</div>
              </div>
            `)
          )
          .addTo(map.current!);

        markersRef.current.set(sensor.deviceId, marker);
      }
    });

    // Pan to latest position if tracking
    if (tracking && sensors.length > 0) {
      const target = sensors.find((s) => s.deviceId === selectedDevice) ?? sensors[0];
      map.current.easeTo({
        center: [target.lng, target.lat],
        duration: 1000,
      });
    }
  }, [sensors, tracking, selectedDevice]);

  // Update trail on map
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    const trailSource = map.current.getSource("trail") as mapboxgl.GeoJSONSource | undefined;
    const pointsSource = map.current.getSource("trail-points") as mapboxgl.GeoJSONSource | undefined;

    if (trail.length > 1 && trailSource) {
      const coordinates = trail.map((p) => [p.lng, p.lat]);
      trailSource.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {},
      });
    }

    if (trail.length > 0 && pointsSource) {
      pointsSource.setData({
        type: "FeatureCollection",
        features: trail.map((p) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
          properties: {
            aqi: p.aqi,
            color: getAqiColor(p.aqi),
            timestamp: new Date(p.timestamp).toLocaleTimeString(),
          },
        })),
      });
    }
  }, [trail]);

  const timeSince = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);

  return (
    <div className="tab-content-enter px-4 pb-28">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold">Live Map</h2>
        <div className="flex items-center gap-2">
          {sensors.length > 0 && (
            <span className="text-[10px] font-medium bg-bair-green/15 text-bair-green/80 rounded-full px-2 py-0.5">
              {sensors.length} sensor{sensors.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={() => setTracking((t) => !t)}
            className={`text-[10px] font-medium rounded-full px-2 py-0.5 transition-colors ${
              tracking
                ? "bg-primary/20 text-primary"
                : "bg-surface text-muted border border-border"
            }`}
          >
            {tracking ? "LIVE" : "PAUSED"}
          </button>
        </div>
      </div>
      <p className="text-sm text-muted mb-3">
        {tracking
          ? `Auto-refreshing every ${REFRESH_INTERVAL / 1000}s · Updated ${timeSince}s ago`
          : "Tracking paused — tap PAUSED to resume"}
      </p>

      {/* Device selector for trail */}
      {sensors.length > 1 && (
        <div className="relative mb-3">
          <select
            value={selectedDevice ?? ""}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="h-9 w-full appearance-none rounded-lg border border-border bg-surface/70 px-3 pr-9 text-sm font-medium text-ink/85 outline-none transition-colors hover:border-primary/30 focus:border-primary/50 focus:bg-surface"
          >
            {sensors.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>
                {s.name} - AQI {s.aqi}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted/60"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* Map */}
      {MAPBOX_TOKEN ? (
        <div
          ref={mapContainer}
          className="rounded-2xl overflow-hidden mb-4"
          style={{ height: 380 }}
        />
      ) : (
        <div
          className="bg-forest-night/5 rounded-2xl flex items-center justify-center mb-4"
          style={{ height: 380 }}
        >
          <p className="text-sm text-muted">Map token not configured</p>
        </div>
      )}

      {/* Trail controls & info */}
      <div className="bg-surface border border-border rounded-xl p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-muted uppercase">Location Trail</div>
          <div className="flex gap-1">
            {[2, 6, 12, 24, 48, 168].map((h) => (
              <button
                key={h}
                onClick={() => setTrailHours(h)}
                className={`text-[10px] font-medium rounded-full px-2 py-0.5 transition-colors ${
                  trailHours === h
                    ? "bg-primary/20 text-primary"
                    : "bg-surface text-muted border border-border hover:border-primary/30"
                }`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
        </div>
        {trail.length > 0 ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-ink">
              {trail.length} point{trail.length !== 1 ? "s" : ""}
            </div>
            <div className="text-right">
              <div className="text-xs font-mono text-ink">
                {trail[trail.length - 1].lat.toFixed(4)}, {trail[trail.length - 1].lng.toFixed(4)}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted">No location data in this range</div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-3 mb-4 justify-center">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: l.color }}
            />
            <span className="text-xs text-muted/70">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Sensor list */}
      {sensors.length > 0 && (
        <div className="flex flex-col gap-2">
          {sensors.map((sensor) => (
            <div
              key={sensor.deviceId}
              onClick={() => {
                setSelectedDevice(sensor.deviceId);
                if (map.current) {
                  map.current.flyTo({ center: [sensor.lng, sensor.lat], zoom: 14, duration: 1000 });
                }
              }}
              className={`flex items-center gap-3 bg-surface border rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                selectedDevice === sensor.deviceId
                  ? "border-primary/50"
                  : "border-border hover:border-primary/30"
              }`}
            >
              <div
                className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: getAqiColor(sensor.aqi) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{sensor.name}</div>
                <div className="text-xs text-muted">
                  {sensor.lat.toFixed(4)}, {sensor.lng.toFixed(4)}
                </div>
              </div>
              <div
                className="text-lg font-bold"
                style={{ color: getAqiColor(sensor.aqi) }}
              >
                {sensor.aqi ?? "No AQI"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
