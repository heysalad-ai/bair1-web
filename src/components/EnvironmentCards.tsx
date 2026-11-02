"use client";

import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { useState, useEffect } from "react";

interface EnvData {
  airQuality: any;
  pollen: any[];
  weather: any;
  address: string | null;
  fetchedAt: string;
}

interface Props {
  lat: number | null;
  lng: number | null;
}

export default function EnvironmentCards({ lat, lng }: Props) {
  const authenticatedFetch = useAuthenticatedFetch();
  const [data, setData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    setLoading(true);
    authenticatedFetch(`/api/environment?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lat, lng, authenticatedFetch]);

  if (lat == null || lng == null) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 text-center">
        <p className="text-xs text-muted">Waiting for sensor location...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-xl p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const googleAqi = data.airQuality?.indexes?.[0];
  const weather = data.weather;
  const pollen = data.pollen?.[0]?.pollenTypeInfo;
  const healthRecs = data.airQuality?.healthRecommendations;

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Google AQI comparison */}
      {googleAqi && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Google AQI</span>
            <span className="text-xs text-muted/60">Official Index</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold" style={{ color: `rgb(${googleAqi.color?.red ?? 0}, ${googleAqi.color?.green ?? 0}, ${googleAqi.color?.blue ?? 0})` }}>
              {googleAqi.aqi}
            </div>
            <div>
              <div className="text-sm font-medium text-ink">{googleAqi.category}</div>
              <div className="text-xs text-muted">Dominant: {googleAqi.dominantPollutant}</div>
            </div>
          </div>
        </div>
      )}

      {/* Pollutants */}
      {data.airQuality?.pollutants && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Pollutants</div>
          <div className="grid grid-cols-3 gap-2">
            {data.airQuality.pollutants.slice(0, 6).map((p: any) => (
              <div key={p.code} className="text-center">
                <div className="text-lg font-bold text-ink">{p.concentration.value.toFixed(1)}</div>
                <div className="text-[10px] text-muted uppercase">{p.code}</div>
                <div className="text-[9px] text-muted/50">{p.concentration.units}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weather */}
      {weather && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Weather</div>
          <div className="grid grid-cols-2 gap-3">
            {weather.temperature && (
              <div>
                <div className="text-2xl font-bold text-ink">{Math.round(weather.temperature.degrees)}&deg;</div>
                <div className="text-xs text-muted">Temperature</div>
              </div>
            )}
            {weather.humidity && (
              <div>
                <div className="text-2xl font-bold text-ink">{weather.humidity.percent}%</div>
                <div className="text-xs text-muted">Humidity</div>
              </div>
            )}
            {weather.wind && (
              <div>
                <div className="text-2xl font-bold text-ink">{weather.wind.speed.value.toFixed(0)}</div>
                <div className="text-xs text-muted">Wind {weather.wind.direction?.cardinal} {weather.wind.speed.unit}</div>
              </div>
            )}
            {weather.uvIndex != null && (
              <div>
                <div className="text-2xl font-bold text-ink">{weather.uvIndex}</div>
                <div className="text-xs text-muted">UV Index</div>
              </div>
            )}
          </div>
          {weather.weatherCondition?.description?.text && (
            <div className="mt-2 text-xs text-muted/70">{weather.weatherCondition.description.text}</div>
          )}
        </div>
      )}

      {/* Pollen */}
      {pollen && pollen.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Pollen</div>
          <div className="flex gap-4">
            {pollen.map((p: any) => {
              const val = p.indexInfo?.value ?? 0;
              const colors = ["#8DC44A", "#8DC44A", "#F5C542", "#ED8B00", "#D63031", "#6C3483"];
              return (
                <div key={p.code} className="flex-1 text-center">
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-1 flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: colors[Math.min(val, 5)] }}
                  >
                    {val}
                  </div>
                  <div className="text-xs font-medium text-ink">{p.displayName}</div>
                  <div className="text-[10px] text-muted">
                    {p.inSeason ? p.indexInfo?.category : "Off season"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Health recommendations */}
      {healthRecs && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Health Tips</div>
          {Object.entries(healthRecs).slice(0, 3).map(([group, tip]) => (
            <div key={group} className="mb-2 last:mb-0">
              <div className="text-[10px] text-muted uppercase">{group.replace(/([A-Z])/g, " $1").trim()}</div>
              <div className="text-xs text-ink/80">{String(tip)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Location */}
      {data.address && (
        <div className="text-center">
          <div className="text-[10px] text-muted/50">{data.address}</div>
        </div>
      )}
    </div>
  );
}
