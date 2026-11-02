import { getDevice } from "@/lib/devices";
import {
  getLatestReading,
  getNotecardTelemetry,
  getNotecardTelemetryHistory,
} from "@/lib/dynamo";

export type SharedDeviceSnapshot = {
  device: { deviceId: string; name: string; status: string };
  telemetry: null | {
    capturedAt: string;
    receivedAt: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    pressureUnit?: string;
    batteryVoltage: number | null;
    motion: number | null;
    deviceStatus: string | null;
    transport: string | null;
    locationAvailable: boolean;
    sourceFile: string | null;
  };
  history: Array<{
    capturedAt: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    pressureUnit?: string;
    batteryVoltage: number | null;
    motion: number | null;
    deviceStatus: string | null;
    sourceFile: string | null;
  }>;
  airQuality: null | {
    timestamp: string;
    aqi: number | null;
    pm1: number | null;
    pm25: number | null;
    pm4: number | null;
    pm10: number | null;
  };
};

export async function getSharedDeviceSnapshot(deviceId: string): Promise<SharedDeviceSnapshot | null> {
  const device = await getDevice(deviceId);
  if (!device) return null;
  const [telemetry, history, latestReading] = await Promise.all([
    getNotecardTelemetry(deviceId),
    getNotecardTelemetryHistory(deviceId, 96),
    getLatestReading(deviceId),
  ]);
  return {
    device: { deviceId: device.deviceId, name: device.name, status: device.status },
    telemetry: telemetry ? {
      capturedAt: telemetry.capturedAt,
      receivedAt: telemetry.receivedAt,
      temperature: telemetry.temperature,
      humidity: telemetry.humidity,
      pressure: telemetry.pressure,
      pressureUnit: telemetry.pressureUnit,
      batteryVoltage: telemetry.batteryVoltage,
      motion: telemetry.motion,
      deviceStatus: telemetry.deviceStatus,
      transport: telemetry.transport,
      locationAvailable: telemetry.lat != null && telemetry.lng != null,
      sourceFile: telemetry.sourceFile,
    } : null,
    history: history.map((item) => ({
      capturedAt: item.capturedAt,
      temperature: item.temperature,
      humidity: item.humidity,
      pressure: item.pressure,
      pressureUnit: item.pressureUnit,
      batteryVoltage: item.batteryVoltage,
      motion: item.motion,
      deviceStatus: item.deviceStatus,
      sourceFile: item.sourceFile,
    })),
    airQuality: latestReading ? {
      timestamp: latestReading.timestamp,
      aqi: latestReading.aqi,
      pm1: latestReading.pm1,
      pm25: latestReading.pm25,
      pm4: latestReading.pm4,
      pm10: latestReading.pm10,
    } : null,
  };
}
