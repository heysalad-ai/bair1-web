"use client";

import { MotionConfig } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import BearCompanion from "@/components/bear/BearCompanion";
import BearFigure from "@/components/bear/BearFigure";
import DeviceDetailView, {
  WINDOWS,
  snapshotTone,
  type HistoryState,
  type Row,
  type SnapshotState,
} from "@/components/device/DeviceDetailView";
import FleetView, { type FleetDevice } from "@/components/fleet/FleetView";
import Navigation from "@/components/Navigation";
import StateMessage from "@/components/ui/StateMessage";
import {
  Breadcrumbs,
  Button,
  Icon,
  IconButton,
  Segmented,
  Skeleton,
  StatusIndicator,
} from "@/components/ui/kit";
import type { BearMood } from "@/lib/bear-state";
import type { SnapshotEntry } from "@/lib/device-overview";
import { toneLabels, type UnitTone } from "@/lib/fleet-insights";

/* ------------------------------------------------------------------ */
/* SAMPLE DATA — generated in the browser on every load. Not from any  */
/* device, account or stored reading. Never import from production.    */
/* ------------------------------------------------------------------ */
type Sample = {
  devices: FleetDevice[];
  snapshots: Record<string, SnapshotEntry>;
  now: number;
};

const SAMPLE_NAMES = [
  "Sample · Living room",
  "Sample · Kitchen window",
  "Sample · Bedroom",
  "Sample · Garden shed",
  "Sample · Workshop",
  "Sample · Hallway",
  "Sample · Gateway-only unit",
  "Sample · A very long unit name beside the upstairs landing window and greenhouse vent",
  "Sample · Loft",
];

function makeSample(): Sample {
  const now = Date.now();
  const at = (ms: number) => new Date(now - ms).toISOString();
  const devices = SAMPLE_NAMES.map((name, i) => ({
    deviceId: `sample-${crypto.randomUUID()}`,
    name,
    orgId: i < 3 ? "sample-home" : "workspace:sample-trials",
    isOwner: i < 3,
  }));
  const reading = (ms: number | null, offset = 0, extra: Record<string, number | null> = {}) => ({
    reading: {
      capturedAt: ms === null ? null : at(ms),
      receivedAt: at(5_000),
      pm1: 4.1 + offset,
      pm25: 6.4 + offset,
      pm4: 7 + offset,
      pm10: 7.4 + offset,
      temperature: 20.5 + offset / 4,
      humidity: 54,
      pressure: 1005.4,
      ...extra,
    },
    telemetry: null,
  });
  const entries: SnapshotEntry[] = [
    { status: "ready", snapshot: reading(30_000) },
    { status: "ready", snapshot: reading(45_000, 0, { pm25: 0, pm1: 0, pm4: 0, pm10: 0 }) },
    { status: "ready", snapshot: reading(4 * 60_000, 2) },
    { status: "ready", snapshot: reading(2 * 3_600_000, 1) },
    { status: "ready", snapshot: reading(3 * 86_400_000, 3) },
    { status: "ready", snapshot: reading(null, 1) },
    {
      status: "ready",
      snapshot: {
        reading: null,
        telemetry: {
          receivedAt: at(20_000),
          measurementAt: at(40_000),
          temperature: 18.2,
          temperatureAt: at(40_000),
          humidity: 61,
          humidityAt: at(40_000),
          pressure: 1002,
          pressureUnit: "unknown",
          pressureAt: at(40_000),
          batteryVoltage: 3.91,
          batteryVoltageAt: at(40_000),
        },
      },
    },
    { status: "error", message: "Readings unavailable. Try refreshing." },
    { status: "ready", snapshot: { reading: null, telemetry: null } },
  ];
  return {
    devices,
    snapshots: Object.fromEntries(devices.map((d, i) => [d.deviceId, entries[i]])),
    now,
  };
}

