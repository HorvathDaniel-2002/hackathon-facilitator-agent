import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNodeVersion, createRuntime, databaseState, demoEnvironment, demoPaths,
  dependencyStatus, installEnvironment, main, parseArgs, prepareDemoDirectory, validateLockfile,
  validatePublicDownloads, waitForHealthy,
} from "../../scripts/start-demo.mjs";

const roots: string[] = [];
function fixture() {
  const root = path.join(process.cwd(), ".artifacts", `demo-launcher-test-${randomUUID()}`);
  mkdirSync(root, { recursive: true });
  roots.push(root);
  const manifest = { name: "hackathon-facilitator", version: "0.2.0", dependencies: {}, devDependencies: {} };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": { ...manifest } } };
  writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(path.join(root, "package-lock.json"), JSON.stringify(lock));
  return { root, manifest, lock };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3 });
});

describe("local demo launch contracts", () => {
  it("requires Node 24 or newer and recommends stable defaults", () => {
    expect(assertNodeVersion("24.15.0")).toBe(24);
    expect(assertNodeVersion("26.0.0")).toBe(26);
    for (const version of ["22.12.0", "23.5.0", "unknown"]) expect(() => assertNodeVersion(version)).toThrow("Node.js 24");
    expect(parseArgs([])).toEqual({ port: 3000, open: true, check: false, help: false });
    expect(parseArgs(["--port", "3110", "--no-open", "--check"])).toEqual({ port: 3110, open: false, check: true, help: false });
  });

  it.each([["--port"], ["--port", "0"], ["--port", "1023"], ["--port", "65536"], ["--port", "3110x"], ["--host", "0.0.0.0"], ["--reset"], ["--production"]])(
    "rejects unsafe or unsupported options %j", (...args) => {
      expect(() => parseArgs(args)).toThrow();
    },
  );

  it("requires release-matched manifests without rewriting anything", () => {
    const { manifest, lock } = fixture();
    expect(() => validateLockfile(manifest, lock)).not.toThrow();
    expect(() => validateLockfile({ ...manifest, version: "2.0.0" }, lock)).toThrow("do not match");
    expect(() => validateLockfile({ ...manifest, dependencies: { next: "99" } }, lock)).toThrow("do not match");
    expect(() => validateLockfile(manifest, { lockfileVersion: 1 })).toThrow("do not match");
  });

  it("refuses private registries, credentials, file URLs and insecure downloads before installing", () => {
    expect(() => validatePublicDownloads({ packages: {
      "node_modules/next": { resolved: "https://registry.npmjs.org/next/-/next-16.3.4.tgz" },
    } })).not.toThrow();
    for (const resolved of ["https://private.example/next.tgz", "https://token@registry.npmjs.org/a.tgz", "http://registry.npmjs.org/a.tgz", "file:../other", "../local"]) {
      expect(() => validatePublicDownloads({ packages: { "node_modules/next": { resolved } } })).toThrow("non-public");
    }
  });

  it("only proposes automatic installation when node_modules is absent", () => {
    const { root } = fixture();
    const manifest = { dependencies: { next: "16.3.4" } };
    const lock = { packages: { "node_modules/next": { version: "16.3.4" } } };
    expect(dependencyStatus(root, manifest, lock)).toBe("missing");
    mkdirSync(path.join(root, "node_modules", "next"), { recursive: true });
    expect(() => dependencyStatus(root, manifest, lock)).toThrow("never silently replaced");
    writeFileSync(path.join(root, "node_modules", "next", "package.json"), JSON.stringify({ version: "16.3.4" }));
    expect(dependencyStatus(root, manifest, lock)).toBe("ready");
    writeFileSync(path.join(root, "node_modules", "next", "package.json"), JSON.stringify({ version: "0.0.0" }));
    expect(() => dependencyStatus(root, manifest, lock)).toThrow("differs");
  });

  it("drops inherited database, cloud, node-hook, auth and build overrides", () => {
    const { root } = fixture();
    const parent = {
      PATH: "safe-system-path", SystemRoot: "system",
      DATABASE_URL: "file:customer.db", AUTH_MODE: "entra", NODE_ENV: "production",
      AI_PROVIDER: "azure", AZURE_OPENAI_API_KEY: "test-sentinel", OPENAI_API_KEY: "test-sentinel",
      NODE_OPTIONS: "--require=untrusted", NEXT_PUBLIC_SECRET: "test-sentinel",
      HF_TEST_DIST_DIR: "customer-output", HF_TEST_TSCONFIG: "customer-tsconfig.json", npm_config_registry: "https://private.example",
    };
    const env = demoEnvironment(parent, root, 3110);
    expect(env).toMatchObject({
      PATH: parent.PATH, SystemRoot: parent.SystemRoot,
      DATABASE_URL: `file:${path.join(root, "demo.db")}`, AUTH_MODE: "dev", AI_PROVIDER: "mock",
      NODE_ENV: "development", APP_URL: "http://127.0.0.1:3110", NEXT_TELEMETRY_DISABLED: "1",
    });
    for (const key of ["AZURE_OPENAI_API_KEY", "OPENAI_API_KEY", "NODE_OPTIONS", "NEXT_PUBLIC_SECRET", "HF_TEST_DIST_DIR", "HF_TEST_TSCONFIG", "npm_config_registry"]) {
      expect(env).not.toHaveProperty(key);
    }
    expect(parent.AUTH_MODE).toBe("entra");
    expect(env.TEMP).toBe(path.join(root, "scratch"));
  });

  it("never adopts unknown data or resets an interrupted initialization", () => {
    const { root } = fixture();
    const paths = prepareDemoDirectory(root);
    expect(databaseState(paths)).toBe("new");
    writeFileSync(paths.database, "existing-file-sentinel");
    expect(() => databaseState(paths)).toThrow("interrupted");
    const marker = JSON.parse(readFileSync(paths.marker, "utf8"));
    writeFileSync(paths.marker, JSON.stringify({ ...marker, initialized: true }));
    expect(databaseState(paths)).toBe("existing");
    expect(readFileSync(paths.database, "utf8")).toBe("existing-file-sentinel");
    rmSync(paths.database);
    expect(() => databaseState(paths)).toThrow("missing");
  });

  it("preserves approved npm registry, proxy, auth and trust settings only during installation", () => {
    const { root } = fixture();
    const parent = {
      HOME: "user-home", USERPROFILE: "user-profile",
      npm_config_registry: "https://approved.example/npm",
      npm_config_userconfig: "user-npmrc", npm_config_globalconfig: "global-npmrc",
      npm_config_cafile: "approved-root.pem", npm_config_strict_ssl: "true",
      npm_config_cache: "configured-cache",
      HTTPS_PROXY: "https://approved-proxy.example", NO_PROXY: "127.0.0.1",
      NODE_EXTRA_CA_CERTS: "approved-root.pem", NODE_USE_SYSTEM_CA: "1",
      NPM_TOKEN: "synthetic-install-token", NODE_AUTH_TOKEN: "synthetic-node-token",
      AZURE_OPENAI_API_KEY: "do-not-pass-to-demo",
    };
    const install = installEnvironment(parent, root, 3110);
    expect(install).toMatchObject({
      ...Object.fromEntries(Object.entries(parent).filter(([key]) => key !== "AZURE_OPENAI_API_KEY")),
      PRISMA_SKIP_POSTINSTALL_GENERATE: "1",
    });
    expect(install).not.toHaveProperty("AZURE_OPENAI_API_KEY");
    const runtime = demoEnvironment(parent, root, 3110);
    for (const key of ["npm_config_registry", "npm_config_cafile", "npm_config_strict_ssl",
      "HTTPS_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "NODE_USE_SYSTEM_CA", "NPM_TOKEN", "NODE_AUTH_TOKEN"]) {
      expect(runtime).not.toHaveProperty(key);
    }
    const defaults = installEnvironment({ HOME: "standard-user-home" }, root, 3110);
    expect(defaults).toHaveProperty("HOME", "standard-user-home");
    expect(defaults).not.toHaveProperty("npm_config_userconfig");
    expect(defaults).not.toHaveProperty("npm_config_globalconfig");
  });

  it("rejects an unmarked directory and an artifacts junction", () => {
    const first = fixture().root;
    mkdirSync(demoPaths(first).directory, { recursive: true });
    expect(() => prepareDemoDirectory(first)).toThrow("unrecognized");
    const second = fixture().root;
    const target = fixture().root;
    symlinkSync(target, path.join(second, ".artifacts"), process.platform === "win32" ? "junction" : "dir");
    expect(() => prepareDemoDirectory(second)).toThrow("linked");
    expect(readdirSync(target).sort()).toEqual(["package-lock.json", "package.json"]);
  });

  it("copies only runtime assets, with a separate tsconfig and no environment or customer database", () => {
    const { root } = fixture();
    for (const name of ["src", "methodology", "prompts", "prisma", "node_modules"]) mkdirSync(path.join(root, name));
    for (const name of ["schema.prisma", "seed.ts"]) writeFileSync(path.join(root, "prisma", name), "// synthetic fixture");
    writeFileSync(path.join(root, "postcss.config.mjs"), "export default {};");
    const tsconfig = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } }, include: ["old"], exclude: [] });
    writeFileSync(path.join(root, "tsconfig.json"), tsconfig);
    writeFileSync(path.join(root, ".env"), "DO_NOT_LOAD=test-env-sentinel");
    writeFileSync(path.join(root, "src", ".env"), "DO_NOT_LOAD=nested-env-sentinel");
    writeFileSync(path.join(root, "prisma", "customer.db"), "customer-db-sentinel");
    writeFileSync(path.join(root, "src", "demo.ts"), "export const demo = true;");
    const paths = prepareDemoDirectory(root);
    const runtime = createRuntime(root, paths.directory);
    expect(existsSync(path.join(runtime, ".env"))).toBe(false);
    expect(existsSync(path.join(runtime, "src", ".env"))).toBe(false);
    expect(existsSync(path.join(runtime, "prisma", "customer.db"))).toBe(false);
    expect(existsSync(path.join(runtime, "tsconfig.json"))).toBe(false);
    expect(readFileSync(path.join(runtime, "next.config.mjs"), "utf8")).toContain("devIndicators: false");
    expect(readFileSync(path.join(runtime, "postcss.config.mjs"), "utf8")).toContain(JSON.stringify(path.join(runtime, "src")));
    expect(readFileSync(path.join(runtime, ".gitignore"), "utf8")).toContain(".next-demo/");
    expect(JSON.parse(readFileSync(path.join(runtime, "tsconfig.demo.json"), "utf8")).compilerOptions.paths).toEqual({ "@/*": ["./src/*"] });
    expect(readFileSync(path.join(root, "tsconfig.json"), "utf8")).toBe(tsconfig);
    expect(readFileSync(path.join(root, ".env"), "utf8")).toBe("DO_NOT_LOAD=test-env-sentinel");
    expect(readFileSync(path.join(root, "prisma", "customer.db"), "utf8")).toBe("customer-db-sentinel");
  });

  it("--check does not create any runtime or install missing dependencies", async () => {
    const { root } = fixture();
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await main(["--check"], root);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("dependencies missing"));
    expect(existsSync(path.join(root, ".artifacts"))).toBe(false);
    expect(existsSync(path.join(root, "node_modules"))).toBe(false);
  });

  it("removes a partially copied snapshot when a release file is missing", () => {
    const { root } = fixture();
    const paths = prepareDemoDirectory(root);
    expect(() => createRuntime(root, paths.directory)).toThrow();
    expect(readdirSync(paths.directory)).toEqual(["owner.json"]);
    expect(databaseState(paths)).toBe("new");
  });

  it("fails occupied ports without creating a demo or using the other app", async () => {
    const { root } = fixture();
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    try {
      await expect(main(["--port", String(address.port), "--no-open"], root)).rejects.toThrow("already in use");
      expect(existsSync(path.join(root, ".artifacts"))).toBe(false);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });

  it("requires the launch-specific token and a working development page before browser readiness", async () => {
    let dashboardReads = 0;
    const server = createServer((request, response) => {
      if (request.url === "/api/local-demo-health") response.end(JSON.stringify({ token: "our-server" }));
      else if (request.url === "/") { response.writeHead(307, { Location: "/board" }); response.end(); }
      else { dashboardReads++; response.end("Development sign-in"); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      await expect(waitForHealthy(url, "not-our-server", { timeout: 100 })).rejects.toThrow("no browser was opened");
      expect(dashboardReads).toBe(0);
      await expect(waitForHealthy(url, "our-server", { timeout: 1000 })).resolves.toBeUndefined();
      expect(dashboardReads).toBe(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
