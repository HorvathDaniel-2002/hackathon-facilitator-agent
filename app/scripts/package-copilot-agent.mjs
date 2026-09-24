import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { methodologyFiles, profileName, rejectLinks } from "./install-copilot-agent.mjs";

export const releaseVersion = "0.2.0";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function packageAgent(sourceRoot, output) {
  const root = path.resolve(sourceRoot);
  const destination = path.resolve(output);
  rejectLinks(destination);
  if (fs.existsSync(destination)) throw new Error("Output already exists. Choose a new empty package path; never package over an existing folder.");
  const files = [
    [path.join(".github", "agents", profileName), path.join(".github", "agents", profileName)],
    [path.join("distribution", "README.md"), "README.md"],
    [path.join("scripts", "install-copilot-agent.mjs"), path.join("scripts", "install-copilot-agent.mjs")],
    ...["copilot-agent-installation.md", "colleague-distribution.md", "official-hackathon-submission.md"]
      .map((name) => [path.join("docs", name), path.join("docs", name)]),
    ...methodologyFiles.map((name) => [path.join("methodology", name), path.join(".github", "hackathon-facilitator", "methodology", name)]),
  ];
  const prepared = files.map(([source, target]) => {
    const filename = path.join(root, source);
    rejectLinks(filename);
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100_000) throw new Error(`Invalid allowlisted package file: ${source}`);
    const bytes = fs.readFileSync(filename);
    const text = bytes.toString("utf8");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[a-zA-Z0-9]{25,}/.test(text)) {
      throw new Error(`Possible secret in allowlisted file: ${source}`);
    }
    return { target, bytes, sha256: hash(bytes) };
  });
  const agent = prepared.find((file) => file.target.endsWith(profileName)).bytes.toString("utf8");
  if (!/^---\r?\n/.test(agent) || agent.length > 30_000 || !/^description:\s+\S/m.test(agent)) {
    throw new Error("Invalid custom-agent frontmatter or prompt length.");
  }
  fs.mkdirSync(destination, { recursive: true });
  for (const file of prepared) {
    const target = path.join(destination, file.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.bytes, { flag: "wx" });
  }
  const manifest = {
    name: "hackathon-facilitator", version: releaseVersion,
    status: "local-distribution-candidate",
    publication: "Local build only; this artifact has not been uploaded. See distribution docs for the published GitHub release. Official hackathon submission remains pending.",
    exclusions: ["customer data", "databases", "credentials", "session artifacts", "screenshots", "git history", "node_modules", "app runtime"],
    files: prepared.map(({ target, sha256 }) => ({ path: target.split(path.sep).join("/"), sha256 })),
  };
  fs.writeFileSync(path.join(destination, "package-manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  return { output: destination, files: prepared.length + 1, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== "--output") throw new Error("Usage: node scripts/package-copilot-agent.mjs --output <new folder>");
    const result = packageAgent(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), args[1]);
    console.log(JSON.stringify({ output: result.output, files: result.files, version: releaseVersion }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
