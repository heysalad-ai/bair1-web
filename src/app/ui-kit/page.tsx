import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UiKitShowcase from "./UiKitShowcase";

export const metadata: Metadata = {
  title: "Bear One UI kit — development sample",
  robots: { index: false, follow: false },
};

/**
 * Development-only review surface. It renders presentational components with
 * generated sample data and never touches authentication or stored readings.
 */
export default function UiKitPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UiKitShowcase />;
}
