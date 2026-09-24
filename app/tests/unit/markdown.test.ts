import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("guide markdown rendering", () => {
  it("escapes raw HTML rather than executing model output", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img ");
    expect(html).toContain("&lt;script&gt;");
  });
  it("only creates HTTP(S) links, never javascript/data handlers", () => {
    const html = renderMarkdown("[a](javascript:alert(1)) [b](data:text/html,x) [c](https://learn.microsoft.com/)");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).toContain('href="https://learn.microsoft.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it("keeps a fenced heading literal", () => {
    const html = renderMarkdown("## Hackathon MVP\n\n```markdown\n## Role\nRead-only.\n```\n\n## Production scaling\nPilot review.");
    expect(html).toContain("<pre><code>## Role");
    expect(html).not.toContain("<h2>Role</h2>");
    expect(html).toContain("<h2>Production scaling</h2>");
  });
  it("renders valid tables without dropping data rows", () => {
    const html = renderMarkdown("| Metric | Value |\n| --- | --- |\n| Resolution | 85% |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>85%</td>");
  });
  it("does not discard the second pipe-delimited row without a table separator", () => {
    const html = renderMarkdown("| first row |\n| second row |\n| third row |");
    expect(html).not.toContain("<table>");
    expect(html).toContain("second row");
  });
  it("safely closes incomplete streaming code", () => {
    expect(renderMarkdown("```\n<example>")).toContain("<pre><code>&lt;example&gt;</code></pre>");
  });
});
