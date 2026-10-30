/** Preview deployments must explicitly name an isolated namespace. */
const prefix = process.env.BAIR1_TABLE_PREFIX ?? "";
if (prefix && !/^bair1-staging-[a-z0-9-]+-$/.test(prefix)) {
  throw new Error("Invalid staging table prefix");
}
if (process.env.VERCEL_ENV === "preview" && !prefix) {
  throw new Error("Preview requires an isolated BAIR1_TABLE_PREFIX");
}
export function storageTable(name: string): string {
  if (!name.startsWith("bair1-")) throw new Error("Unknown table family");
  return prefix ? prefix + name.slice("bair1-".length) : name;
}
export function ingestionPaused(): boolean {
  return process.env.BAIR1_INGESTION_MODE === "paused";
}
