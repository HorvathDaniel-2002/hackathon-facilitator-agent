import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
function token(name: string): string {
  const value = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(css)?.[1];
  if (!value) throw new Error(`Missing color token ${name}`);
  return value;
}
function luminance(color: string) {
  const rgb = color.slice(1).match(/../g)!.map((hex) => Number.parseInt(hex, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function ratio(first: string, second: string) {
  const [a, b] = [luminance(token(first)), luminance(token(second))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("measurable visual accessibility", () => {
  it.each(["surface", "canvas", "surface-muted", "sunken"])("keeps secondary text legible on %s", (surface) => {
    expect(ratio("ink-faint", surface)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["accent", "danger", "warn", "info", "violet"])("provides AA-sized normal text contrast for %s badges", (tone) => {
    expect(ratio(tone, `${tone}-soft`)).toBeGreaterThanOrEqual(4.5);
  });
  it.each(["surface", "sunken", "canvas"])("keeps input boundaries visible on %s", (surface) => {
    expect(ratio("control-border", surface)).toBeGreaterThanOrEqual(3);
  });
  it("provides a consistent keyboard focus outline for interactive controls", () => {
    expect(css).toMatch(/:where\(a, button, input, select, textarea, summary\):focus-visible/);
    expect(ratio("ink", "surface")).toBeGreaterThan(3);
  });
});
