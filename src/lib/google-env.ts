const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

interface LatLng {
  lat: number;
  lng: number;
}

// --- Air Quality API ---

export interface AqiCondition {
  dateTime: string;
  indexes: {
    code: string;
    displayName: string;
    aqi: number;
    aqiDisplay: string;
    color: { red?: number; green?: number; blue?: number };
    category: string;
    dominantPollutant: string;
  }[];
  pollutants: {
    code: string;
    displayName: string;
    fullName: string;
    concentration: { value: number; units: string };
  }[];
  healthRecommendations?: Record<string, string>;
}

export async function getAirQuality(location: LatLng): Promise<AqiCondition | null> {
  if (!GOOGLE_API_KEY) return null;
  const res = await fetch(
    `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: { latitude: location.lat, longitude: location.lng },
        universalAqi: true,
        extraComputations: [
          "HEALTH_RECOMMENDATIONS",
          "DOMINANT_POLLUTANT_CONCENTRATION",
          "POLLUTANT_CONCENTRATION",
          "LOCAL_AQI",
        ],
      }),
      next: { revalidate: 1800 },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data as AqiCondition;
}

export async function getAirQualityForecast(
  location: LatLng,
  hours = 24
): Promise<AqiCondition[]> {
  if (!GOOGLE_API_KEY) return [];
  const res = await fetch(
    `https://airquality.googleapis.com/v1/forecast:lookup?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: { latitude: location.lat, longitude: location.lng },
        period: { startTime: new Date().toISOString(), endTime: new Date(Date.now() + hours * 3600000).toISOString() },
        universalAqi: true,
        extraComputations: ["HEALTH_RECOMMENDATIONS", "POLLUTANT_CONCENTRATION"],
      }),
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.hourlyForecasts ?? [];
}

// --- Pollen API ---

export interface PollenForecast {
  date: { year: number; month: number; day: number };
  pollenTypeInfo: {
    code: string;
    displayName: string;
    indexInfo: {
      code: string;
      displayName: string;
      value: number;
      category: string;
      indexDescription: string;
      color: { red?: number; green?: number; blue?: number };
    };
    healthRecommendations?: string[];
    inSeason: boolean;
  }[];
  plantInfo?: {
    code: string;
    displayName: string;
    indexInfo: { value: number; category: string };
    inSeason: boolean;
  }[];
}

export async function getPollenForecast(
  location: LatLng,
  days = 3
): Promise<PollenForecast[]> {
  if (!GOOGLE_API_KEY) return [];
  const res = await fetch(
    `https://pollen.googleapis.com/v1/forecast:lookup?key=${GOOGLE_API_KEY}&location.latitude=${location.lat}&location.longitude=${location.lng}&days=${days}`,
    { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.dailyInfo ?? [];
}

// --- Weather API ---

export interface WeatherCondition {
  temperature?: { degrees: number; unit: string };
  feelsLike?: { degrees: number; unit: string };
  humidity?: { percent: number };
  wind?: { speed: { value: number; unit: string }; direction: { degrees: number; cardinal: string } };
  uvIndex?: number;
  pressure?: { value: number; unit: string };
  visibility?: { value: number; unit: string };
  cloudCover?: number;
  precipitation?: { probability: { percent: number }; qpf?: { quantity: number; unit: string } };
  currentConditionsHistory?: { dateTime: string; description: string; iconCode: string };
  isDaytime?: boolean;
  weatherCondition?: { iconBaseUri: string; description: { text: string } };
}

export async function getWeather(location: LatLng): Promise<WeatherCondition | null> {
  if (!GOOGLE_API_KEY) return null;
  const res = await fetch(
    `https://weather.googleapis.com/v1/currentConditions:lookup?key=${GOOGLE_API_KEY}&location.latitude=${location.lat}&location.longitude=${location.lng}`,
    { signal: AbortSignal.timeout(8000), next: { revalidate: 1800 } }
  );
  if (!res.ok) return null;
  return res.json();
}

export async function getWeatherForecast(
  location: LatLng,
  hours = 24
): Promise<any[]> {
  if (!GOOGLE_API_KEY) return [];
  const res = await fetch(
    `https://weather.googleapis.com/v1/forecast/hours:lookup?key=${GOOGLE_API_KEY}&location.latitude=${location.lat}&location.longitude=${location.lng}&hours=${hours}`,
    { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.forecastHours ?? [];
}

// --- Geocoding API ---

export async function reverseGeocode(
  location: LatLng
): Promise<string | null> {
  if (!GOOGLE_API_KEY) return null;
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${GOOGLE_API_KEY}`,
    { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0]?.formatted_address ?? null;
}

// --- Heatmap tile URLs ---

export function aqiHeatmapTileUrl(
  mapType: string,
  zoom: number,
  x: number,
  y: number
): string {
  return `https://airquality.googleapis.com/v1/mapTypes/${mapType}/heatmapTiles/${zoom}/${x}/${y}?key=${GOOGLE_API_KEY}`;
}

export function pollenHeatmapTileUrl(
  mapType: string,
  zoom: number,
  x: number,
  y: number
): string {
  return `https://pollen.googleapis.com/v1/mapTypes/${mapType}/heatmapTiles/${zoom}/${x}/${y}?key=${GOOGLE_API_KEY}`;
}
