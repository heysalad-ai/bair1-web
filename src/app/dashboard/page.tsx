"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DeviceFleet from "@/components/DeviceFleet";
import DeviceDetail from "@/components/DeviceDetail";
import { snapshotTone, type SnapshotState } from "@/components/device/DeviceDetailView";
import BearFigure from "@/components/bear/BearFigure";
import StateMessage from "@/components/ui/StateMessage";
import { Breadcrumbs, Button, StatusIndicator } from "@/components/ui/kit";
import { MotionConfig, motion } from "framer-motion";
import { dashboardHref } from "@/lib/device-overview";
import { useAuth0 } from "@auth0/auth0-react";
import Logo from "@/components/Logo";
import Navigation, { type Tab, type ViewerRole } from "@/components/Navigation";
import MapView from "@/components/MapView";
import AIChatView from "@/components/AIChatView";
import AdminView from "@/components/AdminView";
import ConnectionView from "@/components/ConnectionView";
import {
  ReadingHistory,
  type Measurement,
} from "@/components/MeasurementView";
import { readingFieldNames } from "@/lib/measurement-contract";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";

export type DeviceOption = {
  deviceId: string;
  name: string;
  orgId: string;
  visibility: string;
  permissions: string[];
  isOwner: boolean;
  lat: number | null;
  lng: number | null;
};
export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <main className="m-auto p-8" role="status">
          Loading devices…
        </main>
      }
    >
      <AccountDashboard />
    </Suspense>
  );
}
function AccountDashboard() {
  const { user } = useAuth0();
  return <DashboardContent key={user?.sub ?? "signed-out"} />;
}
function DashboardContent() {
  const { isLoading, isAuthenticated, loginWithRedirect, logout, user } =
    useAuth0();
  const request = useAuthenticatedFetch();
  const router = useRouter();
  const params = useSearchParams();
  const requestedDevice = params.get("device") ?? "";
  const requestedView = params.get("view");
  const requestedTab: Tab = [
    "map",
    "analytics",
    "ai",
    "developer",
    "admin",
  ].includes(requestedView ?? "")
    ? (requestedView as Tab)
    : "home";
  const [fleetSearch, setFleetSearch] = useState("");
  function setTab(next: Tab) {
    router.push(
      dashboardHref(next === "home" ? undefined : requestedDevice, next),
    );
  }
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const selected = devices.some((device) => device.deviceId === requestedDevice)
    ? requestedDevice
    : "";
  const [workspaces, setWorkspaces] = useState<Record<string, string>>({});
  const [snapshotDenied, setSnapshotDenied] = useState(false);
  const [role, setRole] = useState<ViewerRole>("user");
  const tab =
    requestedTab === "admin" && role !== "super_admin" ? "home" : requestedTab;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<{
    deviceId: string;
    reading: Measurement | null;
    telemetry: Measurement | null;
  } | null>(null);
  const [snapshotError, setSnapshotError] = useState("");
  const [snapshotRevision, setSnapshotRevision] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState(0);
  const deviceLoadBusy = useRef(false);
  const loadDevices = useCallback(async () => {
    if (deviceLoadBusy.current) return;
    deviceLoadBusy.current = true;
    setState((current) => (current === "ready" ? "ready" : "loading"));
    setError("");
    try {
      const response = await request("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "{ viewer { role } registeredDevices { deviceId name orgId visibility isOwner permissions lat lng } }",
        }),
      });
      const result = await response.json();
      if (!response.ok || result.errors)
        throw new Error(
          response.status === 401
            ? "Your session expired. Please sign in again."
            : "Devices could not be loaded. Try again.",
        );
      try {
        const workspaceResponse = await request("/api/workspaces");
        if (workspaceResponse.ok) {
          const data = await workspaceResponse.json();
          setWorkspaces(
            Object.fromEntries(
              (data.workspaces ?? []).map(
                (workspace: { workspaceId: string; name: string }) => [
                  workspace.workspaceId,
                  workspace.name,
                ],
              ),
            ),
          );
        }
      } catch {
        setWorkspaces({});
      }
      const list = result.data.registeredDevices as DeviceOption[];
      setDevices(list);
      setRole(result.data.viewer.role);
      setState("ready");
    } catch (e) {
      setDevices([]);
      setState("error");
      setError(e instanceof Error ? e.message : "Devices unavailable");
    } finally {
      deviceLoadBusy.current = false;
    }
  }, [request]);
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => void loadDevices(), 0);
      const interval = setInterval(() => void loadDevices(), 60_000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [isAuthenticated, loadDevices]);
  useEffect(() => {
    if (!selected || !isAuthenticated) return;
    const controller = new AbortController();
    let active = true;
    async function refresh() {
      try {
        const response = await request("/api/graphql", {
          signal: controller.signal,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query Snapshot($id: String!) { latestReading(deviceId: $id) { ${readingFieldNames.join(" ")} } notecardTelemetry(deviceId: $id) { capturedAt receivedAt temperature humidity pressure pressureUnit batteryVoltage motion temperatureAt humidityAt pressureAt batteryVoltageAt motionAt measurementAt sourceFile transport } }`,
            variables: { id: selected },
          }),
        });
        const result = await response.json();
        if (!response.ok || result.errors) {
          const denied =
            [401, 403, 404].includes(response.status) ||
            result.errors?.some((error: { extensions?: { code?: string } }) =>
              ["NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN"].includes(
                error.extensions?.code ?? "",
              ),
            );
          if (active) {
            setSnapshot(null);
            setSnapshotDenied(Boolean(denied));
            setSnapshotError(
              denied
                ? "Your session or device access changed. Refresh your devices or sign in again."
                : "Measurements are temporarily unavailable. Please try again.",
            );
          }
          return;
        }
        if (active) {
          setSnapshot({
            deviceId: selected,
            reading: result.data.latestReading,
            telemetry: result.data.notecardTelemetry,
          });
          setSnapshotError("");
          setSnapshotDenied(false);
          setSnapshotAt(Date.now());
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        if (active) {
          setSnapshot(null);
          setSnapshotDenied(false);
          setSnapshotError(
            e instanceof Error ? e.message : "Measurements unavailable",
          );
        }
      }
    }
    const timer = setTimeout(() => {
      setSnapshotError("");
      void refresh();
    }, 0);
    const interval = setInterval(refresh, 60000);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [selected, isAuthenticated, request, snapshotRevision]);
  const device = devices.find((d) => d.deviceId === selected);
  const current = snapshot?.deviceId === selected ? snapshot : null;
  const snapshotState: SnapshotState = snapshotError
    ? { status: snapshotDenied ? "denied" : "error", message: snapshotError }
    : current
      ? {
          status: "ready",
          snapshot: { reading: current.reading, telemetry: current.telemetry },
        }
      : { status: "loading" };
  const retrySnapshot = () => {
    setSnapshotError("");
    setSnapshotRevision((value) => value + 1);
    void loadDevices();
  };
  if (isLoading)
    return (
      <main className="m-auto p-8" role="status">
        Loading your account…
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className="m-auto w-full max-w-md p-8">
        <Logo />
        <div className="b1-bear mt-10">
          <div className="b1-bear-figure">
            <BearFigure mood="idle" size={88} />
          </div>
          <p className="b1-bubble">Sign in and I’ll show you your units.</p>
        </div>
        <h1 className="b1-title mt-8">Your devices, your data</h1>
        <p className="b1-sub my-5">
          Sign in to view your measurements and manage access.
        </p>
        <Button
          variant="primary"
          onClick={() =>
            loginWithRedirect({
              appState: {
                returnTo: `${window.location.pathname}${window.location.search}`,
              },
            })
          }
        >
          Sign in
        </Button>
      </main>
    );
  const tone = snapshotTone(snapshotState, snapshotAt);
  const workspaceLabel = device
    ? (workspaces[device.orgId] ??
      (device.isOwner && !device.orgId.startsWith("workspace:")
        ? "Personal devices"
        : "Workspace name unavailable"))
    : "";
  const tabs: { id: Tab; label: string }[] = [
    { id: "home", label: "Overview" },
    { id: "analytics", label: "History & export" },
    { id: "map", label: "Map" },
    { id: "ai", label: "Air Guide" },
    { id: "developer", label: "Device & access" },
  ];
  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-screen min-w-0 flex-1 lg:pl-64">
        <header className="border-b border-[var(--b1-line)] px-5 py-4 lg:px-10">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
            <Breadcrumbs
              items={
                device
                  ? [
                      { label: "All units", href: "/dashboard" },
                      { label: device.name },
                    ]
                  : [{ label: "All units" }]
              }
            />
            <div className="flex items-center gap-3 text-sm">
              <span className="max-w-[16rem] truncate text-[var(--b1-ink-2)]">
                {user?.name}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  logout({ logoutParams: { returnTo: window.location.origin } })
                }
              >
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-5 py-8 pb-28 lg:px-10">
          {state === "loading" && (
            <StateMessage kind="loading" title="Loading your units…" headingLevel={1}>
              <p>Fetching the units you can access.</p>
            </StateMessage>
          )}
          {state === "error" && (
            <StateMessage
              kind="error"
              title="Units unavailable"
              headingLevel={1}
              actions={<Button onClick={loadDevices}>Retry</Button>}
            >
              <p>{error}</p>
            </StateMessage>
          )}
          {state === "ready" && (
            <motion.div
              key={`${selected}|${tab}`}
              initial={{ opacity: 0.6, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {tab === "developer" ? (
                <ConnectionView device={device} onChange={loadDevices} />
              ) : tab === "admin" && role === "super_admin" ? (
                <AdminView />
              ) : !devices.length ? (
                <StateMessage
                  kind="empty"
                  title="Connect your first unit"
                  headingLevel={1}
                  actions={
                    <Button variant="primary" onClick={() => setTab("developer")}>
                      Enrol a device
                    </Button>
                  }
                >
                  <p>
                    Use the one-time enrolment code supplied with your device.
                    Devices stay private until their owner chooses another
                    visibility.
                  </p>
                </StateMessage>
              ) : !device ? (
                <>
                  {requestedDevice && (
                    <p
                      className="mb-6 rounded-xl border border-[var(--b1-line-strong)] bg-[var(--b1-surface)] px-4 py-3 text-sm"
                      role="status"
                    >
                      That unit is unavailable or your access changed. Choose a
                      unit below.
                    </p>
                  )}
                  <DeviceFleet
                    devices={devices}
                    workspaces={workspaces}
                    search={fleetSearch}
                    onSearch={setFleetSearch}
                    onRefreshDevices={loadDevices}
                    purpose={tab}
                  />
                </>
              ) : (
                <>
                  <div className="mb-6 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <h1 className="b1-title min-w-0 break-words">
                        {device.name}
                      </h1>
                      <StatusIndicator tone={tone} pill />
                    </div>
                    <p className="b1-sub break-words">
                      {device.visibility === "workspace"
                        ? "Workspace access"
                        : device.visibility === "public"
                          ? "Published feed enabled"
                          : "Private device"}{" "}
                      ·{" "}
                      {device.isOwner
                        ? "You own this device"
                        : "You can view this device"}{" "}
                      · {workspaceLabel}
                    </p>
                  </div>
                  <nav className="b1-tabs mb-8" aria-label="Unit views">
                    {tabs.map((item) => (
                      <Link
                        key={item.id}
                        href={dashboardHref(selected, item.id)}
                        aria-current={tab === item.id ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </nav>
                  {tab === "home" && (
                    <DeviceDetail
                      key={selected}
                      device={device}
                      snapshotState={snapshotState}
                      onRetrySnapshot={retrySnapshot}
                    />
                  )}
                  {tab === "analytics" && (
                    <ReadingHistory key={selected} deviceId={selected} />
                  )}
                  {tab === "map" && <MapView key={selected} deviceId={selected} />}
                  {tab === "ai" && (
                    <div>
                      <p className="mb-5 text-sm text-muted">
                        Air Guide uses the selected device and external
                        environmental context. Generated advice is separate
                        from sensor measurements.
                      </p>
                      <AIChatView
                        key={selected}
                        deviceId={selected}
                        lat={device.lat}
                        lng={device.lng}
                      />
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>
        <Navigation active={tab} onChange={setTab} role={role} />
      </main>
    </MotionConfig>
  );
}
