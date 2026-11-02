"use client";

import { useCallback, useState } from "react";

type AirInsight = {
  headline: string;
  explanation: string;
  advice: string[];
  confidence: "low" | "medium" | "high";
};

type Props = {
  slug: string;
};

export default function AirInsightCard({ slug }: Props) {
  const [insight, setInsight] = useState<AirInsight | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchInsight = useCallback(async () => {
    const response = await fetch(`/api/public/insight/${encodeURIComponent(slug)}`, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("Air Insight request failed");
    return (await response.json()) as AirInsight;
  }, [slug]);

  const loadInsight = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      setInsight(await fetchInsight());
    } catch {
      setInsight(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="border border-border bg-surface" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Air Insight</h2>
            <span className="border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              GPT-5.6
            </span>
          </div>
          {insight ? <p className="mt-3 text-base font-medium text-ink">{insight.headline}</p> : null}
        </div>
        <div className="flex items-center gap-2 p-4 sm:p-5">
          {insight ? (
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              className="h-8 border border-border bg-bg px-3 text-xs text-ink transition hover:border-primary"
            >
              {isExpanded ? "Show less" : "Learn more"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => loadInsight().catch(() => {})}
            disabled={isLoading}
            className="h-8 border border-border bg-bg px-3 text-xs text-ink transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Refreshing…" : insight ? "Generate again" : "Generate insight"}
          </button>
        </div>
      </div>

      {insight && isExpanded ? (
        <div className="border-t border-border p-4 sm:p-5">
          <p className="max-w-4xl text-sm leading-6 text-muted">{insight.explanation}</p>
          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <ul className="space-y-1.5 text-sm text-ink">
              {insight.advice.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-primary">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <span className="w-fit border border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted">
              {insight.confidence} confidence
            </span>
          </div>
        </div>
      ) : isLoading ? (
        <p className="border-t border-border p-4 text-sm text-muted sm:px-5">Reading the latest sensor and reference values…</p>
      ) : !insight ? (
        <p className="border-t border-border p-4 text-sm text-muted sm:px-5">
          {hasError
            ? "Air Insight is temporarily unavailable. The live sensor values and forecast below remain available."
            : "Generate an insight from the published measurements and external reference data. Generated advice is separate from sensor readings."}
        </p>
      ) : null}
    </section>
  );
}
