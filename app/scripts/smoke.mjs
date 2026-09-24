/**
 * Real-browser smoke tests. Always provisions a new test database and starts its
 * own mock-only server on 3101. BASE_URL and DATABASE_URL never select live data.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function runIsolatedBrowserTests(grep = "@smoke") {
  let cli;
  try {
    cli = require.resolve("@playwright/test/cli");
  } catch {
    throw new Error("Install the project's dev dependencies before running browser tests.");
  }
  const env = { ...process.env, AI_PROVIDER: "mock", AUTH_MODE: "dev" };
  for (const key of ["DATABASE_URL", "BASE_URL", "HF_E2E_RUN_ID", "HF_E2E_RUNTIME", "HF_TEST_DIST_DIR", "HF_NEXT_DIST_DIR"]) {
    delete env[key];
  }
  const result = spawnSync(process.execPath, [cli, "test", "--grep", grep], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runIsolatedBrowserTests();
}
