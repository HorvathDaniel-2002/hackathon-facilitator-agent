import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { rejectLinks } from "./install-copilot-agent.mjs";

export const publicAppFiles = [
  "package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs",
  "tsconfig.json", "eslint.config.mjs", "vitest.config.mts", "playwright.config.ts",
  "prisma.config.ts", ".env.sample", ".gitignore", "AGENTS.md",
  "Start-Hackathon.cmd", "start-hackathon.command",
  "prisma/schema.prisma", "prisma/seed.ts",
  "scripts/start-demo.mjs", "scripts/migrate-kanban.mjs", "scripts/smoke.mjs",
  "scripts/ai-lifecycle-check.mts", "scripts/install-copilot-agent.mjs",
  "scripts/package-copilot-agent.mjs", "scripts/package-public-app.mjs",
  ".github/agents/hackathon-facilitator.agent.md", ".github/workflows/copilot-setup-steps.yml",
  "docs/local-demo-setup.md", "docs/kanban-workflow.md", "docs/microsoft-grounding.md",
  "docs/copilot-agent-installation.md", "docs/colleague-distribution.md", "docs/official-hackathon-submission.md",
  "distribution/README.md", "distribution/app-README.md",
];
const directoryRules = [
  ["src", /\.(ts|tsx|css|svg)$/],
  ["methodology", /\.yaml$/],
  ["prompts", /\.md$/],
  ["tests/unit", /\.(ts|tsx|mts)$/],
  ["tests/e2e", /\.(ts|tsx|mts)$/],
];
const forbiddenContent = /C:[\\/]+Users[\\/]|session-state[\\/]|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\r\n]|github_pat_[A-Za-z0-9_]{40,}|gh[pousr]_[A-Za-z0-9]{25,}|AccountKey=[A-Za-z0-9+/=]{20,}/i;

export function publicLockfile(text) {
  const lock = JSON.parse(text);
  let normalized = 0;
  for (const entry of Object.values(lock.packages ?? {})) {
    if (!entry.resolved) continue;
    const url = new URL(entry.resolved);
    if (url.hostname.endsWith(".pkgs.visualstudio.com") && url.pathname.includes("/npm/registry/")) {
      entry.resolved = `https://registry.npmjs.org/${url.pathname.split("/npm/registry/")[1]}`;
      normalized++;
    } else if (url.hostname !== "registry.npmjs.org") {
      throw new Error(`Unapproved package source host: ${url.hostname}`);
    }
    if (!entry.integrity || !entry.version) throw new Error("A package is missing version/integrity metadata.");
  }
  return { text: `${JSON.stringify(lock, null, 2)}\n`, normalized };
}

function collect(directory, rule, base, output) {
  rejectLinks(directory);
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.name.startsWith(".")) continue;
    const full = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error("Symlink in public source tree.");
    if (item.isDirectory()) collect(full, rule, base, output);
    else if (item.isFile() && rule.test(item.name)) output.push(path.relative(base, full).split(path.sep).join("/"));
  }
}

export function packagePublicApp(sourceRoot, output) {
  const root = path.resolve(sourceRoot), destination = path.resolve(output);
  rejectLinks(destination);
  if (fs.existsSync(destination)) throw new Error("Choose a NEW output folder; never overwrite an existing installation.");
  const files = [...publicAppFiles];
  for (const [folder, rule] of directoryRules) collect(path.join(root, ...folder.split("/")), rule, root, files);
  let normalizedPackages = 0;
  const prepared = [...new Set(files)].map(relative => {
    const file = path.join(root, ...relative.split("/"));
    rejectLinks(file);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 2_000_000) throw new Error(`Unexpected public source file: ${relative}`);
    let text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (relative === "package-lock.json") {
      const normalized = publicLockfile(text);
      text = normalized.text;
      normalizedPackages = normalized.normalized;
    }
    if (relative === "tsconfig.json") {
      const config = JSON.parse(text);
      config.include = ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"];
      config.exclude = ["node_modules", "tests/e2e/.runtime", ".artifacts", ".demo"];
      text = JSON.stringify(config, null, 2) + "\n";
    }
    if (relative === "docs/copilot-agent-installation.md") {
      text = text.replaceAll("](../materials/", "](../../materials/");
    }
    if (relative === "distribution/app-README.md") {
      text = text.replaceAll("](docs/", "](../docs/");
    }
    // This script contains the scan expressions, not customer records; its literals are audited as source.
    if (relative !== "scripts/package-public-app.mjs" && forbiddenContent.test(text)) {
      throw new Error(`Possible private content in allowlisted file: ${relative}`);
    }
    return { relative, text };
  });
  const readmePath = path.join(root, "distribution", "app-README.md");
  rejectLinks(readmePath);
  const readme = fs.readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n").replaceAll("](../docs/", "](docs/");
  if (forbiddenContent.test(readme)) throw new Error("Possible private content in public app README.");
  prepared.push({ relative: "README.md", text: readme });
  fs.mkdirSync(destination, { recursive: true });
  for (const { relative, text } of prepared) {
    const target = path.join(destination, ...relative.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, { flag: "wx" });
  }
  return {
    output: destination, normalizedPackages,
    files: prepared.map(({ relative, text }) => ({ path: relative, sha256: createHash("sha256").update(text).digest("hex") })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--output") throw new Error("Usage: node scripts/package-public-app.mjs --output <new folder>");
    const result = packagePublicApp(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), args[1]);
    console.log(JSON.stringify({ output: result.output, files: result.files.length, normalizedPackages: result.normalizedPackages }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
