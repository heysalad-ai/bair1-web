"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import BearCompanion from "@/components/bear/BearCompanion";
import StateMessage from "@/components/ui/StateMessage";
import {
  Button,
  Icon,
  Skeleton,
  StatusIndicator,
} from "@/components/ui/kit";
import { fleetBearState } from "@/lib/bear-state";
import {
  dashboardHref,
  deviceOverview,
  type SnapshotEntry,
} from "@/lib/device-overview";
import {
  fleetCounts,
  needsAttention,
  plural,
  toneFromFreshness,
  type UnitTone,
} from "@/lib/fleet-insights";
import { formatValue, shortLabels, snapshotMetrics } from "@/lib/snapshot-metrics";
import { fleetSpokenSummary } from "@/lib/spoken-summary";

export type FleetDevice = {
  deviceId: string;
  name: string;
  orgId: string;
  isOwner: boolean;
};

type Filter = "all" | "attention" | "recent" | "nodata";

export function unitTone(entry: SnapshotEntry | undefined, now: number): UnitTone {
  if (!entry) return "loading";
  if (entry.status === "error") return "error";
  return toneFromFreshness(deviceOverview(entry.snapshot, now).freshness);
}

export default function FleetView({
  devices,
  total,
  workspaceName,
  search,
  onSearch,
  snapshots,
  now,
  refreshing,
  onRefresh,
  fresh,
  page,
  lastPage,
  filteredCount,
  pageSize,
  onPage,
  purpose = "home",
  fetchedAt,
}: {
  /** Units on the current page only. */
  devices: FleetDevice[];
  total: number;
  workspaceName: (device: FleetDevice) => string;
  search: string;
  onSearch: (value: string) => void;
  snapshots: Record<string, SnapshotEntry>;
  now: number;
  refreshing: boolean;
  onRefresh: () => void;
  fresh: Record<string, number>;
  page: number;
  lastPage: number;
  filteredCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  purpose?: string;
  fetchedAt: number | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const tones = useMemo(
    () => Object.fromEntries(devices.map((d) => [d.deviceId, unitTone(snapshots[d.deviceId], now)])),
    [devices, snapshots, now],
  );
  const counts = fleetCounts(devices.map((d) => tones[d.deviceId]));
  const newReadings = devices.filter((d) => fresh[d.deviceId]).length;
  const bear = fleetBearState({ loading: refreshing, counts, newReadings });
  const shown = devices.filter((d) => {
    const tone = tones[d.deviceId];
    if (filter === "attention") return needsAttention(tone);
    if (filter === "recent") return tone === "recent";
    if (filter === "nodata") return tone === "nodata";
    return true;
  });
  const chips: { id: Filter; label: string; count: number; tone?: UnitTone }[] = [
    { id: "all", label: "All on this page", count: counts.total },
    { id: "recent", label: "Recent data", count: counts.recent, tone: "recent" },
    { id: "attention", label: "Needs attention", count: counts.attention, tone: "delayed" },
    { id: "nodata", label: "No readings yet", count: counts.nodata, tone: "nodata" },
  ];
  const purposeLine =
    purpose === "analytics"
      ? "Choose a unit to open its history and export."
      : purpose === "ai"
        ? "Choose a unit to open Air Guide."
        : purpose === "map"
          ? "Choose a unit to open its map."
          : "See what each unit is measuring and which need a look.";

  return (
    <section className="b1-page" aria-labelledby="fleet-heading">
      <div className="b1-fleet-hero">
        <div className="min-w-0">
          <p className="b1-eyebrow">Bear One</p>
          <h1 id="fleet-heading" className="b1-title mt-2">
            Your units
          </h1>
          <p className="b1-sub mt-2">
            {plural(total, "unit")} you can access. {purposeLine}
          </p>
        </div>
        <BearCompanion
          mood={bear.mood}
          message={bear.message}
          summary={counts.total && counts.loading < counts.total ? fleetSpokenSummary(counts) : undefined}
          greet
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="b1-search">
            <span className="b1-sr">Find a unit</span>
            {Icon.search}
            <input
              className="b1-input"
              type="search"
              value={search}
              placeholder="Search name, device ID or workspace"
              onChange={(event) => {
                onSearch(event.target.value);
                setFilter("all");
              }}
            />
          </label>
          <div className="flex items-center gap-3">
            {fetchedAt && (
              <span className="text-xs text-[var(--b1-muted)]">
                Checked{" "}
                {new Date(fetchedAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/London",
                })}{" "}
                UK time
              </span>
            )}
            <Button
              icon={<span className={refreshing ? "b1-spin inline-flex" : "inline-flex"}>{Icon.refresh}</span>}
              disabled={refreshing || !devices.length}
              onClick={onRefresh}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>
        {devices.length > 0 && (
          <div className="b1-chips" role="group" aria-label="Filter units on this page by data status">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="b1-chip"
                aria-pressed={filter === chip.id}
                disabled={chip.id !== "all" && chip.count === 0}
                onClick={() => setFilter(chip.id)}
              >
                {chip.tone && <StatusIndicator tone={chip.tone} label="" />}
                {chip.label} <strong>{chip.count}</strong>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--b1-muted)]">
          Age is the sensor’s capture time. Recent data doesn’t confirm a unit is connected right now.
        </p>
      </div>

      {!devices.length ? (
        <StateMessage
          kind="empty"
          title="No matching units"
          actions={<Button onClick={() => onSearch("")}>Clear search</Button>}
        >
          <p>Try a different name, device ID or workspace.</p>
        </StateMessage>
      ) : !shown.length ? (
        <StateMessage
          kind="empty"
          title="Nothing in this filter"
          actions={<Button onClick={() => setFilter("all")}>Show all units</Button>}
        >
          <p>No units on this page match that status.</p>
        </StateMessage>
      ) : (
        <ul className="b1-fleet-grid">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((device) => (
              <motion.li
                key={device.deviceId}
                layout="position"
                initial={{ opacity: 0.6, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <UnitCard
                  device={device}
                  entry={snapshots[device.deviceId]}
                  tone={tones[device.deviceId]}
                  now={now}
                  isNew={Boolean(fresh[device.deviceId])}
                  workspace={workspaceName(device)}
                  href={dashboardHref(device.deviceId, purpose)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {devices.length > 0 && (
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--b1-muted)]" aria-label="Unit pages">
          <p aria-live="polite">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredCount)} of {filteredCount}{" "}
            {search.trim() ? "matching " : ""}
            {filteredCount === 1 ? "unit" : "units"}
          </p>
          {lastPage > 0 && (
            <div className="flex items-center gap-3">
              <Button size="sm" icon={Icon.back} disabled={page === 0} onClick={() => onPage(page - 1)}>
                Previous
              </Button>
              <span>
                Page {page + 1} of {lastPage + 1}
              </span>
              <Button size="sm" disabled={page === lastPage} onClick={() => onPage(page + 1)}>
                Next {Icon.chevron}
              </Button>
            </div>
          )}
        </nav>
      )}
    </section>
  );
}

function UnitCard({
  device,
  entry,
  tone,
  now,
  isNew,
  workspace,
  href,
}: {
  device: FleetDevice;
  entry: SnapshotEntry | undefined;
  tone: UnitTone;
  now: number;
  isNew: boolean;
  workspace: string;
  href: string;
}) {
  const summary = entry?.status === "ready" ? deviceOverview(entry.snapshot, now) : null;
  const metrics = entry?.status === "ready" ? snapshotMetrics(entry.snapshot) : [];
  const primary = metrics.find((m) => m.label === summary?.label && m.value !== null);
  const secondary = metrics.filter((m) => m !== primary && m.value !== null).slice(0, 3);
  const statusText =
    entry?.status === "error" ? "Unable to load" : summary?.status ?? "Loading";
  return (
    <Link
      href={href}
      className="b1-unit"
      data-tone={tone}
      aria-label={`${device.name}. ${statusText}.${summary && summary.value !== "—" ? ` ${summary.label} ${summary.value} ${summary.unit}.` : ""} Open unit.`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="b1-unit-name">{device.name}</h2>
          <p className="b1-unit-meta">
            {workspace} · {device.isOwner ? "Owned by you" : "Read access"}
          </p>
        </div>
        {isNew && (
          <motion.span
            className="b1-new-badge"
            initial={{ scale: 0.8, opacity: 0.6 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            New reading
          </motion.span>
        )}
      </div>

      <div>
        {!entry ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            <Skeleton width="6rem" height="2.25rem" />
            <Skeleton width="9rem" height="0.75rem" />
          </div>
        ) : entry.status === "error" ? (
          <p className="text-sm text-[var(--b1-ink-2)]">{entry.message}</p>
        ) : summary && summary.value !== "—" ? (
          <>
            <p className="b1-unit-value">
              {summary.value}
              <small>{summary.unit}</small>
            </p>
            <p className="mt-1.5 text-xs text-[var(--b1-muted)]">{summary.label} · latest</p>
          </>
        ) : (
          <p className="text-sm text-[var(--b1-ink-2)]">
            {summary?.status ?? "No readings yet"}
          </p>
        )}
      </div>

      {secondary.length > 0 && (
        <p className="b1-unit-secondary">
          {secondary.map((m) => (
            <span key={m.field}>
              {shortLabels[m.field] ?? m.label} <b>{formatValue(m.value, m.digits)}</b> {m.unit}
            </span>
          ))}
        </p>
      )}

      <div className="b1-unit-foot">
        <span className="flex min-w-0 flex-col gap-1">
          <StatusIndicator tone={tone} label={statusText} />
          {summary && summary.age !== summary.status && (
            <span className="truncate">{summary.age}</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 font-semibold text-[var(--b1-ink-2)]">
          Open {Icon.chevron}
        </span>
      </div>
    </Link>
  );
}
