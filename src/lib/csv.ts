/** Escape typed values and neutralize spreadsheet formulas in untrusted text. */
export function csvField(value: unknown): string {
  if (value == null) return '""';
  const text = typeof value === "string" && /^[\s]*[=+@\-]/.test(value) ? `'${value}` : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
