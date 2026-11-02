/** Read bounded JSON before parsing; Content-Length alone is not trusted. */
export async function readJsonObject(request: Request, maximumBytes = 65536): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new RangeError("JSON object required");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximumBytes) { await reader.cancel(); throw new RangeError("Request is too large"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let result: unknown;
  try { result = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RangeError("Valid JSON required"); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new RangeError("JSON object required");
  return result as Record<string, unknown>;
}
export function validCoordinates(lat: number, lng: number) { return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180; }
