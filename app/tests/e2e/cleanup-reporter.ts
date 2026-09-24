import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import type { Reporter } from "@playwright/test/reporter";
import { root, verifyDatabaseOwner } from "./isolation.mts";

export default class CleanupReporter implements Reporter {
  async onExit() {
    if (!process.env.HF_E2E_RUNTIME || !existsSync(path.join(process.env.HF_E2E_RUNTIME, "owner.json"))) return;
    const { dbPath, runtime } = verifyDatabaseOwner();
    // onExit runs after Playwright stops its webServer; SQLite may stay locked
    // briefly on Windows. Only remove artifacts proven to belong to this run.
    for (const target of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`, path.join(runtime, "next"),
      path.join(root, `.tsconfig-e2e-${process.env.HF_E2E_RUN_ID}.json`)]) {
      try {
        rmSync(target, { force: true, recursive: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        console.warn(`Retained locked isolated test artifact: ${target}`);
      }
    }
  }
}
