import { getDevice } from "./devices";
import { publicReading } from "./public-reading";
import { getReadings, getReadingsInRange, type Reading } from "./dynamo";

export type PublicFeedDevice = {
  deviceId: string;
  label: string;
  sensor: string;
  color: string;
};

export type PublicFeedReferenceDataset = {
  id: string;
  name: string;
  description: string;
  source: string;
  href: string;
  status: "connected" | "available" | "requires_key";
};

export type PublicFeedReferenceReading = {
  id: string;
  label: string;
  source: string;
  stationCode: string;
  stationName: string;
  distanceKm: number;
  timestamp: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  ozone: number | null;
  aqiBand: string | null;
};

export type PublicFeedReferenceStation = {
  id: string;
  source: string;
  stationCode: string;
  stationName: string;
  siteType: string;
  lat: number;
  lng: number;
  timestamp: string;
  pm25Index: number | null;
  pm25Band: string | null;
  pm10Index: number | null;
  pm10Band: string | null;
};

export type PublicFeed = {
  slug: string;
  title: string;
  location: string;
  description: string;
  referenceLocation: {
    label: string;
    lat: number;
    lng: number;
  };
  devices: PublicFeedDevice[];
  references: PublicFeedReferenceDataset[];
};

export type PublicFeedSnapshot = PublicFeed & {
  latest: Array<Reading & PublicFeedDevice>;
  readings: Array<Reading & PublicFeedDevice>;
  referenceReadings: PublicFeedReferenceReading[];
  referenceStations: PublicFeedReferenceStation[];
  updatedAt: string;
  filters: PublicFeedFilters;
};

export type PublicFeedFilters = {
  limit: number;
  from: string | null;
  to: string | null;
  devices: string[];
  pollutant: "pm25" | "pm10" | "pm1" | "aqi";
  includeReferences: boolean;
};

export const PUBLIC_FEEDS: Record<string, PublicFeed> = {
  kitchen: {
    slug: "kitchen",
    title: "Bair1 Kitchen Live Air",
    location: "HeySalad Kitchen",
    description: "Live PM readings from the Bair1 prototype bench.",
    referenceLocation: {
      label: "Somerset House",
      lat: 51.5111,
      lng: -0.1171,
    },
    devices: [
      {
        deviceId: "XIAO-SPS30-5EAA7A",
        label: "SPS30 reference",
        sensor: "Sensirion SPS30",
        color: "#60a5fa",
      },
      {
        deviceId: "BAIR1-MG24-SENSE-ACM1",
        label: "Plantower tower",
        sensor: "Plantower PMSA003I",
        color: "#f59e0b",
      },
      {
        deviceId: "QTPY-ESP32S3-AIR-ACM2",
        label: "BMV080 optical",
        sensor: "Bosch BMV080",
        color: "#34d399",
      },
    ],
    references: [
      {
        id: "laqn-ce2",
        name: "LAQN Somerset House reference",
        description:
          "Nearest active LAQN particulate monitor to Somerset House: CE2 Waterloo Place.",
        source: "Imperial ERG / London Air Quality Network",
        href: "https://api.erg.ic.ac.uk/AirQuality/help",
        status: "connected",
      },
      {
        id: "defra-uk-air",
        name: "DEFRA UK-AIR archive",
        description:
          "Official UK monitoring archive and compliance reference for PM2.5, PM10, NO2, ozone, and related pollutants.",
        source: "DEFRA UK-AIR",
        href: "https://uk-air.defra.gov.uk/data/",
        status: "available",
      },
      {
        id: "london-datastore",
        name: "London Datastore / LAEI",
        description:
          "Static London emissions inventory, borough datasets, maps, and policy reference layers.",
        source: "Greater London Authority",
        href: "https://data.london.gov.uk/air-quality",
        status: "available",
      },
      {
        id: "breathe-london",
        name: "Breathe London hyperlocal network",
        description:
          "High-density London sensor network. API access requires registration before live integration.",
        source: "Breathe London",
        href: "https://www.breathelondon.org/developers",
        status: "requires_key",
      },
    ],
  },
  saddlesense01: {
    slug: "saddlesense01",
    title: "Saddle Sense 01 — Portable SPS30",
    location: "Portable / iPhone hotspot",
    description:
      "Live PM readings from the ESP32-S3 + Sensirion SPS30 prototype board (battery + WiFi).",
    referenceLocation: {
      label: "London (approx.)",
      lat: 51.5074,
      lng: -0.1278,
    },
    devices: [
      {
        deviceId: "XIAO-SPS30-S3-8FEE68",
        label: "Saddle Sense 01",
        sensor: "Sensirion SPS30 (UART)",
        color: "#8C6234",
      },
    ],
    references: [
      {
        id: "defra-uk-air",
        name: "DEFRA UK-AIR archive",
        description:
          "Official UK monitoring archive for PM2.5, PM10, NO2, ozone.",
        source: "DEFRA UK-AIR",
        href: "https://uk-air.defra.gov.uk/data/",
        status: "available",
      },
    ],
  },
  saddlesense02: {
    slug: "saddlesense02",
    title: "Saddle Sense 02 — Genesis Mini Multi-Sensor",
    location: "Axiometa Genesis Mini (ESP32-S3)",
    description:
      "Live multi-sensor readings: PMSA003I (PM1/PM2.5/PM10), BME280 (temp/humidity/pressure), LSM6DS3 (accel/gyro), DHT11, battery. Axiometa Genesis Mini board.",
    referenceLocation: {
      label: "London (approx.)",
      lat: 51.5074,
      lng: -0.1278,
    },
    devices: [
      {
        deviceId: "GENESIS-BAIR1-F16E20",
        label: "Saddle Sense 02",
        sensor: "PMSA003I + BME280 + LSM6DS3 + DHT11",
        color: "#4A8A1A",
      },
    ],
    references: [
      {
        id: "defra-uk-air",
        name: "DEFRA UK-AIR archive",
        description:
          "Official UK monitoring archive for PM2.5, PM10, NO2, ozone.",
        source: "DEFRA UK-AIR",
        href: "https://uk-air.defra.gov.uk/data/",
        status: "available",
      },
    ],
  },
};

