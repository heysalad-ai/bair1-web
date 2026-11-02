import Auth0ProviderWrapper from "@/components/Auth0ProviderWrapper";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFeedSnapshot, PUBLIC_FEEDS } from "@/lib/public-feeds";
import PublicFeedClient from "./PublicFeedClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feed = PUBLIC_FEEDS[slug];
  if (!feed) return {};
  return {
    title: "Bair1 Live Data",
    description: "Live PM sensor data from Bair1.",
    openGraph: {
      title: "Bair1 Live Data",
      description: "Live PM sensor data from Bair1.",
      url: `https://app.bair1.live/live/${feed.slug}`,
      siteName: "Bair1",
    },
  };
}

export default async function PublicLiveFeedPage({ params }: Props) {
  const { slug } = await params;
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const to = now.toISOString();
  const snapshot = await getPublicFeedSnapshot(slug, { limit: 500, from, to, includeReferences: true });

  if (!snapshot) notFound();

  return <Auth0ProviderWrapper><PublicFeedClient initialSnapshot={{ ...snapshot, title: "", description: "" }} /></Auth0ProviderWrapper>;
}
