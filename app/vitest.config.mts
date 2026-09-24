import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    // Persistence tests create their own databases; none call a live model.
    env: {
      AI_PROVIDER: "mock",
      AUTH_MODE: "dev",
      DATABASE_URL: "file:./prisma/dev.db",
    },
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
