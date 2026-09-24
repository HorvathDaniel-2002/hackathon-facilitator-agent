import { execFileSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Only a new, test-owned path may receive a schema push; existing databases are never migrated. */
export function createAiTestDatabase(databasePath: string): void {
  if (path.dirname(databasePath) !== path.join(process.cwd(), "tests", "unit") ||
      !/^\.ai-[a-z]+-[0-9a-f-]+\.db$/.test(path.basename(databasePath)) ||
      existsSync(databasePath)) {
    throw new Error("Refusing to initialize a database that is not a new AI test-owned path.");
  }
  const configPath = `${databasePath}.config.ts`;
  if (existsSync(configPath)) throw new Error("AI test configuration already exists.");
  writeFileSync(configPath, [
    'import { defineConfig } from "prisma/config";',
    `export default defineConfig({schema:${JSON.stringify(path.join(process.cwd(), "prisma", "schema.prisma"))},`,
    `datasource:{url:${JSON.stringify(`file:${databasePath}`)}}});`,
  ].join("\n"), { flag: "wx" });
  try {
    execFileSync(process.execPath, [
      path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"),
      "db", "push", "--config", configPath,
    ], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 });
  } finally {
    rmSync(configPath, { force: true });
  }
}
