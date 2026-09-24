export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Spreadsheets must treat user text as data, never a formula.
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(rows: unknown[][]) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function escapeExportHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function exportHtml(title: string, markdown: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeExportHtml(title)}</title><style>body{font:15px/1.6 "Segoe UI",sans-serif;max-width:960px;margin:40px auto;padding:24px;color:#171717}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:24px}@media print{body{margin:0;padding:0}pre{font-size:11pt}}</style></head><body><h1>${escapeExportHtml(title)}</h1><p>Planning artifact. Apply the required sensitivity label and sharing approval before distribution.</p><pre>${escapeExportHtml(markdown)}</pre></body></html>`;
}

// Keep exported fields literal even when the receiving tool renders Markdown.
export function exportText(value: unknown) {
  return value == null || value === "" ? "Not recorded" : String(value).replaceAll("\\", "\\\\").replace(/([`*_{}[\]()#+!|<>])/g, "\\$1");
}