function withDevice(
  reading: Reading,
  device: PublicFeedDevice,
): Reading & PublicFeedDevice {
  return { ...publicReading(reading), ...device };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatLaqnDate(value: Date) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${String(value.getUTCDate()).padStart(2, "0")}${months[value.getUTCMonth()]}${value.getUTCFullYear()}`;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sampleAcrossRange<T>(values: T[], limit: number): T[] {
  if (values.length <= limit) return values;
  if (limit === 1) return [values.at(-1)!];

  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round((index * (values.length - 1)) / (limit - 1));
    return values[sourceIndex];
  });
}

function parseGmtTimestamp(value: string) {
  const normalized = value.replace(" ", "T");
  const withSeconds = /T\d{2}:\d{2}:\d{2}$/.test(normalized)
    ? normalized
    : `${normalized}:00`;
  return new Date(`${withSeconds}Z`).toISOString();
}

async function getSomersetHouseReference(): Promise<
  PublicFeedReferenceReading[]
> {
  const now = new Date();
  const start = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const url = `https://api.erg.ic.ac.uk/AirQuality/Data/Wide/Site/SiteCode=CE2/StartDate=${formatLaqnDate(start)}/EndDate=${formatLaqnDate(now)}/Json`;

  try {
    const [dataResponse, indexResponse] = await Promise.all([
      fetch(url, { next: { revalidate: 900 } }),
      fetch(
        "https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/SiteCode=CE2/Json",
        {
          next: { revalidate: 900 },
        },
      ),
    ]);

    if (!dataResponse.ok) return [];

    const dataJson = await dataResponse.json();
    const rows = asArray<Record<string, string>>(
      dataJson?.AirQualityData?.RawAQData?.Data,
    );
    const readings = rows
      .map((row) => ({
        timestamp: row["@MeasurementDateGMT"]
          ? parseGmtTimestamp(row["@MeasurementDateGMT"])
          : "",
        pm10: numberOrNull(row["@Data5"]),
        pm25: numberOrNull(row["@Data6"]),
        no2: numberOrNull(row["@Data2"]),
        ozone: numberOrNull(row["@Data4"]),
      }))
      .filter(
        (row) =>
          row.timestamp &&
          (row.pm25 != null ||
            row.pm10 != null ||
            row.no2 != null ||
            row.ozone != null),
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )
      .slice(-48);

    let aqiBand: string | null = null;
    if (indexResponse.ok) {
      const indexJson = await indexResponse.json();
      const species = asArray<Record<string, string>>(
        indexJson?.HourlyAirQualityIndex?.LocalAuthority?.Site?.species,
      );
      aqiBand =
        species.find((item) => item["@SpeciesCode"] === "PM25")?.[
          "@AirQualityBand"
        ] ?? null;
    }

    if (!readings.length) return [];

    return readings.map((reading) => ({
      id: `laqn-ce2:${reading.timestamp}`,
      label: "LAQN CE2",
      source: "London Air Quality Network",
      stationCode: "CE2",
      stationName: "Waterloo Place (The Crown Estate)",
      distanceKm: 1.17,
      timestamp: reading.timestamp,
      pm25: reading.pm25,
      pm10: reading.pm10,
      no2: reading.no2,
      ozone: reading.ozone,
      aqiBand,
    }));
  } catch {
    return [];
  }
}

async function getLondonReferenceStations(): Promise<
  PublicFeedReferenceStation[]
