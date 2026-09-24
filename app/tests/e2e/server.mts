import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { markNewDatabase, root } from "./isolation.mts";

await new Promise<void>((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(3101, "127.0.0.1", () => probe.close(() => resolve()));
});

markNewDatabase();

function run(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Isolated setup failed: ${args.join(" ")}`);
}

run([path.join(root, "node_modules", "prisma", "build", "index.js"), "db", "push"]);
run(["--import", "tsx", path.join(root, "prisma", "seed.ts")]);

const child = spawn(process.execPath, [
  path.join(root, "node_modules", "next", "dist", "bin", "next"),
  "dev", "--hostname", "127.0.0.1", "--port", "3101",
], { cwd: root, env: process.env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 0; });
