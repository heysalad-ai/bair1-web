"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DeviceFleet from "@/components/DeviceFleet";
import { dashboardHref } from "@/lib/device-overview";
import { useAuth0 } from "@auth0/auth0-react";
import Logo from "@/components/Logo";
import Navigation, { type Tab, type ViewerRole } from "@/components/Navigation";
import MapView from "@/components/MapView";
import AIChatView from "@/components/AIChatView";
import AdminView from "@/components/AdminView";
import ConnectionView from "@/components/ConnectionView";
import {
  MeasurementView,
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
  const loadDevices = useCallback(async () => {
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
    }
  }, [request]);
  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => void loadDevices(), 0);
      return () => clearTimeout(timer);
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
        }
      } catch (e) {
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
  }, [selected, isAuthenticated, request]);
  const device = devices.find((d) => d.deviceId === selected);
  const current = snapshot?.deviceId === selected ? snapshot : null;
  if (isLoading)
    return (
      <main className="m-auto p-8" role="status">
        Loading your account…
      </main>
    );
  if (!isAuthenticated)
    return (
      <main className="m-auto max-w-md p-8">
        <Logo />
        <h1 className="mt-8 text-3xl font-semibold">Your devices, your data</h1>
        <p className="my-5 text-muted">
          Sign in to view your measurements and manage access.
        </p>
        <button
          className="access-button"
          onClick={() =>
            loginWithRedirect({
              appState: {
                returnTo: `${window.location.pathname}${window.location.search}`,
              },
            })
          }
        >
          Sign in
        </button>
      </main>
    );
  return (
    <main className="min-h-screen flex-1 lg:pl-64">
      <header className="border-b border-border px-5 py-4 lg:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <nav className="fleet-breadcrumb" aria-label="Device navigation">
            <Link href="/dashboard" aria-current={!device ? "page" : undefined}>
              All devices
            </Link>
            {device && (
              <>
                <span aria-hidden="true">/</span>
                <span className="fleet-current">{device.name}</span>
              </>
            )}
          </nav>
          <div className="text-sm">
            <span>{user?.name}</span>
            <button
              className="ml-4 underline underline-offset-4"
              onClick={() =>
                logout({ logoutParams: { returnTo: window.location.origin } })
              }
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 pb-28 lg:px-10">
        {state === "loading" && <p role="status">Loading devices…</p>}
        {state === "error" && (
          <div role="alert">
            <p>{error}</p>
            <button onClick={loadDevices} className="access-button mt-4">
              Retry
            </button>
          </div>
        )}
        {state === "ready" && (
          <>
            {tab === "developer" ? (
              <ConnectionView device={device} onChange={loadDevices} />
            ) : tab === "admin" && role === "super_admin" ? (
              <AdminView />
            ) : !devices.length ? (
              <section>
                <h1 className="text-3xl font-semibold">
                  Connect your first device
                </h1>
                <p className="my-4 max-w-xl text-muted">
                  Use the one-time enrollment code supplied for your device.
                  Devices stay private until their owner chooses another
                  visibility.
                </p>
                <button
                  className="access-button"
                  onClick={() => setTab("developer")}
                >
                  Enroll a device
                </button>
              </section>
            ) : !device ? (
              <>
                {requestedDevice && (
                  <p className="mb-6 text-sm" role="status">
                    That device is unavailable or your access changed. Choose a
                    device below.
                  </p>
                )}
                <DeviceFleet
                  devices={devices}
                  workspaces={workspaces}
                  search={fleetSearch}
                  onSearch={setFleetSearch}
                  purpose={tab}
                />
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="text-3xl font-semibold">{device.name}</h1>
                  <p className="fleet-detail-id">{device.deviceId}</p>
                  <p className="mt-2 break-words text-sm text-muted">
                    {device.visibility === "workspace"
                      ? "Workspace access"
                      : device.visibility === "public"
                        ? "Published feed enabled"
                        : "Private device"}{" "}
                    ·{" "}
                    {device.isOwner
                      ? "You own this device"
                      : "You can view this device"}{" "}
                    · Workspace:{" "}
                    {workspaces[device.orgId] ??
                      (device.isOwner && !device.orgId.startsWith("workspace:")
                        ? "Personal devices"
                        : "Name unavailable")}
                  </p>
                </div>
                <nav className="fleet-detail-tabs" aria-label="Device views">
                  <Link
                    href={dashboardHref(selected)}
                    aria-current={tab === "home" ? "page" : undefined}
                  >
                    Measurements
                  </Link>
                  <Link
                    href={dashboardHref(selected, "analytics")}
                    aria-current={tab === "analytics" ? "page" : undefined}
                  >
                    History & export
                  </Link>
                  <Link
                    href={dashboardHref(selected, "map")}
                    aria-current={tab === "map" ? "page" : undefined}
                  >
                    Map
                  </Link>
                  <Link href={dashboardHref(selected, "developer")}>
                    Device & access
                  </Link>
                </nav>
                {tab === "home" &&
                  (snapshotError ? (
                    <div role="alert">
                      <h2 className="mb-2 text-xl font-semibold">
                        {snapshotDenied
                          ? "Access unavailable"
                          : "Service unavailable"}
                      </h2>
                      <p>{snapshotError}</p>
                      <button
                        className="access-button mt-4"
                        onClick={loadDevices}
                      >
                        Refresh devices
                      </button>
                    </div>
                  ) : current ? (
                    <MeasurementView
                      focused
                      reading={current.reading}
                      telemetry={current.telemetry}
                    />
                  ) : (
                    <p role="status">Loading measurements…</p>
                  ))}
                {tab === "analytics" && (
                  <ReadingHistory key={selected} deviceId={selected} />
                )}
                {tab === "map" && (
                  <MapView key={selected} deviceId={selected} />
                )}
                {tab === "ai" && (
                  <div>
                    <p className="mb-5 text-sm text-muted">
                      Air Guide uses the selected device and external
                      environmental context. Generated advice is separate from
                      sensor measurements.
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
          </>
        )}
      </div>
      <Navigation active={tab} onChange={setTab} role={role} />
    </main>
  );
}
