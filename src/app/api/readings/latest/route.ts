import { getDevice } from "@/lib/devices";
import { NextResponse } from "next/server";
import { PUBLIC_FEEDS } from "@/lib/public-feeds";
import { getLatestReading } from "@/lib/dynamo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ids = [...new Set(Object.values(PUBLIC_FEEDS).flatMap(feed => feed.devices.map(device => device.deviceId)))];
    const readings = await Promise.all(ids.map(async id => (await getDevice(id))?.visibility === "public" ? getLatestReading(id) : null));
    const reading = readings.filter(item => item !== null).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (!reading) {
      return NextResponse.json({ error: "no readings" }, { status: 404 });
    }
    return NextResponse.json({
      deviceId: reading.deviceId,
      aqi: reading.aqi,
      gasRaw: reading.gasRaw,
      gasVoltage: reading.gasVoltage,
      airState: reading.airState,
      rssi: reading.rssi,
      firmwareVersion: reading.firmwareVersion,
      uptimeMs: reading.uptimeMs,
      sample: reading.sample,
      transport: reading.transport,
      pm1: reading.pm1,
      pm25: reading.pm25,
      pm4: reading.pm4,
      pm10: reading.pm10,
      sensorModel: reading.sensorModel,
      timestamp: reading.timestamp,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
