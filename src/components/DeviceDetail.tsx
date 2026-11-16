"use client";

import { useEffect, useState } from "react";
import DeviceDetailView, {
  type DetailDevice,
  type HistoryState,
  type Row,
  type SnapshotState,
} from "@/components/device/DeviceDetailView";
import { captureKey } from "@/lib/fleet-insights";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { useTransient } from "@/lib/use-transient";

/**
 * Data container for one unit's overview. History comes from the existing
 * authenticated per-device export endpoint, bounded to 200 records per load.
 */
export default function DeviceDetail({
  device,
  snapshotState,
  onRetrySnapshot,
}: {
  device: DetailDevice;
  snapshotState: SnapshotState;
  onRetrySnapshot: () => void;
}) {
  const request = useAuthenticatedFetch();
  const [windowHours, setWindowHours] = useState(0);
  const [field, setField] = useState("");
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [history, setHistory] = useState<HistoryState>({
    rows: [],
    busy: true,
    error: "",
    more: false,
    fetchedAt: null,
  });

  const capture =
    snapshotState.status === "ready" ? captureKey(snapshotState.snapshot) : null;
  const newReading = useTransient(capture);

  // A newer capture refreshes the graph so the chart and tiles agree.
  const [lastCapture, setLastCapture] = useState(capture);
  if (capture !== lastCapture) {
    setLastCapture(capture);
    if (lastCapture !== null && capture !== null && capture > lastCapture)
      setRevision((value) => value + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      setHistory((current) => ({ ...current, busy: true, error: "" }));
      try {
        const query = new URLSearchParams({ limit: "200" });
        if (windowHours) {
          const to = Date.now();
          query.set("from", new Date(to - windowHours * 3600_000).toISOString());
          query.set("to", new Date(to).toISOString());
        }
        const response = await request(
          `/api/devices/${encodeURIComponent(device.deviceId)}/export?${query}`,
          { signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 403 || response.status === 404
              ? "These readings are unavailable or your access changed. Refresh your devices to check access."
              : "History couldn’t be loaded. Try again.",
          );
        const result = await response.json();
        if (!active) return;
        setHistory({
          rows: (result.data ?? []) as Row[],
          busy: false,
          error: "",
          more: Boolean(result.nextCursor),
          fetchedAt: Date.now(),
        });
        setNow(Date.now());
      } catch (cause) {
        if (!active) return;
        setHistory({
          rows: [],
          busy: false,
          error: cause instanceof Error ? cause.message : "History unavailable. Try again.",
          more: false,
          fetchedAt: null,
        });
      } finally {
        inFlight = false;
      }
    }
    void load();
    const timer = setInterval(load, 60_000);
    const clock = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [device.deviceId, windowHours, request, revision]);

  return (
    <DeviceDetailView
      device={device}
      snapshotState={snapshotState}
      onRetrySnapshot={onRetrySnapshot}
      history={history}
      windowHours={windowHours}
      onWindow={(hours) => {
        setHistory((current) => ({ ...current, rows: [], more: false }));
        setWindowHours(hours);
      }}
      onRefreshHistory={() => setRevision((value) => value + 1)}
      field={field}
      onField={setField}
      now={now}
      newReading={newReading}
    />
  );
}
