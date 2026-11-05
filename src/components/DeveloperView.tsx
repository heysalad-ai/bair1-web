"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ApiKeyScope } from "@/lib/api-keys";
import type { Device } from "@/lib/devices";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { keyPresets, uploadConfig, type KeyPurpose } from "@/lib/device-setup";

type KeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  deviceId?: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
const scopes: { value: ApiKeyScope; label: string }[] = [
  { value: "read:devices", label: "List devices" },
  { value: "read:readings", label: "Read measurements" },
  { value: "export:readings", label: "Export measurements" },
  { value: "write:readings", label: "Upload measurements" },
  { value: "write:devices", label: "Write devices" },
];
async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || "Request failed. Please try again.");
  return body as T;
}

export default function DeveloperView({
  preferredDevice = "",
  onEnroll,
}: {
  preferredDevice?: string;
  onEnroll?: () => void;
}) {
  const request = useAuthenticatedFetch();
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [purpose, setPurpose] = useState<KeyPurpose>("firmware");
  const [selectedScopes, setScopes] = useState<ApiKeyScope[]>(
    keyPresets.firmware,
  );
  const [name, setName] = useState("Factory upload");
  const [deviceId, setDeviceId] = useState("");
  const [newKey, setNewKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokeId, setRevokeId] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNewKey("");
    setReveal(false);
    try {
      const [k, d] = await Promise.all([
        request("/api/developer/api-keys").then(json<{ keys: KeyRecord[] }>),
        request("/api/developer/devices").then(json<{ devices: Device[] }>),
      ]);
      setKeys(k.keys);
      setDevices(d.devices);
      setDeviceId((current) =>
        d.devices.some((x) => x.deviceId === current)
          ? current
          : d.devices.some((x) => x.deviceId === preferredDevice)
            ? preferredDevice
            : "",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "API keys could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [request, preferredDevice]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function copy(value: string, success: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(value);
      setStatus(success);
    } catch {
      setError("Clipboard unavailable. Select the text and copy it manually.");
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    setNewKey("");
    setReveal(false);
    try {
      const data = await json<{ key: string; record: KeyRecord }>(
        await request("/api/developer/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            scopes: selectedScopes,
            deviceId: deviceId || undefined,
          }),
        }),
      );
      setKeys((current) => [data.record, ...current]);
      setNewKey(data.key);
      setStatus(
        "Key created. Copy it now, then save it in your local firmware configuration.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key creation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await json(
        await request(`/api/developer/api-keys?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
      );
      setKeys((current) =>
        current.map((k) =>
          k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k,
        ),
      );
      setNewKey("");
      setRevokeId("");
      setStatus(
        "Key revoked. Update any device using it before the next upload.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Key revocation failed.");
    } finally {
      setBusy(false);
    }
  }
  const blocked =
    loading ||
    busy ||
    !name.trim() ||
    selectedScopes.length === 0 ||
    (purpose === "firmware" && !deviceId);
  return (
    <section className="connection-stack" aria-label="API keys">
      <div className="connection-heading">
        <div>
          <h2>Create an API key</h2>
          <p>
            Use a dedicated upload key for each test board. Keys belong to this
            signed-in account.
          </p>
        </div>
        <button
          className="access-button"
          onClick={() => void load()}
          disabled={loading || busy}
        >
          {loading ? "Loading…" : "Refresh keys"}
        </button>
      </div>
      {error && (
        <p role="alert" className="connection-error">
          {error}
        </p>
      )}
      <p role="status" className="connection-feedback">
        {status}
      </p>
      {!loading && devices.length === 0 && (
        <div className="connection-notice">
          <strong>Enroll your board first.</strong>
          <p>
            A key alone cannot register a device. You need a one-time enrollment
            code from Bair1.
          </p>
          {onEnroll && (
            <button className="access-button mt-3" onClick={onEnroll}>
              Go to enrollment
            </button>
          )}
        </div>
      )}
      <form onSubmit={create} className="connection-form" aria-busy={busy}>
        <fieldset disabled={loading || busy}>
          <legend>What will this key do?</legend>
          <div className="connection-presets">
            {(
              [
                [
                  "firmware",
                  "Firmware upload",
                  "Upload measurements from one board.",
                ],
                [
                  "read",
                  "Read & export",
                  "Read your device data from a script.",
                ],
                ["custom", "Custom access", "Choose individual permissions."],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="key-purpose"
                  value={value}
                  checked={purpose === value}
                  onChange={() => {
                    setPurpose(value);
                    if (value !== "custom") setScopes([...keyPresets[value]]);
                  }}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="connection-fields">
          <label>
            Key name
            <input
              className="access-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              disabled={busy}
            />
          </label>
          <label>
            {purpose === "firmware" ? "Enrolled test board" : "Device access"}
            <select
              className="access-input"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={loading || busy}
              required={purpose === "firmware"}
            >
              <option value="">
                {purpose === "firmware"
                  ? "Select an enrolled device"
                  : "All devices you own"}
              </option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {purpose === "custom" ? (
          <fieldset disabled={busy}>
            <legend>Permissions</legend>
            <div className="connection-scope-list">
              {scopes.map((s) => (
                <label key={s.value}>
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(s.value)}
                    onChange={() =>
                      setScopes((current) =>
                        current.includes(s.value)
                          ? current.filter((x) => x !== s.value)
                          : [...current, s.value],
                      )
                    }
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-muted">
            {purpose === "firmware"
              ? "Permission: write:readings only. This key can upload to the selected board and cannot read other devices."
              : "Permissions: list devices, read measurements and export measurements. This key cannot upload."}
          </p>
        )}
        <button className="connection-primary" disabled={blocked}>
          {busy
            ? "Creating key…"
            : purpose === "firmware"
              ? "Create upload key"
              : "Create API key"}
        </button>
      </form>
      {newKey && (
        <section className="connection-secret" aria-label="New API key">
          <h3>Save your key now</h3>
          <p>
            This is the only time the full value is available. Keep it out of
            screenshots, source control and shared logs.
          </p>
          <label>
            New API key
            <input
              className="access-input font-mono"
              type={reveal ? "text" : "password"}
              readOnly
              value={newKey}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <div className="connection-actions">
            <button
              className="connection-primary"
              onClick={() => void copy(newKey, "API key copied.")}
            >
              Copy API key
            </button>
            <button
              className="access-button"
              onClick={() => setReveal(!reveal)}
            >
              {reveal ? "Mask key" : "Reveal key"}
            </button>
            <button
              className="access-button"
              onClick={() => {
                setNewKey("");
                setReveal(false);
                setStatus("Key hidden. It cannot be shown again.");
              }}
            >
              Hide key permanently
            </button>
          </div>
        </section>
      )}
      <details className="connection-details">
        <summary>Firmware configuration</summary>
        <p className="mt-3 text-sm text-muted">
          Keep Wi-Fi settings local. Paste the key you just created into{" "}
          <code>bair1_config.h</code>. Keep the device&apos;s generated ID
          unchanged.
        </p>
        <pre className="connection-code">
          <code>{uploadConfig(deviceId)}</code>
        </pre>
        <button
          className="access-button"
          onClick={() =>
            void copy(
              uploadConfig(deviceId),
              "Configuration template copied. Add the key locally.",
            )
          }
        >
          Copy configuration template
        </button>
      </details>
      <details className="connection-details">
        <summary>CLI &amp; agent setup</summary>
        <p className="mt-3 text-sm text-muted">
          Use a separate Read &amp; export key for CLI or MCP access. An
          upload-only key cannot read measurements.
        </p>
        <a
          className="mt-3 inline-block underline underline-offset-4"
          href="https://bair1.live/developers"
        >
          Open CLI, REST and MCP documentation
        </a>
      </details>
      <section className="connection-key-list">
        <h3>Your API keys</h3>
        {loading ? (
          <p role="status">Loading keys and enrolled devices…</p>
        ) : keys.length === 0 ? (
          <p className="text-muted">
            No keys created yet. Enroll a board, then create its upload key
            above.
          </p>
        ) : (
          <ul>
            {keys.map((k) => (
              <li key={k.id}>
                <div className="connection-key-row">
                  <div>
                    <strong>{k.name}</strong>
                    <p>
                      <code>{k.prefix}…</code> ·{" "}
                      {k.revokedAt ? "Revoked" : "Active"}
                    </p>
                    <p className="text-sm text-muted">
                      {k.lastUsedAt
                        ? `Last used ${new Date(k.lastUsedAt).toLocaleString("en-GB")}`
                        : "Not used yet"}{" "}
                      ·{" "}
                      {k.deviceId
                        ? devices.find((d) => d.deviceId === k.deviceId)
                            ?.name || "Device restricted"
                        : "All owned devices"}
                    </p>
                  </div>
                  {!k.revokedAt && (
                    <button
                      className="access-button"
                      disabled={busy}
                      onClick={() => setRevokeId(k.id)}
                    >
                      Revoke key
                    </button>
                  )}
                </div>
                <div className="connection-permissions">
                  {k.scopes.map((s) => (
                    <code key={s}>{s}</code>
                  ))}
                </div>
                {revokeId === k.id && (
                  <div className="connection-notice">
                    <p>
                      Revoke {k.name}? Uploads using it will be rejected until
                      you replace the key.
                    </p>
                    <div className="connection-actions">
                      <button
                        className="access-button"
                        disabled={busy}
                        onClick={() => void revoke(k.id)}
                      >
                        Confirm revocation
                      </button>
                      <button
                        className="access-button"
                        disabled={busy}
                        onClick={() => setRevokeId("")}
                      >
                        Keep key
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
