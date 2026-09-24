import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const root = path.resolve(process.cwd());
export const baseURL = "http://127.0.0.1:3101";

export function configureIsolation() {
  const runId = process.env.HF_E2E_RUN_ID ?? randomUUID();
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error("Invalid E2E run identifier.");
  const runtime = path.join(root, "tests", "e2e", ".runtime", runId);
  const dbPath = path.join(runtime, "isolated.db");
  const databaseURL = `file:${dbPath}`;
  mkdirSync(runtime, { recursive: true });
  // Keep aliases relative to the project root without Windows absolute imports,
  // while allowing Next to add its generated includes without modifying tsconfig.json.
  const tsconfig = path.join(root, `.tsconfig-e2e-${runId}.json`);
  writeFileSync(tsconfig, readFileSync(path.join(root, "tsconfig.json"), "utf8"));
  Object.assign(process.env, {
    HF_E2E_RUN_ID: runId,
    HF_E2E_RUNTIME: runtime,
    HF_TEST_TSCONFIG: path.relative(root, tsconfig),
    HF_TEST_DIST_DIR: path.join("tests", "e2e", ".runtime", runId, "next"),
    HF_NEXT_DIST_DIR: path.join("tests", "e2e", ".runtime", runId, "next"),
    DATABASE_URL: databaseURL,
    AI_PROVIDER: "mock",
    AUTH_MODE: "dev",
    APP_URL: baseURL,
    NEXT_TELEMETRY_DISABLED: "1",
    TEMP: runtime,
    TMP: runtime,
  });
  return { runId, runtime, dbPath, databaseURL };
}

export function assertIsolatedDatabase() {
  const runId = process.env.HF_E2E_RUN_ID;
  if (!runId || !/^[a-f0-9-]{36}$/.test(runId)) {
    throw new Error("Use Playwright or the safe smoke runner, never an existing database.");
  }
  const runtime = path.join(root, "tests", "e2e", ".runtime", runId);
  const dbPath = path.join(runtime, "isolated.db");
  if (
    process.env.DATABASE_URL !== `file:${dbPath}` ||
    process.env.AI_PROVIDER !== "mock" ||
    process.env.AUTH_MODE !== "dev"
  ) {
    throw new Error("E2E requires its own SQLite database, AI_PROVIDER=mock and AUTH_MODE=dev.");
  }
  return { runtime, dbPath, databaseURL: `file:${dbPath}` };
}

export function markNewDatabase() {
  const isolation = assertIsolatedDatabase();
  if (existsSync(isolation.dbPath)) {
    throw new Error("Refusing to push or seed an existing database.");
  }
  mkdirSync(isolation.runtime, { recursive: true });
  writeFileSync(path.join(isolation.runtime, "owner.json"), JSON.stringify({
    runId: process.env.HF_E2E_RUN_ID,
    databaseURL: isolation.databaseURL,
  }), { flag: "wx" });
  return isolation;
}

export function verifyDatabaseOwner() {
  const isolation = assertIsolatedDatabase();
  const marker = JSON.parse(readFileSync(path.join(isolation.runtime, "owner.json"), "utf8"));
  if (marker.runId !== process.env.HF_E2E_RUN_ID || marker.databaseURL !== isolation.databaseURL) {
    throw new Error("Database ownership marker does not match this test run.");
  }
  return isolation;
}
