"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DeviceOption } from "@/app/dashboard/page";
import FleetView from "@/components/fleet/FleetView";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import {
  decodeSnapshotBatch,
  DEVICE_PAGE_SIZE,
  SNAPSHOT_BATCH_SIZE,
  snapshotBatchQuery,
  type SnapshotEntry,
} from "@/lib/device-overview";
import { entryCaptureKey, hasNewCapture } from "@/lib/fleet-insights";

const NEW_READING_MS = 8_000;

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
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Record<string, number>>({});
  const seen = useRef(new Map<string, number | null>());

  const workspaceName = useMemo(
    () => (device: { orgId: string; isOwner: boolean }) =>
      workspaces[device.orgId] ??
      (device.isOwner && !device.orgId.startsWith("workspace:")
        ? "Personal devices"
        : "Workspace name unavailable"),
    [workspaces],
  );
  const filtered = useMemo(
    () =>
      devices
        .filter((device) =>
          [device.name, device.deviceId, workspaceName(device)].some((text) =>
            text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
          ),
        )
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) || a.deviceId.localeCompare(b.deviceId),
        ),
    [devices, search, workspaceName],
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / DEVICE_PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(
    currentPage * DEVICE_PAGE_SIZE,
    (currentPage + 1) * DEVICE_PAGE_SIZE,
  );
  const idsKey = JSON.stringify(visible.map((device) => device.deviceId));

  // Bounded: only the visible page (≤24 units) in batches of 4, latest values only.
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
          if (!active) break;
          updates = Object.fromEntries(
            batch.map((id) => [
              id,
              { status: "error", message: "Readings unavailable. Try refreshing." },
            ]),
          );
        }
        if (!active) break;
        const arrivals: Record<string, number> = {};
        for (const [id, entry] of Object.entries(updates)) {
          const next = entryCaptureKey(entry);
          if (hasNewCapture(seen.current.get(id), next)) arrivals[id] = Date.now();
          if (next !== null || !seen.current.has(id)) seen.current.set(id, next);
        }
        setSnapshots((current) => ({ ...current, ...updates }));
        if (Object.keys(arrivals).length)
          setFresh((current) => ({ ...current, ...arrivals }));
      }
      if (active) {
        setRefreshing(false);
        setNow(Date.now());
        setFetchedAt(Date.now());
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

  // "New reading" cues expire on their own.
  useEffect(() => {
    if (!Object.keys(fresh).length) return;
    const timer = setTimeout(() => {
      const cutoff = Date.now() - NEW_READING_MS;
      setFresh((current) =>
        Object.fromEntries(Object.entries(current).filter(([, at]) => at > cutoff)),
      );
    }, NEW_READING_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  return (
    <FleetView
      devices={visible}
      total={devices.length}
      workspaceName={workspaceName}
      search={search}
      onSearch={(value) => {
        onSearch(value);
        setPage(0);
      }}
      snapshots={snapshots}
      now={now}
      refreshing={refreshing}
      onRefresh={() => {
        setRevision((value) => value + 1);
        void onRefreshDevices();
      }}
      fresh={fresh}
      page={currentPage}
      lastPage={lastPage}
      filteredCount={filtered.length}
      pageSize={DEVICE_PAGE_SIZE}
      onPage={setPage}
      purpose={purpose}
      fetchedAt={fetchedAt}
    />
  );
}
