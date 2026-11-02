import { GraphQLError } from "graphql";
import { createSchema, createYoga } from "graphql-yoga";
import {
  getReadings,
  getReadingPage,
  getLatestReading,
  getAllDevices,
  getReadingsInRange,
  getNotecardTelemetry,
  getNotecardTelemetryHistory,
} from "@/lib/dynamo";
import { getDevice, type Device } from "@/lib/devices";
import { extractApiKeyFromHeaders, validateApiKey, type ApiKeyPrincipal } from "@/lib/api-keys";
import { requireAuth } from "@/lib/auth";
import { canAccessDevice, accessibleDevices, hasPlatformAccess } from "@/lib/device-access";
import type { User } from "@/lib/users";

type Actor =
  | { kind: "user"; user: User }
  | { kind: "api-key"; principal: ApiKeyPrincipal };

type GraphqlContext = { actor: Actor };

const hasFullAccess = hasPlatformAccess;

async function requireDeviceAccess(actor: Actor, deviceId: string) {
  if (hasFullAccess(actor)) return;
  const device = await getDevice(deviceId);
  if (!device || !await canAccessDevice(actor, device)) {
    throw new GraphQLError("device not found");
  }
}

async function authenticate(request: Request): Promise<Actor | Response> {
  const suppliedKey = extractApiKeyFromHeaders(request.headers);
  const isApiKey = request.headers.has("x-api-key") || suppliedKey?.startsWith("bair1_");
  if (isApiKey) {
    const principal = await validateApiKey(suppliedKey, ["read:readings", "read:devices"]);
    return principal
      ? { kind: "api-key", principal }
      : Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await requireAuth(request);
  return auth instanceof Response ? auth : { kind: "user", user: auth.user };
}

const schema = createSchema<GraphqlContext>({
  typeDefs: /* GraphQL */ `
    type Reading {
      deviceId: String!
      timestamp: String!
      aqi: Float
      gasRaw: Int
      gasVoltage: Float
      airState: String
      rssi: Int
      firmwareVersion: String
      uptimeMs: Float
      sample: Int
      transport: String
      lat: Float
      lng: Float
      locationAccuracy: Float
      pm1: Float
      pm25: Float
      pm4: Float
      pm10: Float
      sensorModel: String
      board: String
      capturedAt: String
      receivedAt: String
      clockQuality: String
      temperature: Float
      humidity: Float
      pressure: Float
      altitudeMeters: Float
      adcD3Raw: Float
      adcD2Raw: Float
      adcD3PinVoltage: Float
      adcD2PinVoltage: Float
      adcD3InputVoltage: Float
      adcD2InputVoltage: Float
      dhtTemp: Float
      dhtHum: Float
      accelX: Float
      accelY: Float
      accelZ: Float
      gyroX: Float
      gyroY: Float
      gyroZ: Float
      batteryVoltage: Float
      batteryLevel: Float
    }

    type RegisteredDevice {
      deviceId: String!
      name: String!
      location: String!
      lat: Float
      lng: Float
      orgId: String!
      visibility: String!
      isOwner: Boolean!
      permissions: [String!]!
      status: String!
      createdAt: String!
      latestReading: Reading
    }

    type AqiTimeSeries {
      timestamp: String!
      aqi: Float
      gasVoltage: Float
      rssi: Int
      lat: Float
      lng: Float
    }

    type LocationPoint {
      timestamp: String!
      lat: Float!
      lng: Float!
      aqi: Float
      accuracy: Float
    }

    type NotecardTelemetry {
      capturedAt: String!
      receivedAt: String!
      temperature: Float
      humidity: Float
      pressure: Float
      pressureUnit: String
      measurementAt: String
      temperatureAt: String
      humidityAt: String
      pressureAt: String
      batteryVoltageAt: String
      motionAt: String
      batteryVoltage: Float
      motion: Float
      deviceStatus: String
      transport: String
      locationAvailable: Boolean!
      locationSource: String
      sourceFile: String
      updatedAt: String!
    }

    type Viewer {
      name: String!
      email: String!
      role: String!
      orgId: String!
    }

    type ReadingPage { data: [Reading!]!, nextCursor: String, limit: Int! }

    type Query {
      readingPage(deviceId: String!, limit: Int, cursor: String, from: String, to: String): ReadingPage!
      viewer: Viewer!
      readings(deviceId: String!, limit: Int): [Reading!]!
      latestReading(deviceId: String!): Reading
      activeDeviceIds: [String!]!
      registeredDevices: [RegisteredDevice!]!
      timeSeries(
        deviceId: String!
        from: String!
        to: String!
      ): [AqiTimeSeries!]!
      locationTrail(
        deviceId: String!
        from: String!
        to: String!
      ): [LocationPoint!]!
      notecardTelemetry(deviceId: String!): NotecardTelemetry
      notecardTelemetryHistory(deviceId: String!, limit: Int): [NotecardTelemetry!]!
    }
  `,
  resolvers: {
    Query: {
      readingPage: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        try { return await getReadingPage(args.deviceId, args); }
        catch (error) { if (error instanceof RangeError) throw new GraphQLError(error.message); throw error; }
      },
      viewer: (_parent, _args, context) => {
        if (context.actor.kind === "user") {
          const { name, email, role, orgId } = context.actor.user;
          return { name, email, role, orgId };
        }

        return {
          name: "API client",
          email: "",
          role: context.actor.principal.type === "system" ? "admin" : "user",
          orgId: context.actor.principal.orgId,
        };
      },
      readings: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        return getReadings(args.deviceId, args.limit ?? 100);
      },
      latestReading: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        return getLatestReading(args.deviceId);
      },
      activeDeviceIds: async (_parent, _args, context) => {
        if (hasFullAccess(context.actor)) return getAllDevices();
        const devices = await accessibleDevices(context.actor);
        return devices.map((device) => device.deviceId);
      },
      registeredDevices: async (_parent, _args, context) => {
        return accessibleDevices(context.actor);
      },
      timeSeries: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        const readings = await getReadingsInRange(
          args.deviceId,
          args.from,
          args.to
        );
        return readings.map((r) => ({
          timestamp: r.timestamp,
          aqi: r.aqi,
          gasVoltage: r.gasVoltage,
          rssi: r.rssi,
          lat: r.lat,
          lng: r.lng,
        }));
      },
      locationTrail: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        const readings = await getReadingsInRange(
          args.deviceId,
          args.from,
          args.to
        );
        return readings
          .filter((r) => r.lat != null && r.lng != null)
          .map((r) => ({
            timestamp: r.timestamp,
            lat: r.lat!,
            lng: r.lng!,
            aqi: r.aqi,
            accuracy: r.locationAccuracy,
          }));
      },
      notecardTelemetry: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        const telemetry = await getNotecardTelemetry(args.deviceId);
        return telemetry
          ? {
              ...telemetry,
              locationAvailable: telemetry.lat != null && telemetry.lng != null,
            }
          : null;
      },
      notecardTelemetryHistory: async (_parent, args, context) => {
        await requireDeviceAccess(context.actor, args.deviceId);
        const history = await getNotecardTelemetryHistory(args.deviceId, args.limit ?? 120);
        return history.map((telemetry) => ({
          ...telemetry,
          locationAvailable: telemetry.lat != null && telemetry.lng != null,
        }));
      },
    },
    RegisteredDevice: {
      visibility: (parent: Device) => parent.visibility ?? "private",
      isOwner: (parent: Device, _args, context) => context.actor.kind === "user" && (parent.ownerId === context.actor.user.userId || hasFullAccess(context.actor)),
      permissions: async (parent: Device, _args, context) => {
        const permissions = ["read", "control", "manage", "share"] as const;
        const allowed = await Promise.all(permissions.map(permission => canAccessDevice(context.actor, parent, permission)));
        return permissions.filter((_, index) => allowed[index]);
      },
      latestReading: async (parent: Device) => {
        return getLatestReading(parent.deviceId);
      },
    },
  },
});

const yoga = createYoga<GraphqlContext>({
  schema,
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
});

export async function GET(request: Request) {
  const actor = await authenticate(request);
  return actor instanceof Response ? actor : yoga.handleRequest(request, { actor });
}

export async function POST(request: Request) {
  const actor = await authenticate(request);
  return actor instanceof Response ? actor : yoga.handleRequest(request, { actor });
}