/** Sample history per window: smooth values, one 30-minute gap, a few nulls, zero values. */
function sampleHistory(windowHours: number, now: number): HistoryState {
  const step = windowHours === 0 ? 120_000 : windowHours === 24 ? 600_000 : 3_600_000;
  const span = windowHours ? windowHours * 3_600_000 : 200 * step;
  const count = Math.min(200, Math.floor(span / step));
  const rows: Row[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = now - i * step - 20_000;
    if (i > count * 0.55 && i < count * 0.55 + Math.max(2, 1_800_000 / step)) continue; // gap
    const phase = (now - t) / (6 * 3_600_000);
    const pm = Math.max(0, 6 + 4 * Math.sin(phase * Math.PI * 2) + (i % 7) * 0.3);
    rows.push({
      timestamp: new Date(t).toISOString(),
      pm1: i % 41 === 0 ? null : +(pm * 0.7).toFixed(1),
      pm25: i % 37 === 0 ? 0 : +pm.toFixed(1),
      pm4: +(pm * 1.08).toFixed(1),
      pm10: +(pm * 1.15).toFixed(1),
      temperature: +(20 + 1.5 * Math.sin(phase * Math.PI)).toFixed(1),
      humidity: +(54 + 4 * Math.cos(phase * Math.PI)).toFixed(1),
      pressure: +(1005 + Math.sin(phase) * 2).toFixed(1),
    });
  }
  return {
    rows,
    busy: false,
    error: "",
    more: windowHours === 336 || (windowHours === 0 ? false : span / step > 200),
    fetchedAt: now,
  };
}

/* ------------------------------------------------------------------ */

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="flex flex-col gap-4 border-t border-[var(--b1-line)] pt-8">
      <div>
        <h2 className="b1-h2">{title}</h2>
        {note && <p className="b1-sub mt-1 max-w-3xl">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const MOODS: BearMood[] = ["idle", "greeting", "loading", "newData", "attention", "empty", "speaking"];
const TONES: UnitTone[] = ["recent", "delayed", "stale", "unknown", "nodata", "error", "loading"];

export default function UiKitShowcase() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [view, setView] = useState<"kit" | "fleet" | "device">("kit");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSample(makeSample());
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "fleet" || v === "device") setView(v);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  if (!sample) return <p className="p-8">Generating sample data…</p>;
  return (
    <MotionConfig reducedMotion="user">
      <div className="b1-sample-banner" role="note">
        Development sample · synthetic data generated in your browser · not from any device or account
      </div>
      <div className="flex justify-center gap-2 border-b border-[var(--b1-line)] p-3">
        <Segmented
          label="Showcase view"
          value={view}
          onChange={setView}
          options={[
            { value: "kit", label: "UI kit" },
            { value: "fleet", label: "Fleet page" },
            { value: "device", label: "Unit page" },
          ]}
        />
      </div>
      {view === "kit" ? <Kit sample={sample} /> : view === "fleet" ? <FleetFrame sample={sample} /> : <DeviceFrame sample={sample} />}
    </MotionConfig>
  );
}

function Frame({ crumbs, children }: { crumbs: { label: string; href?: string }[]; children: ReactNode }) {
  return (
    <main className="min-h-screen min-w-0 flex-1 lg:pl-64">
      <header className="border-b border-[var(--b1-line)] px-5 py-4 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <Breadcrumbs items={crumbs} />
          <span className="text-sm text-[var(--b1-ink-2)]">Sample account</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 pb-28 lg:px-10">{children}</div>
      <Navigation active="home" onChange={() => {}} role="user" />
    </main>
  );
}

function FleetFrame({ sample }: { sample: Sample }) {
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const devices = sample.devices.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Frame crumbs={[{ label: "All units" }]}>
      <FleetView
        devices={devices}
        total={sample.devices.length}
        workspaceName={(d) => (d.orgId === "sample-home" ? "Sample home" : "Sample trials")}
        search={search}
        onSearch={setSearch}
        snapshots={refreshing ? {} : sample.snapshots}
        now={sample.now}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          setTimeout(() => {
            setRefreshing(false);
            setFresh({ [sample.devices[0].deviceId]: Date.now() });
            setTimeout(() => setFresh({}), 6000);
          }, 1400);
        }}
        fresh={fresh}
        page={0}
        lastPage={0}
        filteredCount={devices.length}
        pageSize={24}
        onPage={() => {}}
        fetchedAt={sample.now}
      />
    </Frame>
  );
}

