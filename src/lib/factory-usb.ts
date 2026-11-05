import { configurationCommand, deviceIdFromMac, parseIdentity, type BoardIdentity } from "./factory-usb-protocol";
import bmeRelease from "./factory-release.json";
import spsRelease from "./factory-sps30-release.json";
import type { FactoryProfile } from "./factory-profiles";
// All serial content is private. Only structured, whitelisted replies reach the UI.
export class FactoryUsb {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pending = new Map<string, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  private closed = false;
  constructor(public port: SerialPort) {}
  async open() {
    await this.port.open({ baudRate: 115200 });
    this.closed = false;
    void this.read();
    // Some USB drivers restart the board on port open. Let setup finish before identify.
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  private async read() {
    if (!this.port.readable) return;
    const reader = this.port.readable.getReader(); this.reader = reader;
    const decoder = new TextDecoder(); let buffer = "";
    try {
      while (!this.closed) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
          if (line.length > 4096) continue;
          try {
            const reply = JSON.parse(line);
            if (reply && typeof reply.requestId === "string" && ["identity", "configured", "error"].includes(reply.bair1)) {
              const wait = this.pending.get(reply.requestId);
              if (reply.bair1 === "error") wait?.reject(new Error("The board rejected its settings. Check Wi-Fi details, reconnect and try again."));
              else wait?.resolve(reply);
            }
          } catch { /* Telemetry and boot messages are intentionally not retained. */ }
        }
        if (buffer.length > 8192) buffer = "";
      }
    } catch { /* USB reset/disconnect is expected after configuration. */ }
    finally {
      reader.releaseLock(); this.reader = null;
      for (const wait of this.pending.values()) wait.reject(new Error("USB disconnected. Reconnect the board and retry."));
      this.pending.clear();
    }
  }
  async exchange(command: Record<string, unknown>, timeout = 8000): Promise<Record<string, unknown>> {
    if (!this.port.writable || typeof command.requestId !== "string") throw new Error("Connect the board before continuing.");
    const requestId = command.requestId;
    let timer: ReturnType<typeof setTimeout>;
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      timer = setTimeout(() => reject(new Error("No factory reply. Install the factory firmware, then reconnect. Close other serial monitors.")), timeout);
    });
    // Attach a rejection observer before the asynchronous write can fail.
    void reply.catch(() => {});
    try {
      const writer = this.port.writable.getWriter();
      try { await writer.write(new TextEncoder().encode(JSON.stringify(command) + "\n")); } finally { writer.releaseLock(); }
      return await reply;
    } finally { clearTimeout(timer!); this.pending.delete(requestId); }
  }
  async identify() {
    const requestId = crypto.randomUUID(), value = await this.exchange({ bair1: "identify", requestId });
    const identity = parseIdentity(value, requestId);
    if (!identity) throw new Error("This is not supported Bair1 factory firmware. Install the approved ESP32-S3 build.");
    return identity;
  }
  async configure(identity: BoardIdentity, input: { ssid: string; password: string; apiKey: string; factorySessionId: string }) {
    const requestId = crypto.randomUUID(), reply = await this.exchange(configurationCommand(identity, input, requestId));
    if (reply.bair1 !== "configured" || reply.deviceId !== identity.deviceId || reply.bootSession !== identity.bootSession) throw new Error("Board identity changed. Reconnect before continuing.");
  }
  async close() {
    this.closed = true;
    if (this.reader) await this.reader.cancel().catch(() => {});
    await this.port.close().catch(() => {});
  }
}
export async function installFactoryFirmware(port: SerialPort, progress: (message: string) => void, profile: FactoryProfile = "bme280-adc") {
  const release = profile === "sps30-i2c" ? spsRelease : bmeRelease;
  const [{ ESPLoader, Transport }, { createMD5 }] = await Promise.all([import("esptool-js"), import("hash-wasm")]);
  const transport = new Transport(port, false);
  const loader = new ESPLoader({ transport, baudrate: 115200, debugLogging: false, terminal: { clean() {}, writeLine() {}, write() {} } });
  try {
    progress("Connecting to the ESP32-S3 bootloader…");
    await loader.main();
    if (loader.chip?.CHIP_NAME !== "ESP32-S3") throw new Error("Wrong chip. This build is only for the XIAO ESP32-S3 board.");
    const deviceId = deviceIdFromMac(await loader.chip.readMac(loader));
    const security = await loader.getSecurityInfo();
    if (security.parsedFlags.SECURE_BOOT_EN || security.parsedFlags.SECURE_DOWNLOAD_ENABLE || security.flashCryptCnt) throw new Error("This board has protected flash. Use its approved secure installation process.");
    const files = [];
    for (const file of release.files) {
      const response = await fetch(file.path, { cache: "no-store" });
      if (!response.ok) throw new Error("Firmware download failed. Keep the board connected and retry.");
      const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
      if (digest !== file.sha256 || bytes.byteLength !== file.size) throw new Error("Firmware integrity check failed. No installation started.");
      files.push({ data: new Uint8Array(bytes), address: file.address });
    }
    const md5 = await createMD5();
    await loader.writeFlash({ fileArray: files, flashMode: "keep", flashFreq: "keep", flashSize: "keep", eraseAll: false, compress: true, calculateMD5Hash: image => md5.init().update(image).digest("hex"), reportProgress: (index, written, total) => progress(`Installing file ${index + 1}/${files.length}: ${Math.round(written / total * 100)}%`) });
    await loader.after("hard_reset");
    progress("Firmware written and flash hashes verified. Reconnect the board to configure it.");
    return deviceId;
  } finally { await transport.disconnect().catch(() => {}); }
}
