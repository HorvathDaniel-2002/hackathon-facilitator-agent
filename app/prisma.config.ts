import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 CLI configuration.
 *
 * CLI and application must use the same database URL. Changing database provider
 * still requires provider-specific schemas/migrations and validation.
 */
if (fs.existsSync(".env")) process.loadEnvFile(".env");
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