function DeviceFrame({ sample }: { sample: Sample }) {
  const [windowHours, setWindowHours] = useState(0);
  const [field, setField] = useState("");
  const [scenario, setScenario] = useState<"ready" | "loading" | "error" | "denied" | "located">("ready");
  const [newReading, setNewReading] = useState(false);
  const device = sample.devices[scenario === "located" ? 1 : 0];
  const entry = sample.snapshots[device.deviceId];
  const state: SnapshotState =
    scenario === "loading"
      ? { status: "loading" }
      : scenario === "error"
        ? { status: "error", message: "Measurements are temporarily unavailable. Please try again." }
        : scenario === "denied"
          ? { status: "denied", message: "Your session or device access changed. Refresh your devices or sign in again." }
          : entry.status === "ready"
            ? { status: "ready", snapshot: entry.snapshot }
            : { status: "loading" };
  const history = scenario === "loading" ? { rows: [], busy: true, error: "", more: false, fetchedAt: null } : sampleHistory(windowHours, sample.now);
  return (
    <Frame crumbs={[{ label: "All units", href: "#" }, { label: device.name }]}>
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--b1-line-strong)] p-3 text-xs">
        <span className="text-[var(--b1-muted)]">Sample scenario:</span>
        <Segmented
          label="Sample scenario"
          wrap
          value={scenario}
          onChange={setScenario}
          options={[
            { value: "ready", label: "Ready" },
            { value: "located", label: "With location" },
            { value: "loading", label: "Loading" },
            { value: "error", label: "Failed" },
            { value: "denied", label: "Access changed" },
          ]}
        />
        <Button
          size="sm"
          onClick={() => {
            setNewReading(true);
            setTimeout(() => setNewReading(false), 3200);
          }}
        >
          Simulate new reading
        </Button>
      </div>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="b1-title">{device.name}</h1>
          <StatusIndicator tone={snapshotTone(state, sample.now)} pill />
        </div>
        <p className="b1-sub">Private device · You own this device · Sample home</p>
      </div>
      <nav className="b1-tabs mb-8" aria-label="Unit views">
        <a href="#" aria-current="page">Overview</a>
        <a href="#">History & export</a>
        <a href="#">Map</a>
        <a href="#">Air Guide</a>
        <a href="#">Device & access</a>
      </nav>
      <DeviceDetailView
        device={{
          deviceId: device.deviceId,
          name: device.name,
          // Sample coordinates: a public landmark, clearly not a device position.
          lat: scenario === "located" ? 51.5007 : null,
          lng: scenario === "located" ? -0.1246 : null,
        }}
        snapshotState={state}
        onRetrySnapshot={() => setScenario("ready")}
        history={history}
        windowHours={windowHours}
        onWindow={setWindowHours}
        onRefreshHistory={() => {}}
        field={field}
        onField={setField}
        now={sample.now}
        newReading={newReading}
      />
    </Frame>
  );
}

