"use client";

import { useRef, useState } from "react";

type WifiProfile = { ssid: string; password: string };
type StorageStatus = {
  sdDetected?: boolean;
  path?: string;
  cardBytes?: number;
  usedBytes?: number;
  logBytes?: number;
};

function humanBytes(value?: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1000)), units.length - 1);
  return `${(value / 1000 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

async function transact(port: SerialPort, payload: object, match?: (value: Record<string, unknown>) => boolean) {
  if (!port.writable || !port.readable) throw new Error("The selected USB port is not available.");
  const writer = port.writable.getWriter();
  await writer.write(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
  writer.releaseLock();

  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const timeout = Date.now() + 12000;
  try {
    while (Date.now() < timeout) {
      const result = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Device response timed out.")), 12000)),
      ]);
      if (result.done) break;
      buffered += decoder.decode(result.value, { stream: true });
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (!match || match(value)) return value;
        } catch { /* Ignore boot messages and partial serial output. */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error("No matching response was received from the device.");
}

export default function DeviceSetup() {
  const notePort = useRef<SerialPort | null>(null);
  const hostPort = useRef<SerialPort | null>(null);
  const [profiles, setProfiles] = useState<WifiProfile[]>([{ ssid: "", password: "" }]);
  const [wifiStatus, setWifiStatus] = useState("Notecard not connected.");
  const [storageStatus, setStorageStatus] = useState<StorageStatus | null>(null);
  const [storageMessage, setStorageMessage] = useState("QT Py not connected.");
  const [busy, setBusy] = useState(false);

  function updateProfile(index: number, field: keyof WifiProfile, value: string) {
    setProfiles((current) => current.map((profile, i) => i === index ? { ...profile, [field]: value } : profile));
  }

  async function connectNotecard() {
    if (!navigator.serial) return setWifiStatus("Use Chrome or Edge on desktop; Web Serial is unavailable here.");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      notePort.current = port;
      setWifiStatus("Notecard connected locally. Credentials have not been sent.");
    } catch (error) {
      setWifiStatus(error instanceof Error ? error.message : "Connection cancelled.");
    }
  }

  async function saveWifi() {
    const port = notePort.current;
    const valid = profiles.filter((profile) => profile.ssid.trim() && profile.password);
    if (!port) return setWifiStatus("Connect the Notecard USB port first.");
    if (!valid.length) return setWifiStatus("Enter at least one network name and password.");
    setBusy(true);
    try {
      const text = valid.map(({ ssid, password }) => JSON.stringify([ssid.trim(), password])).join(",");
      const response = await transact(port, { req: "card.wifi", text });
      if (response.err) throw new Error(String(response.err));
      await transact(port, { req: "hub.sync" });
      setProfiles(valid.map(({ ssid }) => ({ ssid, password: "" })));
      setWifiStatus(`${valid.length} Wi-Fi profile${valid.length === 1 ? "" : "s"} saved directly to the Notecard. Sync requested.`);
    } catch (error) {
      setWifiStatus(error instanceof Error ? error.message : "Wi-Fi setup failed.");
    } finally { setBusy(false); }
  }

  async function connectHost() {
    if (!navigator.serial) return setStorageMessage("Use Chrome or Edge on desktop; Web Serial is unavailable here.");
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      hostPort.current = port;
      setStorageMessage("QT Py connected. Reading SD status...");
      const result = await transact(port, { cmd: "storage.status" }, (value) => value.event === "storage_status");
      setStorageStatus(result as StorageStatus);
      setStorageMessage("Storage status received directly from Bair1.");
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Connection cancelled.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Local Wi-Fi setup</p>
        <h2 className="mt-3 text-2xl font-bold text-ink">Known networks</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Connect the Notecard USB port. Passwords go straight from this browser to the device and are never submitted to Bair1.</p>
        <button type="button" onClick={connectNotecard} className="mt-5 rounded-lg border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-ink">Connect Notecard</button>
        <div className="mt-5 space-y-4">
          {profiles.map((profile, index) => (
            <div key={index} className="grid gap-3 rounded-xl border border-border bg-bg p-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted">Network name
                <input value={profile.ssid} onChange={(e) => updateProfile(index, "ssid", e.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink" />
              </label>
              <label className="text-xs font-semibold text-muted">Password
                <input type="password" value={profile.password} onChange={(e) => updateProfile(index, "password", e.target.value)} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink" />
              </label>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={profiles.length >= 4} onClick={() => setProfiles((value) => [...value, { ssid: "", password: "" }])} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-40">Add network</button>
          <button type="button" disabled={busy} onClick={saveWifi} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save to device"}</button>
        </div>
        <p role="status" className="mt-5 rounded-lg bg-bg px-4 py-3 text-sm text-muted">{wifiStatus}</p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Local storage</p>
        <h2 className="mt-3 text-2xl font-bold text-ink">SD card</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Connect the Saddle Sense/QT Py USB port to inspect storage without removing the card.</p>
        <button type="button" onClick={connectHost} className="mt-5 rounded-lg border border-border bg-bg px-4 py-2.5 text-sm font-semibold text-ink">Connect QT Py</button>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          <StorageMetric label="Status" value={storageStatus?.sdDetected ? "Writing" : "Unavailable"} />
          <StorageMetric label="Capacity" value={humanBytes(storageStatus?.cardBytes)} />
          <StorageMetric label="Used" value={humanBytes(storageStatus?.usedBytes)} />
          <StorageMetric label="Bair1 log" value={humanBytes(storageStatus?.logBytes)} />
        </dl>
        <p className="mt-4 text-xs text-muted">File: {storageStatus?.path ?? "/bair1-data.jsonl"}</p>
        <p role="status" className="mt-5 rounded-lg bg-bg px-4 py-3 text-sm text-muted">{storageMessage}</p>
        <p className="mt-4 text-xs leading-5 text-muted">To copy the complete log, switch off Bair1 before removing the microSD card. Live mass-storage access is intentionally disabled to prevent filesystem corruption.</p>
      </section>
    </div>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-bg p-4"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg font-bold text-ink">{value}</dd></div>;
}
