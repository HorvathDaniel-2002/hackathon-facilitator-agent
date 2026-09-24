import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { baseURL, configureIsolation } from "./tests/e2e/isolation.mts";

const { runtime } = configureIsolation();
const edge = process.platform === "win32" &&
  existsSync("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: path.join(runtime, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(runtime, "results.json") }],
    ["./tests/e2e/cleanup-reporter.ts"],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    channel: process.env.HF_E2E_BROWSER_CHANNEL ?? (edge ? "msedge" : undefined),
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  webServer: {
    command: `node --import tsx "${path.join("tests", "e2e", "server.mts")}"`,
    url: `${baseURL}/dashboard`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
