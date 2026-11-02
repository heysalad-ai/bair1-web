"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import type { ApiKeyScope } from "@/lib/api-keys";
import type { Device } from "@/lib/devices";

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const SCOPES: { value: ApiKeyScope; label: string }[] = [
  { value: "read:devices", label: "Read devices" },
  { value: "write:devices", label: "Write devices" },
  { value: "read:readings", label: "Read readings" },
  { value: "write:readings", label: "Write readings" },
  { value: "export:readings", label: "Export readings" },
];

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export default function DeveloperView() {
  const { getAccessTokenSilently } = useAuth0();
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [keyName, setKeyName] = useState("Local development");
  const [selectedScopes, setSelectedScopes] = useState<ApiKeyScope[]>(
    ["read:devices", "read:readings", "export:readings"]
  );
  const [boundDevice, setBoundDevice] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = useCallback(async () => {
    const token = await getAccessTokenSilently();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [getAccessTokenSilently]);

  const load = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const headers = await authHeaders();
      const [keysResponse, devicesResponse] = await Promise.all([
        fetch("/api/developer/api-keys", { headers }),
        fetch("/api/developer/devices", { headers }),
      ]);
      const keysData = await parseJson<{ keys: ApiKeyRecord[] }>(keysResponse);
      const devicesData = await parseJson<{ devices: Device[] }>(devicesResponse);
      setKeys(keysData.keys);
      setDevices(devicesData.devices);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to load developer data");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const sampleKey = "bair1_your_api_key";
  const newestDeviceId = devices[0]?.deviceId || "bair1-dev-001";
  const cliExample = useMemo(
    () => `export BAIR1_API_KEY=${sampleKey}\nnpx -y @heysalad/bair1 devices\nnpx -y @heysalad/bair1 readings ${newestDeviceId}`,
    [newestDeviceId, sampleKey]
  );
  const mcpExample = useMemo(
    () => `{\n  "mcpServers": {\n    "bair1": {\n      "command": "npx",\n      "args": ["-y", "@heysalad/bair1-mcp"],\n      "env": {\n        "BAIR1_API_KEY": "${sampleKey}"\n      }\n    }\n  }\n}`,
    [sampleKey]
  );
  const firmwareExample = useMemo(
    () => `curl -X POST https://bair1.com/api/readings \\\n  -H "Authorization: Bearer ${sampleKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"deviceId":"${newestDeviceId}","pm25":7.2,"aqi":31,"transport":"wifi"}'`,
    [newestDeviceId, sampleKey]
  );

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setNewKey(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/developer/api-keys", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: keyName, scopes: selectedScopes, deviceId: boundDevice || undefined }),
      });
      const data = await parseJson<{ key: string; record: ApiKeyRecord }>(response);
      setKeys((current) => [data.record, ...current]);
      setNewKey(data.key);
      setStatus("API key created. Copy it now; the full value is shown once.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to create API key");
    }
  }

  async function revokeKey(id: string) {
    setStatus(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/developer/api-keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      await parseJson<{ ok: boolean }>(response);
      setKeys((current) =>
        current.map((key) =>
          key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key
        )
      );
      setStatus("API key revoked.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Unable to revoke API key");
    }
  }

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope]
    );
  }

  return (
    <section className="tab-content-enter px-4 pb-28 lg:px-0 lg:pb-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>

          <h1 className="text-xl font-semibold leading-tight text-ink lg:text-2xl">
            API keys, devices, and agent access
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="self-start rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          Refresh
        </button>
      </div>

      {status && (
        <div className="mb-4 rounded-lg border border-border bg-surface/70 px-4 py-3 text-sm text-muted">
          {status}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <form onSubmit={createKey} className="rounded-lg border border-border bg-surface/70 p-4 lg:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold leading-tight text-ink">Create API key</h2>
                <p className="text-xs text-muted">Use keys for the CLI, MCP server, firmware, and external apps.</p>
              </div>
              <button
                type="submit"
                disabled={!keyName.trim() || selectedScopes.length === 0}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
            </div>
            <label className="block text-xs font-medium uppercase tracking-wider text-muted">
              Key name
              <input
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm normal-case tracking-normal text-ink outline-none focus:border-primary/70"
              />
            </label>
            <label className="mt-4 block text-sm">Limit key to device<select value={boundDevice} onChange={e => setBoundDevice(e.target.value)} className="access-input"><option value="">All devices you own</option>{devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.name}</option>)}</select></label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SCOPES.map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-ink"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    className="h-4 w-4 accent-primary"
                  />
                  {scope.label}
                </label>
              ))}
            </div>
          </form>

          {newKey && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">New API key</h2>
                  <p className="text-xs text-muted">Copy now. The full key will not be shown again.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(newKey)}
                  className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary"
                >
                  Copy
                </button>
              </div>
              <code className="block overflow-x-auto rounded-lg bg-[#0B0C0A] p-3 font-mono text-xs text-white">
                {newKey}
              </code>
            </div>
          )}

          <div className="rounded-lg border border-border bg-surface/70 p-4 lg:p-5">
            <h2 className="mb-3 text-base font-semibold leading-tight text-ink">API keys</h2>
            <div className="space-y-2">
              {keys.map((key) => (
                <div key={key.id} className="rounded-lg border border-border bg-bg px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">{key.name}</div>
                      <div className="font-mono text-xs text-muted">{key.prefix}...</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void revokeKey(key.id)}
                      disabled={Boolean(key.revokedAt)}
                      className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-ink disabled:opacity-50"
                    >
                      {key.revokedAt ? "Revoked" : "Revoke"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {key.scopes.map((scope) => (
                      <span key={scope} className="rounded bg-surface px-2 py-1 font-mono text-[10px] text-muted">
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!loading && keys.length === 0 && (
                <p className="rounded-lg border border-border bg-bg px-3 py-6 text-center text-sm text-muted">
                  No API keys yet.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">


          <div className="rounded-lg border border-border bg-surface/70 p-4 lg:p-5">
            <h2 className="mb-3 text-base font-semibold leading-tight text-ink">Provisioned devices</h2>
            <div className="space-y-2">
              {devices.map((device) => (
                <div key={device.deviceId} className="rounded-lg border border-border bg-bg px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-ink">{device.name}</div>
                      <div className="font-mono text-xs text-muted">{device.deviceId}</div>
                    </div>
                    <span className="rounded bg-surface px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                      {device.status}
                    </span>
                  </div>
                  {device.location && <div className="mt-1 text-xs text-muted">{device.location}</div>}
                </div>
              ))}
              {!loading && devices.length === 0 && (
                <p className="rounded-lg border border-border bg-bg px-3 py-6 text-center text-sm text-muted">
                  No developer devices yet.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/70 p-4 lg:p-5">
            <h2 className="mb-3 text-base font-semibold leading-tight text-ink">Quick setup</h2>
            <div className="space-y-3">
              <CodeBlock title="CLI" value={cliExample} />
              <CodeBlock title="Claude, Codex, Cursor MCP" value={mcpExample} />
              <CodeBlock title="Firmware ingestion" value={firmwareExample} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CodeBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">{title}</div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="rounded border border-border px-2 py-1 text-[10px] font-semibold text-muted transition-colors hover:text-ink"
        >
          Copy
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[#0B0C0A] p-3 text-xs text-white">
        <code>{value}</code>
      </pre>
    </div>
  );
}
