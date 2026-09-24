/**
 * Minimal, safe markdown renderer for AI-generated build guides.
 *
 * SAFETY: the input is escaped *before* any markdown is applied, so no raw HTML
 * from a model response can ever reach the DOM. That is what makes it acceptable
 * to pass the output to dangerouslySetInnerHTML. Only the small, known subset
 * below is turned back into markup.
 *
 * Supports: headings, bold, italic, inline code, fenced code, links, ordered and
 * unordered lists, blockquotes, horizontal rules, tables and paragraphs.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Inline formatting, applied to already-escaped text. */
function inline(text: string): string {
  return (
    text
      // Inline code first so its contents are not further transformed.
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      // Only http(s) links — escaping already neutralised javascript: URLs, but
      // this keeps the rule explicit.
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
  );
}

function renderTable(rows: string[]): string {
  const cells = (row: string) =>
    row
      .replace(/^\s*\|/, "")
      .replace(/\|\s*$/, "")
      .split("|")
      .map((c) => c.trim());

  const [head, , ...body] = rows;
  const thead = `<thead><tr>${cells(head)
    .map((c) => `<th>${inline(c)}</th>`)
    .join("")}</tr></thead>`;
  const tbody = `<tbody>${body
    .map(
      (r) =>
        `<tr>${cells(r)
          .map((c) => `<td>${inline(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;

  return `<table>${thead}${tbody}</table>`;
}

export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";

  const lines = escapeHtml(markdown).split(/\r?\n/);
  const out: string[] = [];

  let inCode = false;
  let codeBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let paragraph: string[] = [];
  let tableRows: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushTable = () => {
    const separator = tableRows[1]?.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|");
    if (separator?.length && separator.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))) {
      out.push(renderTable(tableRows));
    } else {
      for (const row of tableRows) out.push(`<p>${inline(row)}</p>`);
    }
    tableRows = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const line of lines) {
    // Fenced code blocks swallow everything until the closing fence.
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${codeBuffer.join("\n")}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        flushAll();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph();
      flushList();
      tableRows.push(line);
      continue;
    }
    if (tableRows.length > 0) flushTable();

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushAll();
      out.push("<hr />");
      continue;
    }

    const quote = line.match(/^\s*&gt;\s?(.*)$/);
    if (quote) {
      flushAll();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  // A stream can end mid-block; close whatever is open so partial output still renders.
  if (inCode && codeBuffer.length > 0) {
    out.push(`<pre><code>${codeBuffer.join("\n")}</code></pre>`);
  }
  flushAll();

  return out.join("\n");
}
