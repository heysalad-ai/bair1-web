"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DeviceOption } from "@/app/dashboard/page";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import {
  dashboardHref,
  decodeSnapshotBatch,
  deviceOverview,
  DEVICE_PAGE_SIZE,
  SNAPSHOT_BATCH_SIZE,
  snapshotBatchQuery,
  type SnapshotEntry,
} from "@/lib/device-overview";

export default function DeviceFleet({
  devices,
  workspaces,
  search,
  onSearch,
  onRefreshDevices,
  purpose = "home",
}: {
  devices: DeviceOption[];
  workspaces: Record<string, string>;
  search: string;
  onSearch: (value: string) => void;
  onRefreshDevices: () => Promise<void>;
  purpose?: string;
}) {
  const request = useAuthenticatedFetch();
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotEntry>>({});
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const filtered = useMemo(
    () =>
      devices
        .filter((device) =>
          [
            device.name,
            device.deviceId,
            workspaces[device.orgId] ??
              (device.isOwner && !device.orgId.startsWith("workspace:")
                ? "Personal devices"
                : "Workspace name unavailable"),
          ].some((text) =>
            text
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
          ),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.deviceId.localeCompare(b.deviceId),
        ),
    [devices, search, workspaces],
  );
  const lastPage = Math.max(
    0,
    Math.ceil(filtered.length / DEVICE_PAGE_SIZE) - 1,
  );
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(
    currentPage * DEVICE_PAGE_SIZE,
    (currentPage + 1) * DEVICE_PAGE_SIZE,
  );
  const idsKey = JSON.stringify(visible.map((device) => device.deviceId));
  useEffect(() => {
    const ids = JSON.parse(idsKey) as string[];
    const controller = new AbortController();
    let active = true,
      busy = false;
    async function refresh() {
      if (busy) return;
      busy = true;
      setRefreshing(ids.length > 0);
      for (
        let offset = 0;
        offset < ids.length && active;
        offset += SNAPSHOT_BATCH_SIZE
      ) {
        const batch = ids.slice(offset, offset + SNAPSHOT_BATCH_SIZE);
        let updates: Record<string, SnapshotEntry>;
        try {
          const response = await request("/api/graphql", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshotBatchQuery(batch)),
          });
          const result = await response.json();
          updates = decodeSnapshotBatch(batch, result, response.status);
        } catch {
          updates = Object.fromEntries(
            batch.map((id) => [
              id,
              {
                status: "error",
                message: "Readings unavailable. Try refreshing.",
              },
            ]),
          );
        }
        if (active) setSnapshots((current) => ({ ...current, ...updates }));
      }
      if (active) {
        setRefreshing(false);
        setNow(Date.now());
      }
      busy = false;
    }
    const start = setTimeout(() => void refresh(), 0);
    const polling = setInterval(() => void refresh(), 60_000);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(start);
      clearInterval(polling);
      clearInterval(clock);
    };
  }, [idsKey, request, revision]);

  function workspaceName(device: DeviceOption) {
    return (
      workspaces[device.orgId] ??
      (device.isOwner && !device.orgId.startsWith("workspace:")
        ? "Personal devices"
        : "Workspace name unavailable")
    );
  }
  return (
    <section className="device-fleet" aria-labelledby="fleet-heading">
      <div className="fleet-heading">
        <div>
          <h1 id="fleet-heading" className="text-3xl font-semibold">
            All devices
          </h1>
          <p>
            {purpose !== "home"
              ? `Choose a device to open its ${purpose === "analytics" ? "history" : purpose === "ai" ? "Air Guide" : "map"}.`
              : "Check each unit’s latest measurement, then open it for a closer look."}
          </p>
        </div>
        <span className="fleet-count">
          {devices.length} {devices.length === 1 ? "device" : "devices"}
        </span>
      </div>
      <div className="fleet-toolbar">
        <label className="fleet-search">
          Find a device
          <input
            type="search"
            value={search}
            placeholder="Name, device ID or workspace"
            onChange={(event) => {
              onSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <button
          type="button"
          className="access-button"
          disabled={refreshing || !visible.length}
          onClick={() => {
            setRevision((value) => value + 1);
            void onRefreshDevices();
          }}
        >
          {refreshing ? "Refreshing…" : "Refresh devices"}
        </button>
      </div>
      <p className="fleet-help">
        Reading age uses the sensor’s capture time. Recent data does not confirm
        that a device is currently connected.
      </p>
      {!filtered.length ? (
        <div className="fleet-empty">
          <h2 className="text-xl font-semibold">No matching devices</h2>
          <p>Try a different name, device ID or workspace.</p>
          <button
            className="access-button"
            onClick={() => {
              onSearch("");
              setPage(0);
            }}
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          <div className="fleet-columns" aria-hidden="true">
            <span>Device</span>
            <span>Latest measurement</span>
            <span>Reading age</span>
            <span />
          </div>
          <ul className="fleet-list">
            {visible.map((device) => {
              const entry = snapshots[device.deviceId];
              const summary =
                entry?.status === "ready"
                  ? deviceOverview(entry.snapshot, now)
                  : null;
              return (
                <li key={device.deviceId} className="fleet-unit">
                  <div className="fleet-identity">
                    <h2 className="text-base font-semibold">{device.name}</h2>
                    <p className="fleet-id">{device.deviceId}</p>
                    <p>
                      {workspaceName(device)} ·{" "}
                      {device.isOwner ? "Owned by you" : "Read access"}
                    </p>
                  </div>
                  <div className="fleet-reading">
                    {!entry ? (
                      <span
                        className="fleet-skeleton"
                        aria-label="Loading reading"
                      />
                    ) : (
                      <>
                        <span className="fleet-value">
                          {summary?.value ?? "—"}
                          <small>{summary?.unit ?? ""}</small>
                        </span>
                        <span>
                          {summary?.label ?? "Measurement unavailable"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="fleet-status">
                    {!entry ? (
                      <span className="fleet-loading">
                        Loading measurements…
                      </span>
                    ) : entry.status === "error" ? (
                      <>
                        <span className="fleet-state" data-freshness="error">
                          Unable to load
                        </span>
                        <span>{entry.message}</span>
                      </>
                    ) : (
                      <>
                        <span
                          className="fleet-state"
                          data-freshness={summary?.freshness}
                        >
                          {summary?.status}
                        </span>
                        {summary && summary.age !== summary.status && (
                          <span>{summary.age}</span>
                        )}
                      </>
                    )}
                  </div>
                  <Link
                    className="fleet-open"
                    href={dashboardHref(device.deviceId, purpose)}
                    aria-label={`View device ${device.name}`}
                  >
                    View device
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    >
                      <path
                        d="m9 5 7 7-7 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
          <nav className="fleet-pagination" aria-label="Device pages">
            <p aria-live="polite">
              {currentPage * DEVICE_PAGE_SIZE + 1}–
              {Math.min((currentPage + 1) * DEVICE_PAGE_SIZE, filtered.length)}{" "}
              of {filtered.length} {search.trim() ? "matching " : ""}devices
            </p>
            {lastPage > 0 && (
              <div>
                <button
                  className="access-button"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage + 1} of {lastPage + 1}
                </span>
                <button
                  className="access-button"
                  disabled={currentPage === lastPage}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </nav>
        </>
      )}
    </section>
  );
}
