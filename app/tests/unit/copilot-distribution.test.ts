import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { installAgent, methodologyFiles, profileName } from "../../scripts/install-copilot-agent.mjs";
import { packageAgent } from "../../scripts/package-copilot-agent.mjs";

const root = process.cwd();
const created: string[] = [];
function temporary() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hf-agent-distribution-"));
  created.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of created.splice(0)) {
    if (!path.basename(directory).startsWith("hf-agent-distribution-")) throw new Error("Unsafe test cleanup path.");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("GitHub Copilot agent profile", () => {
  const text = fs.readFileSync(path.join(root, ".github", "agents", profileName), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text)!;
  const metadata = parse(match[1]);
  it("uses supported frontmatter, tools and prompt limits", () => {
    expect(metadata.name).toBe("hackathon-facilitator");
    expect(metadata.description.length).toBeGreaterThan(30);
    expect(metadata.tools).toEqual(["read", "search", "edit", "execute", "web"]);
    expect(metadata["disable-model-invocation"]).toBe(true);
    expect(metadata["user-invocable"]).toBe(true);
    expect(metadata["mcp-servers"]).toBeUndefined();
    expect(metadata.model).toBeUndefined();
    expect(match[2].length).toBeLessThanOrEqual(30_000);
  });
  it("distinguishes host reasoning, mock scoring and corporate approval", () => {
    expect(text).toContain("separate from the companion app");
    expect(text).toContain("Do not use mock scores");
    expect(text).toContain("not Microsoft corporate policy approval");
    expect(text).toContain("Do not bypass consent");
    expect(text).toContain("unknown is not a pass");
    expect(text).toContain("labeled reference");
  });
  it("covers preparation, readiness, execution and accountable handoff", () => {
    for (const phrase of ["Charter and stakeholder alignment", "Structured intake", "Technical readiness",
      "Event plan and facilitation", "Readout, handoff and follow-up", "dated next milestone"]) {
      expect(text).toContain(phrase);
    }
  });
});

describe("safe local installation", () => {
  it("installs into a workspace without modifying unrelated files and is idempotent", () => {
    const destination = temporary();
    fs.writeFileSync(path.join(destination, "keep.txt"), "existing work");
    const first = installAgent({ sourceRoot: root, target: destination });
    expect(first.installed).toBe(8);
    expect(fs.existsSync(path.join(destination, ".github", "agents", profileName))).toBe(true);
    for (const name of methodologyFiles) expect(fs.existsSync(path.join(destination, ".github", "hackathon-facilitator", "methodology", name))).toBe(true);
    const second = installAgent({ sourceRoot: root, target: destination });
    expect(second.installed).toBe(0);
    expect(second.unchanged).toBe(8);
    expect(fs.readFileSync(path.join(destination, "keep.txt"), "utf8")).toBe("existing work");
  });
  it("refuses differing existing files before installing any reference", () => {
    const destination = temporary();
    const agents = path.join(destination, ".github", "agents");
    fs.mkdirSync(agents, { recursive: true });
    fs.writeFileSync(path.join(agents, profileName), "my customized profile");
    expect(() => installAgent({ sourceRoot: root, target: destination })).toThrow("Existing file differs");
    expect(fs.readFileSync(path.join(agents, profileName), "utf8")).toBe("my customized profile");
    expect(fs.existsSync(path.join(destination, ".github", "hackathon-facilitator"))).toBe(false);
  });
  it("copies only the self-contained profile for personal installation", () => {
    const home = temporary();
    const result = installAgent({ sourceRoot: root, personal: true, home });
    expect(result.installed).toBe(1);
    expect(fs.existsSync(path.join(home, ".copilot", "agents", profileName))).toBe(true);
    expect(fs.existsSync(path.join(home, ".github"))).toBe(false);
  });
  it("requires exactly one explicit installation scope", () => {
    expect(() => installAgent({ sourceRoot: root })).toThrow("exactly one");
    expect(() => installAgent({ sourceRoot: root, personal: true, target: temporary() })).toThrow("exactly one");
  });
  it("rejects junctions/symlinks that could redirect the install", () => {
    const destination = temporary();
    const elsewhere = temporary();
    fs.symlinkSync(elsewhere, path.join(destination, ".github"), process.platform === "win32" ? "junction" : "dir");
    expect(() => installAgent({ sourceRoot: root, target: destination })).toThrow("symbolic link or junction");
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  });
});

describe("allowlisted distribution package", () => {
  it("contains only reviewed agent/reference/docs files and valid content hashes", () => {
    const directory = temporary();
    const output = path.join(directory, "bundle");
    const result = packageAgent(root, output);
    expect(result.files).toBe(14);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "package-manifest.json"), "utf8"));
    expect(manifest.status).toBe("local-distribution-candidate");
    expect(manifest.files).toHaveLength(13);
    for (const file of manifest.files) {
      expect(file.path).not.toMatch(/\.db|\.env|node_modules|session-state|screenshots|\.git\//);
      const bytes = fs.readFileSync(path.join(output, ...file.path.split("/")));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
    expect(() => packageAgent(root, output)).toThrow("Output already exists");
    expect(fs.existsSync(path.join(output, "package.json"))).toBe(false);
    expect(fs.existsSync(path.join(output, ".github", "workflows"))).toBe(false);
  });
  it("installs from the generated standalone bundle without app dependencies", () => {
    const directory = temporary();
    const output = path.join(directory, "bundle");
    packageAgent(root, output);
    const workspace = path.join(directory, "recipient");
    fs.mkdirSync(workspace);
    const result = installAgent({ sourceRoot: output, target: workspace });
    expect(result.installed).toBe(8);
  });
  it("uses the required minimal Copilot setup job without credentials or cloud deployment", () => {
    const workflow = parse(fs.readFileSync(path.join(root, ".github", "workflows", "copilot-setup-steps.yml"), "utf8"));
    expect(Object.keys(workflow.jobs)).toEqual(["copilot-setup-steps"]);
    const job = workflow.jobs["copilot-setup-steps"];
    expect(job.permissions).toEqual({ contents: "read" });
    expect(job["timeout-minutes"]).toBeLessThan(60);
    expect(job.steps.at(-1).run).toContain("--help");
    expect(JSON.stringify(workflow)).not.toMatch(/secrets\.|azd up|terraform apply/);
  });
});
