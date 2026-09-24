import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { packagePublicApp, publicLockfile } from "../../scripts/package-public-app.mjs";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    if (!path.basename(folder).startsWith("hf-public-package-")) throw new Error("Invalid test cleanup target");
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
describe("public application distribution", () => {
  it("rewrites approved mirror URLs without changing versions, integrity or dependency constraints", () => {
    const sample = {
      lockfileVersion: 3, packages: {
        "": { version: "0.2.0", dependencies: { next: "16.3.4" } },
        "node_modules/next": {
          version: "16.3.4", integrity: "sha512-test",
          resolved: "https://mirror.pkgs.visualstudio.com/public/_packaging/npm-public/npm/registry/next/-/next-16.3.4.tgz",
        },
      },
    };
    const result = publicLockfile(JSON.stringify(sample));
    expect(result.normalized).toBe(1);
    expect(JSON.parse(result.text)).toEqual({
      ...sample, packages: {
        ...sample.packages,
        "node_modules/next": { ...sample.packages["node_modules/next"], resolved: "https://registry.npmjs.org/next/-/next-16.3.4.tgz" },
      },
    });
  });
  it("rejects unknown registry hosts instead of silently changing package origins", () => {
    expect(() => publicLockfile(JSON.stringify({
      packages: { "node_modules/pkg": { version: "1", integrity: "sha512-test", resolved: "https://untrusted.invalid/pkg.tgz" } },
    }))).toThrow("Unapproved package source host");
  });
  it("publishes only source/config/templates and excludes local runtime data and app history", () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "hf-public-package-"));
    folders.push(folder);
    const output = path.join(folder, "app");
    const result = packagePublicApp(process.cwd(), output);
    const paths = result.files.map(file => file.path);
    expect(paths).toContain("src/components/kanban-board.tsx");
    expect(paths).toContain("scripts/start-demo.mjs");
    expect(paths).toContain(".env.sample");
    expect(paths).toContain("Start-Hackathon.cmd");
    expect(paths).not.toContain(".env");
    expect(paths).not.toContain("prisma/dev.db");
    expect(paths.some(file => /(^|\/)(\.git|\.artifacts|\.runtime|node_modules|private|local-data)\//.test(file))).toBe(false);
    expect(paths.some(file => /\.db(?:-|$)|\.mp4$|\.png$|tsbuildinfo/.test(file))).toBe(false);
    expect(paths).not.toContain("docs/usability-review-20260911.md");
    for (const file of result.files) {
      const bytes = fs.readFileSync(path.join(output, ...file.path.split("/")));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
    const lock = fs.readFileSync(path.join(output, "package-lock.json"), "utf8");
    expect(lock).not.toContain(".pkgs.visualstudio.com");
    expect(lock).toContain("registry.npmjs.org");
    expect(() => packagePublicApp(process.cwd(), output)).toThrow("NEW output folder");
  });
});