function Kit({ sample }: { sample: Sample }) {
  const [mood, setMood] = useState<BearMood>("idle");
  const [range, setRange] = useState(0);
  const [pressed, setPressed] = useState(false);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10">
      <header>
        <p className="b1-eyebrow">Bear One</p>
        <h1 className="b1-title mt-2">UI kit</h1>
        <p className="b1-sub mt-2 max-w-2xl">
          Tokens and components for the dashboard. Documentation: docs/ui-kit.md. Every value on this page is sample
          content.
        </p>
      </header>

      <Section title="Colour" note="Dark, committed green. Status colours describe stored-data status, always with a shape and a word — never air quality.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {["bg", "surface", "surface-2", "surface-3", "line", "ink", "muted", "primary", "orb", "bear-brown", "bear-tan", "ok", "warn", "stale", "info", "danger"].map((token) => (
            <div key={token} className="b1-kit-swatch">
              <span style={{ background: `var(--b1-${token})` }} />
              <span>--b1-{token}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-2">
          <p className="b1-title">Bricolage display — Your units</p>
          <p className="b1-h2">Section heading — PM2.5 over time</p>
          <p>Figtree body — readable, direct copy for real people.</p>
          <p className="b1-sub">Muted support text — times in UTC.</p>
          <p className="b1-num text-3xl font-semibold">1 005.4 · 0.0 · 12.75</p>
        </div>
      </Section>

      <Section title="Buttons and focus" note="Tab through: every control shares one 2px focus ring.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button icon={Icon.refresh}>Default with icon</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
          <IconButton label="Refresh (icon button)" icon={Icon.refresh} />
          <IconButton label="Download (small icon button)" icon={Icon.download} size="sm" />
        </div>
      </Section>

      <Section title="Controls" note="Segmented controls are radio groups (arrow keys move). Chips are toggle buttons.">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented label="Sample time window" value={range} onChange={setRange} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
          <div className="b1-chips">
            <button type="button" className="b1-chip" aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
              <StatusIndicator tone="delayed" label="" /> Needs attention <strong>3</strong>
            </button>
            <button type="button" className="b1-chip" disabled>
              No readings yet <strong>0</strong>
            </button>
          </div>
        </div>
      </Section>

      <Section title="Status indicators">
        <div className="flex flex-wrap gap-3">
          {TONES.map((tone) => (
            <StatusIndicator key={tone} tone={tone} pill />
          ))}
        </div>
        <p className="b1-sub">{TONES.map((t) => `${toneLabels[t]}`).join(" · ")}</p>
      </Section>

      <Section title="Loading skeletons">
        <div className="grid max-w-md gap-2">
          <Skeleton width="40%" height="1.5rem" />
          <Skeleton height="0.75rem" />
          <Skeleton width="70%" height="0.75rem" />
        </div>
      </Section>

      <Section title="Navigation">
        <Breadcrumbs items={[{ label: "All units", href: "#" }, { label: "Sample · Living room" }]} />
        <nav className="b1-tabs" aria-label="Sample tabs">
          <a href="#" aria-current="page">Overview</a>
          <a href="#">History & export</a>
          <a href="#">Map</a>
        </nav>
      </Section>

      <Section title="Bear companion" note="Moods are chosen by src/lib/bear-state.ts from real UI state. Greeting plays once per session. Speech is opt-in and shows its exact text.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {MOODS.map((m) => (
            <button key={m} type="button" className="b1-tile items-center" aria-checked={m === mood} role="radio" onClick={() => setMood(m)}>
              <BearFigure mood={m} size={84} />
              <span className="b1-tile-label">{m}</span>
            </button>
          ))}
        </div>
        <div className="b1-card b1-card-pad max-w-xl">
          <BearCompanion
            mood={mood}
            message={
              mood === "attention"
                ? "Sample: 2 units haven’t sent a recent reading."
                : mood === "empty"
                  ? "Sample: this unit hasn’t sent a reading yet."
                  : mood === "loading"
                    ? "Sample: loading this unit’s readings…"
                    : mood === "newData"
                      ? "Sample: a new reading just arrived."
                      : "Sample: your latest readings are ready."
            }
            summary="Sample summary. Sample · Living room. Status: Recent data. Latest PM2.5: 6.4 micrograms per cubic metre, captured less than a minute ago. A stored reading does not confirm the unit is connected right now."
          />
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-4 lg:grid-cols-2">
          <StateMessage kind="empty" title="No matching units" actions={<Button>Clear search</Button>}>
            <p>Try a different name, device ID or workspace.</p>
          </StateMessage>
          <StateMessage kind="error" title="Readings unavailable" actions={<Button icon={Icon.refresh}>Try again</Button>}>
            <p>Measurements are temporarily unavailable.</p>
          </StateMessage>
          <StateMessage kind="denied" title="Access unavailable" actions={<Button>Refresh devices</Button>}>
            <p>Your session or device access changed.</p>
          </StateMessage>
          <StateMessage kind="loading" title="Loading your units…">
            <p>Fetching the units you can access.</p>
          </StateMessage>
        </div>
      </Section>

      <Section title="Motion rules">
        <ul className="b1-sub list-disc pl-5">
          <li>Transitions 140–450 ms, ease-out; springs only for the segmented thumb.</li>
          <li>Content is visible without animation: entrances start at ≥60% opacity and never gate data.</li>
          <li>No perpetual motion except the bear’s slow breathing, the orb float, and loading indicators.</li>
          <li>prefers-reduced-motion: bear holds still, charts don’t animate, transforms and shimmer are removed.</li>
        </ul>
      </Section>
      <p className="b1-sub">Sample generated at {new Date(sample.now).toISOString()}.</p>
    </div>
  );
}
