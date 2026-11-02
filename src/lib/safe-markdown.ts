/** Escape untrusted model text before adding the small supported formatting set. */
export function simpleMarkdown(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /`(.*?)`/g,
      '<code class="bg-border/50 px-1 rounded text-xs">$1</code>',
    )
    .replace(/\n- /g, "<br/>- ")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");
}
