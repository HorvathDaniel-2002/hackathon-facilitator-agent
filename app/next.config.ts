import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.HF_TEST_DIST_DIR || process.env.HF_NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.HF_TEST_TSCONFIG || "tsconfig.json" },
};

export default nextConfig;
