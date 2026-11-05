"use client";
import { useCallback, useEffect, useState } from "react";
import type { DeviceOption } from "@/app/dashboard/page";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";

type Workspace = { workspaceId: string; name: string; role: string };
type Member = { userId: string; role: string; revokedAt?: string | null };
type Share = { id: string; expiresAt: number; revokedAt: string | null };
export default function AccessView({
  device,
  onChange,
  mode = "all",
}: {
  device?: DeviceOption;
  onChange: () => Promise<void>;
  mode?: "all" | "enroll" | "sharing";
}) {
  const request = useAuthenticatedFetch();
  const [now] = useState(() => Date.now());
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const call = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const response = await request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [request],
  );
  const load = useCallback(async () => {
    const result = await call("/api/workspaces");
    setWorkspaces(result.workspaces);
    setEnabled(result.enabled);
  }, [call]);
  useEffect(() => {
    let active = true;
    if (mode === "enroll") return;
    const timer = setTimeout(() => {
      void load().catch((e) => {
        if (active) setStatus(e.message);
      });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [load, mode]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setShares([]);
      setSecret("");
      if (mode !== "enroll" && device?.permissions.includes("share"))
        void call(`/api/devices/${encodeURIComponent(device.deviceId)}/share`)
          .then((result) => {
            if (active) setShares(result.shares);
          })
          .catch((e) => {
            if (active) setStatus(e.message);
          });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [device?.deviceId, device?.permissions, call, mode]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    setSecret("");
    try {
      await action();
      setStatus("Changes saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Request failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function showMembers(id: string) {
    setWorkspace(id);
    setMembers([]);
    if (id) {
      const data = await call(
        `/api/workspaces?workspaceId=${encodeURIComponent(id)}`,
      );
      setMembers(data.members);
    }
  }
  return (
    <section className="space-y-10">
      {mode === "all" && (
        <div>
          <h1 className="text-3xl font-semibold">Devices & access</h1>
        </div>
      )}
      {(busy || status) && (
        <p role="status" aria-live="polite" className="break-words text-sm">
          {busy ? "Saving…" : status}
        </p>
      )}
      {mode !== "sharing" && (
        <section id="device-enrollment">
          <h2 className="text-xl font-semibold">Enroll your device</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Use the device ID from the serial monitor and the one-time code
            supplied by Bair1. Your API key is created in the next step; it is
            not the enrollment code.
          </p>
          <form
            className="mt-6 grid gap-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void act(async () => {
                await call(
                  "/api/developer/devices",
                  "POST",
                  Object.fromEntries(data),
                );
                form.reset();
                await onChange();
              });
            }}
          >
            <label className="text-sm">
              Device ID
              <input
                className="access-input"
                name="deviceId"
                required
                maxLength={100}
                autoComplete="off"
              />
            </label>
            <label className="text-sm">
              Name
              <input
                className="access-input"
                name="name"
                required
                maxLength={80}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              One-time enrollment code
              <input
                className="access-input"
                name="enrollmentCode"
                type="password"
                autoComplete="off"
                required
                maxLength={100}
                minLength={20}
                aria-describedby="enrollment-code-help"
              />
            </label>
            <p
              id="enrollment-code-help"
              className="text-sm text-muted sm:col-span-2"
            >
              No code, or an expired code? Ask Bair1 to provision this board.
              Uploading first will return 404.
            </p>
            <button
              disabled={busy}
              className="access-button justify-self-start"
            >
              {busy ? "Enrolling…" : "Enroll device privately"}
            </button>
          </form>
        </section>
      )}
      {mode !== "enroll" && device?.permissions.includes("manage") && (
        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-semibold">{device.name}: visibility</h2>
          <form
            key={device.deviceId + device.visibility + device.orgId}
            className="mt-4 flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void act(async () => {
                await call("/api/developer/devices", "PATCH", {
                  deviceId: device.deviceId,
                  name: data.get("name"),
                  ...(device.isOwner
                    ? {
                        visibility: data.get("visibility"),
                        ...(data.get("workspaceId")
                          ? { workspaceId: data.get("workspaceId") }
                          : {}),
                      }
                    : {}),
                });
                await onChange();
              });
            }}
          >
            <label className="text-sm">
              Name
              <input
                name="name"
                className="access-input"
                defaultValue={device.name}
                maxLength={80}
                required
              />
            </label>
            {device.isOwner && (
              <>
                <label className="text-sm">
                  Visibility
                  <select
                    name="visibility"
                    className="access-input"
                    defaultValue={device.visibility}
                  >
                    <option value="private">Private</option>
                    <option value="workspace">Workspace members</option>
                    <option value="public">Published feed</option>
                  </select>
                </label>
                <label className="text-sm">
                  Workspace
                  <select
                    name="workspaceId"
                    className="access-input"
                    defaultValue={
                      workspaces.some((w) => w.workspaceId === device.orgId)
                        ? device.orgId
                        : ""
                    }
                  >
                    <option value="">Keep current workspace</option>
                    {workspaces.map((w) => (
                      <option key={w.workspaceId} value={w.workspaceId}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button disabled={busy} className="access-button">
              Save device
            </button>
          </form>
          <p className="mt-3 text-sm text-muted">
            Workspace visibility grants access to all retained device history.
            Moving between workspaces requires a reviewed migration. Publishing
            also requires the platform&apos;s feed allowlist. It exposes a
            restricted particulate feed. Precise location, diagnostics and
            environmental device details stay private.
          </p>
        </section>
      )}
      {mode !== "enroll" && device?.permissions.includes("share") && (
        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-semibold">Read-only links</h2>
          <p className="mt-2 text-sm text-muted">
            Anyone with a link can view this device&apos;s shared snapshot until
            expiry or revocation. Share links include environmental data and
            connection history; review before sending. Precise coordinates are
            omitted.
          </p>
          <form
            className="my-4 flex items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const hours = Number(new FormData(e.currentTarget).get("hours"));
              void act(async () => {
                const result = await call(
                  `/api/devices/${encodeURIComponent(device.deviceId)}/share`,
                  "POST",
                  { hours },
                );
                setSecret(result.url);
                const list = await call(
                  `/api/devices/${encodeURIComponent(device.deviceId)}/share`,
                );
                setShares(list.shares);
              });
            }}
          >
            <label className="text-sm">
              Expires in (hours)
              <input
                className="access-input"
                type="number"
                name="hours"
                min={1}
                max={168}
                defaultValue={24}
                required
              />
            </label>
            <button disabled={busy || !enabled} className="access-button">
              Create link
            </button>
          </form>
          <ul className="divide-y divide-border">
            {shares.map((share) => (
              <li
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span>
                  {share.revokedAt
                    ? "Revoked"
                    : share.expiresAt * 1000 < now
                      ? "Expired"
                      : "Active"}{" "}
                  · expires{" "}
                  {new Date(share.expiresAt * 1000).toLocaleString("en-GB")}
                </span>
                {!share.revokedAt && (
                  <button
                    disabled={busy}
                    className="access-button"
                    onClick={() =>
                      act(async () => {
                        await call(
                          `/api/devices/${encodeURIComponent(device.deviceId)}/share?id=${encodeURIComponent(share.id)}`,
                          "DELETE",
                        );
                        setShares(
                          shares.map((s) =>
                            s.id === share.id
                              ? { ...s, revokedAt: new Date().toISOString() }
                              : s,
                          ),
                        );
                      })
                    }
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {mode !== "enroll" && (
        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-semibold">Workspaces</h2>
          {enabled === null ? (
            <p className="mt-3 text-muted" role="status">
              Loading workspaces…
            </p>
          ) : !enabled ? (
            <p className="mt-3 text-muted">
              Workspace invitations and sharing are awaiting platform
              configuration. Personal device access remains available.
            </p>
          ) : (
            <>
              <ul className="my-4 divide-y divide-border">
                {workspaces.map((w) => (
                  <li
                    key={w.workspaceId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span>
                      {w.name} · {w.role}
                    </span>
                    {w.role === "owner" && (
                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          className="access-button"
                          onClick={() =>
                            act(async () => {
                              const invite = await call(
                                "/api/workspaces",
                                "POST",
                                {
                                  action: "invite",
                                  workspaceId: w.workspaceId,
                                },
                              );
                              setSecret(
                                JSON.stringify({
                                  workspaceId: w.workspaceId,
                                  token: invite.token,
                                }),
                              );
                            })
                          }
                        >
                          Create 24h invitation
                        </button>
                        <button
                          disabled={busy}
                          className="access-button"
                          onClick={() => act(() => showMembers(w.workspaceId))}
                        >
                          Members
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <form
                className="flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void act(async () => {
                    await call("/api/workspaces", "POST", {
                      name: data.get("name"),
                    });
                    await load();
                  });
                }}
              >
                <label className="text-sm">
                  New workspace name
                  <input
                    className="access-input"
                    name="name"
                    maxLength={80}
                    required
                  />
                </label>
                <button disabled={busy} className="access-button">
                  Create workspace
                </button>
              </form>
              <form
                className="mt-6 flex flex-wrap items-end gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void act(async () => {
                    const invitation = JSON.parse(
                      String(data.get("invitation")),
                    );
                    await call("/api/workspaces", "POST", {
                      ...invitation,
                      action: "accept",
                    });
                    await load();
                    await onChange();
                  });
                }}
              >
                <label className="text-sm flex-1">
                  Invitation JSON
                  <input
                    className="access-input"
                    name="invitation"
                    autoComplete="off"
                    required
                  />
                </label>
                <button disabled={busy} className="access-button">
                  Accept invitation
                </button>
              </form>
              {workspace && (
                <div className="mt-6">
                  <h3 className="font-semibold">Workspace members</h3>
                  {members
                    .filter((m) => !m.revokedAt)
                    .map((m) => (
                      <div
                        key={m.userId}
                        className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-3"
                      >
                        <span className="break-all text-sm">
                          {m.userId} · {m.role}
                        </span>
                        {m.role !== "owner" && (
                          <select
                            aria-label={`Role for ${m.userId}`}
                            value={m.role}
                            disabled={busy}
                            className="access-input max-w-40"
                            onChange={(e) => {
                              const role = e.target.value || null;
                              void act(async () => {
                                await call("/api/workspaces", "PATCH", {
                                  workspaceId: workspace,
                                  userId: m.userId,
                                  role,
                                });
                                await showMembers(workspace);
                                await onChange();
                              });
                            }}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                            <option value="">Revoke access</option>
                          </select>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
      )}
      {secret && (
        <div className="border-t border-border pt-6">
          <label className="text-sm font-semibold">
            New link or invitation — copy and send privately
            <textarea
              readOnly
              value={secret}
              className="access-input min-h-24"
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <button className="access-button mt-3" onClick={() => setSecret("")}>
            Hide
          </button>
        </div>
      )}
    </section>
  );
}
