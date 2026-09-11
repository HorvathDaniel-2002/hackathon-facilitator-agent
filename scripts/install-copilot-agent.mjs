import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const profileName = "hackathon-facilitator.agent.md";
export const methodologyFiles = ["rubric.yaml", "gates.yaml", "routing.yaml", "agendas.yaml", "handoff.yaml", "runbook.yaml", "sources.yaml"];

export function rejectLinks(filename) {
  const absolute = path.resolve(filename);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of path.relative(parsed.root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing a symbolic link or junction: ${current}`);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
  }
}

/** @param {{ sourceRoot: string, target?: string, personal?: boolean, home?: string }} options */
export function installAgent({ sourceRoot, target, personal = false, home = os.homedir() }) {
  if (personal === Boolean(target)) throw new Error("Choose exactly one of --target <existing folder> or --personal.");
  const root = path.resolve(sourceRoot);
  const profile = path.join(root, ".github", "agents", profileName);
  rejectLinks(profile);
  if (!fs.statSync(profile).isFile()) throw new Error("Agent profile is missing.");
  const destination = personal ? path.join(home, ".copilot") : path.resolve(target);
  rejectLinks(destination);
  if (!personal && !fs.statSync(destination).isDirectory()) throw new Error("The target workspace must be an existing directory.");

  const plan = [{ source: profile, target: personal
    ? path.join(destination, "agents", profileName)
    : path.join(destination, ".github", "agents", profileName) }];

  if (!personal) {
    const bundled = path.join(root, ".github", "hackathon-facilitator", "methodology");
    const referenceRoot = fs.existsSync(bundled) ? bundled : path.join(root, "methodology");
    for (const name of methodologyFiles) {
      plan.push({
        source: path.join(referenceRoot, name),
        target: path.join(destination, ".github", "hackathon-facilitator", "methodology", name),
      });
    }
  }

  // Validate the whole plan before creating anything. Differing local edits are never overwritten.
  for (const file of plan) {
    rejectLinks(file.source);
    rejectLinks(file.target);
    if (!fs.statSync(file.source).isFile()) throw new Error(`Missing reference: ${file.source}`);
    file.bytes = fs.readFileSync(file.source);
    file.exists = fs.existsSync(file.target);
    if (file.exists && (!fs.statSync(file.target).isFile() || !fs.readFileSync(file.target).equals(file.bytes))) {
      throw new Error(`Existing file differs; compare and back it up before updating: ${file.target}`);
    }
  }

  const created = [];
  try {
    for (const file of plan.filter((entry) => !entry.exists)) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      rejectLinks(file.target);
      fs.copyFileSync(file.source, file.target, fs.constants.COPYFILE_EXCL);
      created.push(file.target);
    }
  } catch (error) {
    const failures = [];
    for (const filename of created.reverse()) {
      try { fs.unlinkSync(filename); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (failures.length) throw new AggregateError([error, ...failures], "Installation failed and some newly created files could not be removed.");
    throw error;
  }
  return { installed: created.length, unchanged: plan.length - created.length, profile: plan[0].target };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: node scripts/install-copilot-agent.mjs --target <existing workspace>\n       node scripts/install-copilot-agent.mjs --personal\nNo network calls, authentication changes or overwrites.");
    return;
  }
  const personal = args.length === 1 && args[0] === "--personal";
  const target = args.length === 2 && args[0] === "--target" ? args[1] : undefined;
  if (!personal && !target) throw new Error("Use --help for installation options.");
  const result = installAgent({ sourceRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), personal, target });
  console.log(JSON.stringify(result, null, 2));
  console.log("Open the target in your permitted Copilot host and select hackathon-facilitator. No cloud service was installed.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
