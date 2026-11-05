"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import Auth0ProviderWrapper from "./Auth0ProviderWrapper";
import { useAuthenticatedFetch } from "@/lib/use-authenticated-fetch";
import { FactoryUsb, installFactoryFirmware } from "@/lib/factory-usb";
import { FACTORY_FIRMWARE_VERSION, FACTORY_UPLOAD_URL, validateWifi, type BoardIdentity } from "@/lib/factory-usb-protocol";
import type { FactoryGrant, FactoryUnit } from "@/lib/factory-provisioning";

type Receipt = { receivedAt: string; bootSession: string | null; sensorsValid: boolean; temperature: number | null; humidity: number | null; pressure: number | null; adcD3Raw: number | null; adcD2Raw: number | null; firmwareVersion: string | null; sample: number | null };
type Result = { deviceId: string; receipt: Receipt | null; powerCycleVerified?: boolean };
type Listing = { grant: FactoryGrant; units: FactoryUnit[] };
const button = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-bg transition-colors hover:bg-primary-hover hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-5 py-3 text-sm font-semibold text-ink hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const field = "mt-2 min-h-11 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function FactoryProvisioner() {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } = useAuth0();
  const authenticatedFetch = useAuthenticatedFetch();
  const [grant, setGrant] = useState<FactoryGrant | null>(null), [units, setUnits] = useState<FactoryUnit[]>([]);
  const [identity, setIdentity] = useState<BoardIdentity | null>(null);
  const [ssid, setSsid] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("Connect one XIAO ESP32-S3 BME280 + dual ADC board.");
  const [error, setError] = useState(""), [manualId, setManualId] = useState(""), [currentId, setCurrentId] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const usb = useRef<FactoryUsb | null>(null), waiting = useRef<AbortController | null>(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; waiting.current?.abort(); void usb.current?.close(); }; }, []);
  async function api<T>(path: string, body?: unknown): Promise<T> {
    const res = await authenticatedFetch(path, { cache: "no-store", signal: AbortSignal.timeout(20000), ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Factory service unavailable. Try again."); return data;
  }
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    authenticatedFetch("/api/factory/units", { cache: "no-store" }).then(async res => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (active) { setGrant(data.grant); setUnits(data.units); }
    }).catch(e => { if (active) setError(e.message || "Factory access could not be loaded."); });
    return () => { active = false; };
  }, [isAuthenticated, authenticatedFetch]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { if (mounted.current) { setError(e instanceof Error ? e.message : "Setup interrupted. Reconnect and try again."); setMessage("Setup paused. Correct the issue below, then retry this step."); } }
    finally { if (mounted.current) { setBusy(false); setIsWaiting(false); } }
  }
  async function choosePort() {
    if (!("serial" in navigator)) throw new Error("Browser USB needs desktop Chrome or Edge. Use Manual USB setup below if USB is blocked.");
    return navigator.serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
  }
  async function connect() {
    await usb.current?.close(); usb.current = null; setIdentity(null); setCurrentId("");
    setMessage("Select the connected Espressif USB serial port. Close Arduino Serial Monitor first.");
    const connection = new FactoryUsb(await choosePort()); usb.current = connection;
    await connection.open(); const board = await connection.identify();
    setIdentity(board); setCurrentId(board.deviceId);
    setMessage(board.firmwareVersion === FACTORY_FIRMWARE_VERSION ? "Board detected. Enter Wi-Fi details, then configure it." : "Board detected, but its firmware needs updating. Install the factory firmware before configuring.");
  }
  async function install() {
    await usb.current?.close(); usb.current = null; setIdentity(null); setCurrentId("");
    const port = await choosePort();
    await installFactoryFirmware(port, text => { if (mounted.current) setMessage(text); });
  }
  async function prepare(deviceId: string) {
    validateWifi(ssid, password);
    await api("/api/factory/units", { action: "enroll", deviceId });
    const settings = await api<{ key: string; sessionId: string }>("/api/factory/units", { action: "configure", deviceId });
    const listing = await api<Listing>("/api/factory/units"); setGrant(listing.grant); setUnits(listing.units);
    setResults(old => old.filter(r => r.deviceId !== deviceId)); setCurrentId(deviceId);
    return { ssid, password, apiKey: settings.key, factorySessionId: settings.sessionId };
  }
  async function checkReceipt(deviceId: string, previousBoot?: string) {
    if (!deviceId) throw new Error("Connect or prepare a unit first.");
    waiting.current?.abort(); const controller = new AbortController(); waiting.current = controller;
    setIsWaiting(true);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (controller.signal.aborted) { setMessage("Upload check stopped. You can check again without reconfiguring."); return; }
      const data = await api<{ receipt: Receipt | null }>(`/api/factory/receipt?deviceId=${encodeURIComponent(deviceId)}`);
      if (controller.signal.aborted || !mounted.current) return;
      if (data.receipt && (!previousBoot || (data.receipt.bootSession && data.receipt.bootSession !== previousBoot))) {
        setResults(old => [...old.filter(r => r.deviceId !== deviceId), { deviceId, receipt: data.receipt, powerCycleVerified: Boolean(previousBoot) && data.receipt!.sensorsValid }]);
        setMessage(data.receipt.sensorsValid ? previousBoot ? "Passed: the board uploaded valid BME280 and ADC data after restarting with its saved settings. Continue with the next unit." : "Upload and sensors passed. Unplug and reconnect once, then click Verify power cycle to check saved settings." : "Upload received, but sensor checks failed. Check BME280 wiring and repeat the test."); return;
      }
      setMessage(previousBoot ? `Waiting for an upload after the power cycle (${attempt + 1}/40). Unplug and reconnect this board now.` : `Waiting for this unit’s upload (${attempt + 1}/40). It needs 2.4 GHz Wi-Fi, internet and time sync.`);
      await new Promise<void>(resolve => { const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); }; const timer = setTimeout(done, 3000); controller.signal.addEventListener("abort", done, { once: true }); });
    }
    setResults(old => [...old.filter(r => r.deviceId !== deviceId), { deviceId, receipt: null }]);
    throw new Error("No matching upload after two minutes. Check Wi-Fi and power, then Check upload again. If the password was wrong, reconnect and configure again.");
  }
  async function configure() {
    validateWifi(ssid, password);
    if (!identity || !usb.current || identity.firmwareVersion !== FACTORY_FIRMWARE_VERSION) throw new Error("Install the factory firmware and reconnect this board.");
    const board = await usb.current.identify();
    if (board.deviceId !== identity.deviceId || board.bootSession !== identity.bootSession) throw new Error("The board changed or restarted. Reconnect before configuring.");
    setMessage("Enrolling this board and saving its private upload settings…");
    await usb.current.configure(board, await prepare(board.deviceId));
    await usb.current.close(); usb.current = null; setIdentity(null);
    setMessage("Settings saved. The board is restarting. Checking for a fresh server upload…");
    await checkReceipt(board.deviceId);
  }
  function report() {
    const rows = [["Device ID", "Result", "Server received UTC", "Firmware", "Temperature C", "Humidity %", "Pressure hPa", "ADC D3 raw", "ADC D2 raw"], ...units.map(unit => {
      const result = results.find(value => value.deviceId === unit.deviceId), r = result?.receipt;
      return [unit.deviceId, r ? r.sensorsValid ? result?.powerCycleVerified ? "Passed: upload, sensors and power cycle" : "Upload and sensors passed; power-cycle check required" : "Sensor check failed" : "Not verified", r?.receivedAt ?? "", r?.firmwareVersion ?? "", r?.temperature ?? "", r?.humidity ?? "", r?.pressure ?? "", r?.adcD3Raw ?? "", r?.adcD2Raw ?? ""];
    })];
    download("Bair1-factory-test-report.csv", "\uFEFF" + rows.map(row => row.map(value => { const text = String(value); return `"${/^[=+@-]/.test(text) ? "'" : ""}${text.replaceAll('"', '""')}"`; }).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  }
  const currentResult = results.find(value => value.deviceId === currentId);
  return <section aria-labelledby="factory-heading" className="rounded-2xl border border-border bg-surface p-5 sm:p-8">
    <h2 id="factory-heading" className="text-2xl font-semibold text-ink">Factory USB setup</h2>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">One board at a time. Detect its hardware ID, save Wi-Fi and upload settings, then check that its readings reach Bair1. No enrollment codes to copy.</p>
    {isLoading ? <p className="mt-6" role="status">Checking sign-in…</p> : !isAuthenticated ? <div className="mt-6"><button className={button} onClick={() => void loginWithRedirect({ appState: { returnTo: "/firmware#installer" } })}>Sign in to factory account</button><p className="mt-3 text-sm text-muted">Use Account A from the private handoff. Public accounts cannot provision factory units.</p></div> : <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5"><p className="min-w-0 text-sm">Signed in as <strong className="[overflow-wrap:anywhere]">{user?.email ?? "factory operator"}</strong>{grant && <span className="mt-1 block text-muted">{grant.remaining} new units remaining · access until {new Date(grant.expiresAt * 1000).toLocaleString()}</span>}</p><button className={secondary} disabled={busy} onClick={() => { setPassword(""); void logout({ logoutParams: { returnTo: window.location.origin } }); }}>Sign out</button></div>
      {grant && <>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div><h3 className="text-lg font-semibold text-ink">1. Connect the board</h3><p className="mt-2 text-sm leading-6 text-muted">Use a USB data cable and desktop Chrome or Edge. Select the Espressif serial port when prompted.</p><div className="mt-4 flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void run(connect)}>Connect board</button><button className={secondary} disabled={busy} onClick={() => void run(install)}>Install factory firmware</button></div><p className="mt-3 text-sm leading-6 text-muted">Install once if the board has older firmware. Installation restarts it; keep USB connected until verification finishes. Then click Connect board again.</p>{identity && <dl className="mt-4 space-y-2 text-sm"><div><dt className="text-muted">Detected device</dt><dd className="break-all font-mono">{identity.deviceId}</dd></div><div><dt className="text-muted">Firmware</dt><dd className="break-all">{identity.firmwareVersion}</dd></div></dl>}</div>
          <form onSubmit={event => { event.preventDefault(); void run(configure); }}><h3 className="text-lg font-semibold text-ink">2. Configure and test</h3><label className="mt-4 block text-sm font-medium" htmlFor="factory-ssid">2.4 GHz Wi-Fi name<input id="factory-ssid" className={field} value={ssid} onChange={e => setSsid(e.target.value)} autoComplete="off" disabled={busy} /></label><label className="mt-4 block text-sm font-medium" htmlFor="factory-password">Wi-Fi password<input id="factory-password" type="password" className={field} value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" disabled={busy} /></label><p className="mt-2 text-xs leading-5 text-muted">Wi-Fi details stay in this page’s memory until you leave, and are written to the board. They are not sent to Bair1’s server. Leave the password blank only for an open network.</p><button type="submit" className={`${button} mt-5`} disabled={busy || !identity || identity.firmwareVersion !== FACTORY_FIRMWARE_VERSION}>Configure and test</button></form>
        </div>
        <div className="mt-7 border-t border-border pt-5"><h3 className="text-lg font-semibold text-ink">3. Confirm the upload</h3><p className="mt-3 text-sm leading-6" role="status" aria-live="polite">{message}</p>{currentId && <p className="mt-2 break-all font-mono text-sm">{currentId}</p>}{currentResult?.receipt && <p className="mt-3 text-sm leading-6">Received {new Date(currentResult.receipt.receivedAt).toLocaleString()} · {currentResult.receipt.temperature ?? "—"} °C · {currentResult.receipt.humidity ?? "—"}% RH · {currentResult.receipt.pressure ?? "—"} hPa · ADC D3 {currentResult.receipt.adcD3Raw ?? "—"} / D2 {currentResult.receipt.adcD2Raw ?? "—"}</p>}<div className="mt-4 flex flex-wrap gap-3"><button className={secondary} disabled={busy || !currentId} onClick={() => void run(() => checkReceipt(currentId))}>Check upload</button>{currentResult?.receipt?.sensorsValid && currentResult.receipt.bootSession && <button className={secondary} disabled={busy || currentResult.powerCycleVerified} onClick={() => void run(() => checkReceipt(currentId, currentResult.receipt!.bootSession!))}>Verify power cycle</button>}{isWaiting && <button className={secondary} onClick={() => waiting.current?.abort()}>Stop waiting</button>}<button className={secondary} disabled={busy || !units.length} onClick={report}>Download test report</button></div>{units.length > 0 && <label htmlFor="resume-factory-unit" className="mt-5 block max-w-lg text-sm font-medium">Resume an enrolled unit<select id="resume-factory-unit" className={field} disabled={busy} value={units.some(u => u.deviceId === currentId) ? currentId : ""} onChange={e => { setCurrentId(e.target.value); setIdentity(null); }}><option value="">Select a unit to check its upload</option>{units.map(u => <option key={u.deviceId} value={u.deviceId}>{u.deviceId}</option>)}</select></label>}</div>
        <details className="mt-7 border-t border-border pt-5"><summary className="cursor-pointer text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-primary">Manual USB setup</summary><p className="mt-3 max-w-3xl text-sm leading-6 text-muted">If browser USB is unavailable, download the package and follow MANUAL-SETUP.md. Its helper reads the ID and writes a private settings file to the correct board. Install Python 3.10+, esptool 5.3.1 and pyserial 3.5 as described there.</p><a className={`${secondary} mt-4`} href="/firmware/factory-bme280/Bair1-factory-USB-package.zip" download>Download manual setup package</a><label htmlFor="manual-device-id" className="mt-5 block max-w-lg text-sm font-medium">Device ID printed by the USB helper<input id="manual-device-id" className={field} placeholder="Paste the helper’s device ID" value={manualId} onChange={e => setManualId(e.target.value.trim())} disabled={busy} /></label><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Enter Wi-Fi details above, then download settings. This file contains this unit’s upload key and Wi-Fi password. Keep it private and delete it after setup. Preparing settings again replaces this unit’s previous factory upload key.</p><button className={`${secondary} mt-4`} disabled={busy || !/^XIAO-[0-9A-F]{12}$/.test(manualId)} onClick={() => void run(async () => { const settings = await prepare(manualId); download("Bair1-private-USB-settings.json", JSON.stringify({ deviceId: manualId, ...settings, url: FACTORY_UPLOAD_URL }, null, 2), "application/json"); setMessage("Private settings downloaded. Write them with the USB helper, then click Check upload. Delete the settings file afterward."); })}>Download private USB settings</button></details>
      </>}
    </>}
    {error && <p className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm leading-6 text-red-900" role="alert">{error}</p>}
  </section>;
}
export default function FirmwareInstaller() { return <Auth0ProviderWrapper><FactoryProvisioner /></Auth0ProviderWrapper>; }