> {
  try {
    const response = await fetch(
      "https://api.erg.ic.ac.uk/AirQuality/Hourly/MonitoringIndex/GroupName=London/Json",
      { next: { revalidate: 900 } },
    );
    if (!response.ok) return [];

    const json = await response.json();
    const localAuthorities = asArray<Record<string, unknown>>(
      json?.HourlyAirQualityIndex?.LocalAuthority,
    );

    return localAuthorities
      .flatMap((authority) =>
        asArray<Record<string, unknown>>(
          authority.Site as
            | Record<string, unknown>
            | Record<string, unknown>[]
            | undefined,
        ),
      )
      .map((site) => {
        const species = asArray<Record<string, string>>(
          site.Species as
            | Record<string, string>
            | Record<string, string>[]
            | undefined,
        );
        const getSpecies = (code: string) =>
          species
            .filter((item) => item["@SpeciesCode"] === code)
            .sort(
              (a, b) =>
                Number(b["@AirQualityIndex"] ?? 0) -
                Number(a["@AirQualityIndex"] ?? 0),
            )[0];
        const pm25 = getSpecies("PM25");
        const pm10 = getSpecies("PM10");
        const lat = Number(site["@Latitude"]);
        const lng = Number(site["@Longitude"]);
        const pm25Index = numberOrNull(pm25?.["@AirQualityIndex"]);
        const pm10Index = numberOrNull(pm10?.["@AirQualityIndex"]);

        return {
          id: `laqn:${String(site["@SiteCode"] ?? "unknown")}`,
          source: "London Air Quality Network",
          stationCode: String(site["@SiteCode"] ?? ""),
          stationName: String(site["@SiteName"] ?? "LAQN monitoring site"),
          siteType: String(site["@SiteType"] ?? "Monitoring site"),
          lat,
          lng,
          timestamp: site["@BulletinDate"]
            ? parseGmtTimestamp(String(site["@BulletinDate"]))
            : "",
          pm25Index,
          pm25Band: pm25?.["@AirQualityBand"] ?? null,
          pm10Index,
          pm10Band: pm10?.["@AirQualityBand"] ?? null,
        } satisfies PublicFeedReferenceStation;
      })
      .filter(
        (station) =>
          Number.isFinite(station.lat) &&
          Number.isFinite(station.lng) &&
          ((station.pm25Index ?? 0) > 0 || (station.pm10Index ?? 0) > 0),
      )
      .sort((a, b) => a.stationName.localeCompare(b.stationName));
  } catch {
    return [];
  }
}

export async function getPublicFeedSnapshot(
  slug: string,
  options: Partial<PublicFeedFilters> | number = 120,
): Promise<PublicFeedSnapshot | null> {
  const feed = Object.hasOwn(PUBLIC_FEEDS, slug) ? PUBLIC_FEEDS[slug] : null;
  if (!feed) return null;
  const filters: PublicFeedFilters =
    typeof options === "number"
      ? {
          limit: options,
          from: null,
          to: null,
          devices: feed.devices.map((device) => device.deviceId),
          pollutant: "pm25",
          includeReferences: false,
        }
      : {
          limit: options.limit ?? 120,
          from: options.from ?? null,
          to: options.to ?? null,
          devices: options.devices?.length
            ? options.devices
            : feed.devices.map((device) => device.deviceId),
          pollutant: options.pollutant ?? "pm25",
          includeReferences: options.includeReferences ?? true,
        };

  const candidates = feed.devices.filter((device) =>
    filters.devices.includes(device.deviceId),
  );
  const records = await Promise.all(
    candidates.map((device) => getDevice(device.deviceId)),
  );
  const selectedDevices = candidates.filter(
    (_, index) => records[index]?.visibility === "public",
  );

  const perDevice = await Promise.all(
    selectedDevices.map(async (device) => {
      const readings =
        filters.from && filters.to
          ? await getReadingsInRange(device.deviceId, filters.from, filters.to)
          : await getReadings(device.deviceId, filters.limit);
      const before =
        records[
          candidates.findIndex(
            (candidate) => candidate.deviceId === device.deviceId,
          )
        ];
      const after = await getDevice(device.deviceId);
      if (
        !after ||
        after.visibility !== "public" ||
        after.ownerId !== before?.ownerId ||
        after.ownershipVersion !== before?.ownershipVersion
      )
        return { device, readings: [] };
      const orderedReadings = readings.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const visibleReadings =
        filters.from && filters.to
          ? sampleAcrossRange(orderedReadings, filters.limit)
          : orderedReadings.slice(-filters.limit);
      return {
        device,
        readings: visibleReadings.map((reading) => withDevice(reading, device)),
      };
    }),
  );

  const latest = perDevice
    .map(({ readings }) => readings.at(-1))
    .filter((reading): reading is Reading & PublicFeedDevice =>
      Boolean(reading),
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

  const readings = perDevice
    .flatMap(({ readings }) => readings)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

  const [referenceReadings, referenceStations] = filters.includeReferences
    ? await Promise.all([
        getSomersetHouseReference(),
        getLondonReferenceStations(),
      ])
    : [[], []];

  return {
    ...feed,
    devices: selectedDevices,
    referenceLocation: filters.includeReferences
      ? feed.referenceLocation
      : { label: "", lat: 0, lng: 0 },
    references: filters.includeReferences ? feed.references : [],
    latest,
    readings,
    referenceReadings,
    referenceStations,
    updatedAt: latest[0]?.timestamp ?? new Date().toISOString(),
    filters: {
      ...filters,
      devices: selectedDevices.map((device) => device.deviceId),
    },
  };
}
