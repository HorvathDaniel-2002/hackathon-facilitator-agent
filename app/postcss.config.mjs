import path from "node:path";

const config = {
  plugins: {
    "@tailwindcss/postcss": { base: path.join(process.cwd(), "src") },
  },
};

export default config;
