import { validateFaceAnimation, type FaceAnimation } from "./face-animation";

/** Accept only the bounded PCM WAV emitted by our verified OpenAI generator. */
export function speechPcm(wav: Buffer) {
  if (
    wav.length < 46 ||
    wav.length > 2_500_044 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== 24000 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    (wav.length - 44) % 2
  )
    throw new Error("Invalid speech audio");
  return { pcm: wav.subarray(44), duration: (wav.length - 44) / 48000 };
}
export function faceServiceConfigured() {
  return Boolean(
    process.env.BAIR1_A2F_HTTP_URL && process.env.BAIR1_A2F_API_KEY,
  );
}

/** Only the server's configured Modal endpoint receives the verified WAV. */
export async function generateFaceAnimation(
  wav: Buffer,
  signal?: AbortSignal,
  options: { fetcher?: typeof fetch } = {},
): Promise<FaceAnimation> {
  const target = process.env.BAIR1_A2F_HTTP_URL;
  const key = process.env.BAIR1_A2F_API_KEY;
  if (!target || !key) throw new Error("Face service is not configured");
  const url = new URL(target);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".modal.run") ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid face service configuration");
  if (signal?.aborted) throw new Error("Face generation cancelled");
  const { duration } = speechPcm(wav);
  const timeout = AbortSignal.timeout(45_000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "audio/wav" },
      body: new Uint8Array(wav),
      signal: combined,
      redirect: "error",
    });
    if (
      !response.ok ||
      Number(response.headers.get("content-length")) > 1_000_000
    ) {
      await response.body?.cancel();
      throw new Error();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 1_000_000) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return validateFaceAnimation(json, duration);
  } catch {
    throw new Error("NVIDIA face animation is unavailable");
  }
}
