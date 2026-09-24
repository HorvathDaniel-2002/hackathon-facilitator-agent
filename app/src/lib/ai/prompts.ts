import fs from "node:fs";
import path from "node:path";

/**
 * Prompt library — plan P3.
 *
 * Prompts live as markdown files with a small front-matter block so they are
 * reviewable in pull requests and versioned independently of the code. Every
 * generated artifact records the `promptVersion` that produced it.
 */

export interface Prompt {
  id: string;
  version: string;
  body: string;
}

const cache = new Map<string, Prompt>();

export function loadPrompt(name: string): Prompt {
  const cached = cache.get(name);
  if (cached) return cached;

  const file = path.join(process.cwd(), "prompts", `${name}.md`);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`Prompt not found: ${file}`);
  }

  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Prompt ${name}.md is missing its front-matter block`);
  }

  const [, front, body] = match;
  const meta: Record<string, string> = {};
  for (const line of front.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }

  const prompt: Prompt = {
    id: meta.id ?? name,
    version: meta.version ?? "0.0.0",
    body: body.trim(),
  };
  cache.set(name, prompt);
  return prompt;
}

/** Minimal `{{TOKEN}}` substitution — deliberately not a template language. */
export function render(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    key in vars ? vars[key] : whole,
  );
}
