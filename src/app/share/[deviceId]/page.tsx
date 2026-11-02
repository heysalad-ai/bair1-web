import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyDeviceShareToken } from "@/lib/device-sharing";
import { getSharedDeviceSnapshot } from "@/lib/shared-device";
import SharedDeviceView from "./shared-device-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Shared device telemetry | Bair1",
  description: "Privacy-safe live environmental and air-quality telemetry from Bair1.",
  openGraph: {
    title: "Shared device telemetry | Bair1",
    description: "Privacy-safe live environmental and air-quality telemetry from Bair1.",
    images: [],
  },
  twitter: {
    card: "summary",
    title: "Shared device telemetry | Bair1",
    description: "Privacy-safe live environmental and air-quality telemetry from Bair1.",
    images: [],
  },
};

export default async function SharedDevicePage({
  params,
  searchParams,
}: {
  params: Promise<{ deviceId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ deviceId }, { token }] = await Promise.all([params, searchParams]);
  if (!await verifyDeviceShareToken(deviceId, token)) notFound();
  const snapshot = await getSharedDeviceSnapshot(deviceId);
  if (!snapshot || !await verifyDeviceShareToken(deviceId, token)) notFound();
  return <SharedDeviceView deviceId={deviceId} token={token!} initialSnapshot={snapshot} />;
}
