"use client";

import { useAuth0 } from "@auth0/auth0-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";

type StudioChartPoint = {
  time: number;
  sensorPm25: number | null;
  forecastPm25: number | null;
};

type StudioSummary = {
  current: number;
  change: number;
  minimum: number;
  maximum: number;
  sampleCount: number;
  from: number;
  updatedAt: number;
} | null;

type Props = {
  feedName: string;
  location: string;
  feedSlug: string;
  chartData: StudioChartPoint[];
  summary: StudioSummary;
};

function messageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("")
    .replaceAll("**", "");
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatChange(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}`;
}

const prompts = [
  "Compare the indoor reading with LAQN right now.",
  "What changed in the last 30 minutes?",
  "What does the forecast suggest for the next 30 minutes?",
];

export default function LiveAirChat({
  feedName,
  location,
  feedSlug,
  chartData,
  summary,
}: Props) {
  const { isAuthenticated, getAccessTokenSilently, loginWithRedirect } =
    useAuth0();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: async () => ({
        Authorization: `Bearer ${await getAccessTokenSilently()}`,
      }),
      body: {
        feedSlug,
        feedContext: `${feedName} at ${location}.`,
      },
    }),
  });
  const isLoading = status === "streaming" || status === "submitted";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!isAuthenticated || !text || isLoading) return;
    setInput("");
    try {
      await sendMessage({ text });
    } catch {
      /* useChat exposes the error below. */
    }
  };

  const ask = async (text: string) => {
    if (!isAuthenticated || isLoading) return;
    try {
      await sendMessage({ text });
    } catch {
      /* useChat exposes the error below. */
    }
  };

  return (
    <section className="border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Data Studio</h2>
            <span className="border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              GPT-5.6
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Explore the live reading in words, comparisons, and charts. Bair can
            use the sensor history, LAQN, weather, and pollen data.
          </p>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,0.8fr)_minmax(360px,1.2fr)]">
        <aside className="border-b border-border p-4 sm:p-5 xl:border-b-0 xl:border-r">
          <p className="text-xs font-medium text-ink">Live PM2.5 context</p>
          <p className="mt-1 text-xs text-muted">
            Measured reading and the current 30-minute forecast model.
          </p>
          <div className="mt-5 h-56 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
              >
                <XAxis
                  dataKey="time"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={formatTime}
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }}
                  width={36}
                />
                <Tooltip
                  labelFormatter={(value) => formatTime(Number(value))}
                  formatter={(value) =>
                    value == null ? "--" : `${Number(value).toFixed(1)} µg/m³`
                  }
                  contentStyle={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "#080d08",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="sensorPm25"
                  name="Measured PM2.5"
                  stroke="#60a5fa"
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey={(point: StudioChartPoint) => point.forecastPm25}
                  name="Forecast PM2.5"
                  stroke="#c6ff4a"
                  strokeWidth={2.2}
                  strokeDasharray="4 5"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <span className="inline-flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-[#60a5fa]" />
              Measured
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-2 w-2 rounded-full bg-[#c6ff4a]" />
              Forecast model
            </span>
          </div>
          {summary ? (
            <div className="mt-5 grid grid-cols-3 border border-border bg-bg text-xs">
              <div className="p-3">
                <p className="text-muted">Now</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {summary.current.toFixed(1)}
                </p>
                <p className="mt-0.5 text-muted">µg/m³</p>
              </div>
              <div className="border-l border-border p-3">
                <p className="text-muted">30 min change</p>
                <p
                  className={`mt-1 text-lg font-semibold ${summary.change > 0 ? "text-[#c6ff4a]" : "text-[#60a5fa]"}`}
                >
                  {formatChange(summary.change)}
                </p>
                <p className="mt-0.5 text-muted">µg/m³</p>
              </div>
              <div className="border-l border-border p-3">
                <p className="text-muted">Measured range</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {summary.minimum.toFixed(0)}–{summary.maximum.toFixed(0)}
                </p>
                <p className="mt-0.5 text-muted">µg/m³</p>
              </div>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-muted">
            {summary
              ? `${summary.sampleCount} live samples · updated ${formatTime(summary.updatedAt)}`
              : "Waiting for live samples"}
          </p>
        </aside>

        <div className="flex min-h-[440px] flex-col">
          {!isAuthenticated && (
            <div className="border-b border-border p-4 text-sm">
              <p>Sign in to ask Bair about this feed.</p>
              <button
                type="button"
                onClick={() => loginWithRedirect()}
                className="mt-2 underline underline-offset-4"
              >
                Sign in
              </button>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto border-b border-border p-3 sm:px-5">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => ask(prompt).catch(() => {})}
                disabled={isLoading || !isAuthenticated}
                className="shrink-0 border border-border bg-bg px-3 py-2 text-xs text-muted transition hover:border-primary hover:text-ink disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="max-h-[440px] min-h-44 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            {messages.length === 0 ? (
              <p className="text-sm leading-6 text-muted">
                Choose a question or ask your own to investigate the live data.
              </p>
            ) : (
              messages.map((message) => {
                const text = messageText(message);
                if (!text) return null;
                return (
                  <div
                    key={message.id}
                    className={
                      message.role === "user" ? "text-right" : "text-left"
                    }
                  >
                    <p
                      className={`inline-block min-w-0 max-w-[92%] [overflow-wrap:anywhere] whitespace-pre-wrap px-3 py-2 text-sm leading-6 ${message.role === "user" ? "bg-primary text-white" : "border border-border bg-bg text-ink"}`}
                    >
                      {text}
                    </p>
                  </div>
                );
              })
            )}
            {isLoading ? (
              <p className="text-xs text-muted">Bair is checking the data…</p>
            ) : null}
          </div>

          {error && (
            <p role="alert" className="px-4 py-3 text-sm text-ink">
              Air Guide could not respond. Check your session or try again
              later; the service may be disabled or at its usage limit.
              Published measurements remain available.
            </p>
          )}
          <form
            onSubmit={submit}
            className="flex gap-2 border-t border-border p-3 sm:p-4"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label="Question about public feed"
              placeholder="Ask about the live air…"
              className="min-w-0 flex-1 border border-border bg-bg px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
            />
            <button
              type="submit"
              disabled={isLoading || !isAuthenticated || !input.trim()}
              className="bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
