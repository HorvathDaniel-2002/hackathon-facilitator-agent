import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OWNER = "hackathon-facilitator-local-demo-v1";
const HELP = `Hackathon Facilitator — local synthetic demo

  npm run demo
  node scripts/start-demo.mjs [--port 3000] [--no-open] [--check]

Requires Node.js 24 or newer (24 LTS recommended).
--check    Validate prerequisites without installing, creating files or starting a server.
--no-open  Do not open a browser automatically.
--port     Use a specific loopback port (1024–65535); occupied ports are never reused.

No .env, customer database or cloud AI configuration is loaded.
Demo data stays in .artifacts/local-demo/demo.db. Ctrl+C stops the server.
This is a local development demo, not SSO or a production service.`;

export function parseArgs(args) {
  const options = { port: 3000, open: true, check: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--no-open") options.open = false;
    else if (arg === "--check") options.check = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--port") {
      const raw = args[++index];
      if (!raw || !/^\d+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) {
        throw new Error("--port needs a whole number between 1024 and 65535.");
      }
      options.port = Number(raw);
    } else throw new Error(`Unknown option: ${arg}. Use --help for supported options.`);
  }
  return options;
}

export function assertNodeVersion(version = process.versions.node) {
  const major = Number(version.split(".")[0]);
  if (!Number.isInteger(major) || major < 24) {
    throw new Error(`Node.js 24 LTS or newer is required; found ${version}. Install Node 24 from https://nodejs.org, then reopen this launcher.`);
  }
  return major;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { throw new Error(`Cannot read valid JSON from ${file}. Download/extract the complete app folder again.`); }
}

export function validateLockfile(manifest, lock) {
  const root = lock.packages?.[""];
  if (lock.lockfileVersion < 2 || !root || lock.name !== manifest.name || lock.version !== manifest.version ||
      root.name !== manifest.name || root.version !== manifest.version) {
    throw new Error("package.json and package-lock.json do not match. Use both files from the same release; the launcher will not rewrite the lockfile.");
  }
  for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const expected = manifest[group] ?? {};
    const actual = root[group] ?? {};
    if (Object.keys(expected).length !== Object.keys(actual).length ||
        Object.entries(expected).some(([name, version]) => actual[name] !== version)) {
      throw new Error(`package.json and package-lock.json ${group} do not match. Restore the matching release files before starting.`);
    }
  }
}

export function validatePublicDownloads(lock) {
  for (const entry of Object.values(lock.packages ?? {})) {
    if (!entry.resolved) continue;
    let url;
    try { url = new URL(entry.resolved); } catch { /* Rejected below. */ }
    if (!url || url.protocol !== "https:" || url.hostname !== "registry.npmjs.org" || url.username || url.password) {
      throw new Error("This lockfile contains non-public package download locations. Use the sanitized public app release; no private registry credentials are needed or requested.");
    }
  }
}

export function dependencyStatus(root, manifest, lock) {
  const directory = path.join(root, "node_modules");
  if (!existsSync(directory)) return "missing";
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    const file = path.join(directory, name, "package.json");
    if (!existsSync(file) || readJson(file).version !== lock.packages?.[`node_modules/${name}`]?.version) {
      throw new Error(`Installed dependency ${name} is missing or differs from the release lockfile. In this app folder, run npm ci --include=dev, then start again. Existing dependencies are never silently replaced.`);
    }
  }
  return "ready";
}

export function demoPaths(root) {
  const directory = path.join(root, ".artifacts", "local-demo");
  return {
    directory, database: path.join(directory, "demo.db"),
    marker: path.join(directory, "owner.json"), lock: path.join(directory, "launcher.lock"),
  };
}

function rejectLink(file) {
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
    throw new Error(`Refusing a linked demo path: ${file}. Use a normal local app folder.`);
  }
}

export function prepareDemoDirectory(root) {
  const paths = demoPaths(root);
  rejectLink(path.join(root, ".artifacts"));
  rejectLink(paths.directory);
  rejectLink(paths.marker);
  rejectLink(paths.database);
  if (existsSync(paths.directory)) {
    if (!existsSync(paths.marker) || readJson(paths.marker).owner !== OWNER) {
      throw new Error(`Refusing an unrecognized demo directory: ${paths.directory}. Preserve it and use a fresh copy of the app.`);
    }
  } else {
    mkdirSync(paths.directory, { recursive: true });
    writeFileSync(paths.marker, JSON.stringify({ owner: OWNER, initialized: false }), { flag: "wx" });
  }
  return paths;
}

export function databaseState(paths) {
  rejectLink(paths.database);
  const marker = readJson(paths.marker);
  if (marker.owner !== OWNER) throw new Error("Demo database ownership is not recognized.");
  const present = existsSync(paths.database);
  if (marker.initialized === true && present) return "existing";
  if (marker.initialized === false && !present) return "new";
  throw new Error(`Demo initialization was interrupted or its database is missing. Nothing was reset. Stop the launcher and preserve/move ${paths.directory} before trying a fresh demo.`);
}

function acquireLock(paths) {
  rejectLink(paths.lock);
  if (existsSync(paths.lock)) {
    const lock = readJson(paths.lock);
    if (!Number.isSafeInteger(lock.pid) || lock.pid < 1) throw new Error("Invalid demo launcher lock; preserve the demo folder and use a fresh app copy.");
    let active = true;
    try { process.kill(lock.pid, 0); }
    catch (error) { if (error.code === "ESRCH") active = false; }
    if (active) throw new Error(`Another demo launcher may be running (PID ${lock.pid}). Stop it before starting another; no process was killed.`);
    rmSync(paths.lock);
  }
  writeFileSync(paths.lock, JSON.stringify({ pid: process.pid, owner: OWNER }), { flag: "wx" });
}

export function demoEnvironment(parent, directory, port) {
  // An allowlist prevents inherited cloud secrets, NODE_OPTIONS and app overrides.
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|LANG|LC_ALL|TERM|COLORTERM|DISPLAY|WAYLAND_DISPLAY|XDG_RUNTIME_DIR|DBUS_SESSION_BUS_ADDRESS)$/i;
  const env = Object.fromEntries(Object.entries(parent).filter(([key, value]) => allowed.test(key) && value !== undefined));
  return {
    ...env,
    NODE_ENV: "development", AUTH_MODE: "dev", AI_PROVIDER: "mock",
    DATABASE_URL: `file:${path.join(directory, "demo.db")}`,
    APP_URL: `http://127.0.0.1:${port}`,
    NEXT_TELEMETRY_DISABLED: "1", CHECKPOINT_DISABLE: "1", DO_NOT_TRACK: "1",
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    TEMP: path.join(directory, "scratch"), TMP: path.join(directory, "scratch"), TMPDIR: path.join(directory, "scratch"),
    npm_config_cache: path.join(directory, "npm-cache"),
    npm_config_userconfig: path.join(directory, "empty.npmrc"),
    npm_config_globalconfig: path.join(directory, "empty-global.npmrc"),
  };
}

export function installEnvironment(parent, directory, port) {
  const env = demoEnvironment(parent, directory, port);
  delete env.npm_config_userconfig;
  delete env.npm_config_globalconfig;
  delete env.npm_config_cache;
  // Let npm use the user's approved registry, authentication, proxy and CA
  // configuration. These settings are not copied to the Next runtime.
  const network = /^(npm_config_|NPM_TOKEN$|NODE_AUTH_TOKEN$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|NODE_EXTRA_CA_CERTS$|NODE_USE_SYSTEM_CA$|NODE_USE_ENV_PROXY$|SSL_CERT_FILE$|SSL_CERT_DIR$)/i;
  for (const [key, value] of Object.entries(parent)) {
    if (network.test(key) && value !== undefined) env[key] = value;
  }
  env.PRISMA_SKIP_POSTINSTALL_GENERATE = "1";
  return env;
}

function copyTree(source, destination) {
  rejectLink(source);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Cannot copy linked runtime source ${entry.name}. Use a normal extracted app release.`);
    if (/^\.env(?:\.|$)/.test(entry.name) || /\.db(?:-|$)/.test(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

export function createRuntime(root, directory, token = randomUUID()) {
  const runtime = path.join(directory, `run-${randomUUID()}`);
  mkdirSync(runtime);
  try {
    populateRuntime(root, runtime, token);
    return runtime;
  } catch (error) {
    rmSync(runtime, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    throw error;
  }
}

function populateRuntime(root, runtime, token) {
  for (const name of ["src", "methodology", "prompts"]) copyTree(path.join(root, name), path.join(runtime, name));
  if (existsSync(path.join(root, "public"))) copyTree(path.join(root, "public"), path.join(runtime, "public"));
  mkdirSync(path.join(runtime, "prisma"));
  for (const name of ["schema.prisma", "seed.ts"]) copyFileSync(path.join(root, "prisma", name), path.join(runtime, "prisma", name));
  copyFileSync(path.join(root, "package.json"), path.join(runtime, "package.json"));
  writeFileSync(path.join(runtime, ".gitignore"), "node_modules/\n.next-demo/\n");
  // The snapshot has its own linked dependencies/build output; never ask
  // Tailwind to recursively discover candidates outside the copied source.
  writeFileSync(path.join(runtime, "postcss.config.mjs"), [
    `export default { plugins: { "@tailwindcss/postcss": { base: ${JSON.stringify(path.join(runtime, "src"))} } } };`,
  ].join("\n"));
  const tsconfig = readJson(path.join(root, "tsconfig.json"));
  tsconfig.include = ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next-demo/types/**/*.ts", ".next-demo/dev/types/**/*.ts"];
  tsconfig.exclude = ["node_modules"];
  writeFileSync(path.join(runtime, "tsconfig.demo.json"), JSON.stringify(tsconfig, null, 2));
  writeFileSync(path.join(runtime, "next.config.mjs"), [
    "export default {",
    "  devIndicators: false,",
    `  distDir: ".next-demo", outputFileTracingRoot: ${JSON.stringify(root)},`,
    `  turbopack: { root: ${JSON.stringify(root)} },`,
    '  typescript: { tsconfigPath: "tsconfig.demo.json" },',
    "};",
  ].join("\n"));
  const healthRoute = path.join(runtime, "src", "app", "api", "local-demo-health");
  mkdirSync(healthRoute, { recursive: true });
  writeFileSync(path.join(healthRoute, "route.ts"), [
    'export const dynamic = "force-dynamic";',
    `export function GET() { return Response.json({ token: ${JSON.stringify(token)} }, { headers: { "Cache-Control": "no-store" } }); }`,
  ].join("\n"));
  writeFileSync(path.join(runtime, "prisma.config.ts"), [
    'import { defineConfig } from "prisma/config";',
    'export default defineConfig({ schema: "prisma/schema.prisma", datasource: { url: process.env.DATABASE_URL } });',
  ].join("\n"));
  symlinkSync(path.join(root, "node_modules"), path.join(runtime, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}

function findNpmCli(parent) {
  const directories = [
    path.dirname(process.execPath),
    ...(parent.PATH ?? parent.Path ?? "").split(path.delimiter),
  ];
  const candidates = directories.flatMap((directory) => [
    path.join(directory, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(directory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(directory, "npm"),
  ]);
  if (parent.npm_execpath) candidates.unshift(parent.npm_execpath);
  for (const candidate of candidates) {
    if (existsSync(candidate) && path.basename(realpathSync(candidate)) === "npm-cli.js") return realpathSync(candidate);
  }
  throw new Error("npm was not found alongside Node.js. Install the standard Node.js 24 LTS package (including npm), reopen the terminal and retry.");
}

export async function waitForHealthy(url, token, { timeout = 180_000, signal } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const health = await fetch(`${url}/api/local-demo-health`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
      if (health.ok && (await health.json()).token === token) {
        const page = await fetch(`${url}/`, { signal: AbortSignal.timeout(60_000), redirect: "follow" });
        if (page.ok && new URL(page.url).origin === url && (await page.text()).includes("Development sign-in")) return;
      }
    } catch { /* Initial compilation can take time; never open an unrelated server. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The demo did not become healthy at ${url}. Read the error above; no browser was opened.`);
}

async function openBrowser(url, env) {
  const command = process.platform === "win32" ? (env.ComSpec ?? env.COMSPEC ?? "cmd.exe")
    : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/d", "/s", "/c", `start "" "${url}"`] : [url];
  await new Promise((resolve, reject) => {
    const opener = spawn(command, args, { env, stdio: "ignore", windowsHide: true });
    opener.once("error", reject);
    opener.once("exit", (code) => code === 0 ? resolve() : reject(new Error("No default browser opener is available.")));
  });
}

export async function main(args = process.argv.slice(2), root = ROOT) {
  const options = parseArgs(args);
  if (options.help) { console.log(HELP); return; }
  const major = assertNodeVersion();
  const manifest = readJson(path.join(root, "package.json"));
  const lock = readJson(path.join(root, "package-lock.json"));
  validateLockfile(manifest, lock);
  const dependencies = dependencyStatus(root, manifest, lock);
  if (dependencies === "missing") validatePublicDownloads(lock);
  if (options.check) {
    console.log(`Node ${process.versions.node}; release manifest/lock match; dependencies ${dependencies}.\nDemo database: ${demoPaths(root).database}\nNo files changed. Run without --check to start.`);
    return;
  }
  if (major !== 24) console.warn("Node 24 LTS is recommended, especially for the SQLite native dependency.");

  let child;
  let runtime;
  let paths;
  let locked = false;
  let stopping = false;
  const abort = new AbortController();
  const sockets = new Set();
  const token = randomUUID();
  const server = createServer((_request, response) => {
    response.writeHead(503);
    response.end("Local demo setup in progress.");
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    server.once("error", (error) => reject(new Error(error.code === "EADDRINUSE"
      ? `Port ${options.port} is already in use. Stop the other app or run with --port ${options.port === 65535 ? 3000 : options.port + 1}. No existing server was used.`
      : `Cannot bind to 127.0.0.1:${options.port}: ${error.message}`)));
    server.listen(options.port, "127.0.0.1", resolve);
  });

  const parent = { ...process.env };
  let termination;
  const stopChild = (signal = "SIGTERM") => {
    if (termination) return termination;
    const current = child;
    if (!current?.pid || current.exitCode !== null || current.signalCode !== null) return Promise.resolve();
    termination = new Promise((resolve) => {
      current.once("exit", resolve);
      if (process.platform === "win32") {
        // Windows signals do not reliably reach Next's server subprocess.
        // Terminate only the foreground tree that this launcher created.
        const killer = spawn("taskkill.exe", ["/PID", String(current.pid), "/T", "/F"], {
          stdio: "ignore", windowsHide: true,
        });
        killer.once("error", () => { current.kill(signal); });
      } else current.kill(signal);
      const timer = setTimeout(() => { current.kill("SIGKILL"); resolve(); }, 8_000);
      timer.unref();
      current.once("exit", () => clearTimeout(timer));
    });
    return termination;
  };
  const onSignal = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping the local demo. Saved demo data will be kept.");
    abort.abort(new Error("Demo stopped."));
    void stopChild(signal);
  };
  const onInterrupt = () => onSignal("SIGINT");
  const onTerminate = () => onSignal("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    paths = prepareDemoDirectory(root);
    acquireLock(paths);
    locked = true;
    const state = databaseState(paths);
    const env = demoEnvironment(parent, paths.directory, options.port);
    mkdirSync(env.TEMP, { recursive: true });
    for (const file of [env.npm_config_userconfig, env.npm_config_globalconfig]) {
      rejectLink(file);
      writeFileSync(file, "# Demo only: no registry credentials.\n");
    }
    const run = (commandArgs, cwd, accepted = [0], childEnvironment = env) => new Promise((resolve, reject) => {
      abort.signal.throwIfAborted();
      child = spawn(process.execPath, commandArgs, { cwd, env: childEnvironment, stdio: "inherit", windowsHide: true });
      child.once("error", reject);
      child.once("exit", (code) => {
        child = undefined;
        if (accepted.includes(code)) resolve(code);
        else reject(new Error(`Setup command failed (exit ${code ?? "signal"}). Your existing data and lockfile were not reset. Review the error above; see docs/local-demo-setup.md.`));
      });
    });
    console.log("Starting an isolated local demo: synthetic data, mock AI, loopback only.");
    if (dependencies === "missing") {
      console.log("First run: installing the release's public npm dependencies. This needs internet access.");
      await run([findNpmCli(parent), "ci", "--include=dev", "--no-audit", "--no-fund"], root, [0],
        installEnvironment(parent, paths.directory, options.port));
      dependencyStatus(root, manifest, lock);
    } else console.log("Using existing matching dependencies; npm ci is not needed.");
    runtime = createRuntime(root, paths.directory, token);
    const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
    const config = path.join(runtime, "prisma.config.ts");
    if (state === "existing") {
      console.log("Checking existing demo schema without changing it...");
      const code = await run([prismaCli, "migrate", "diff", "--from-config-datasource", "--to-schema",
        path.join(runtime, "prisma", "schema.prisma"), "--exit-code", "--config", config], runtime, [0, 2]);
      if (code === 2) throw new Error(`The saved demo schema differs from this release. Automatic migration/reset is refused. Stop the app and preserve/move ${paths.directory}, then start a fresh demo. See docs/local-demo-setup.md.`);
    }
    await run([prismaCli, "generate", "--config", config], runtime);
    if (state === "new") {
      // Exclusive creation is the proof that db push can only target our new database.
      writeFileSync(paths.database, "", { flag: "wx" });
      await run([prismaCli, "db", "push", "--config", config], runtime);
      await run([path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
        "--tsconfig", path.join(runtime, "tsconfig.demo.json"), path.join(runtime, "prisma", "seed.ts")], runtime);
      writeFileSync(paths.marker, JSON.stringify({ owner: OWNER, initialized: true }));
    } else console.log("Keeping the existing demo records. No seed, schema push or reset was run.");
    abort.signal.throwIfAborted();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    child = spawn(process.execPath, [
      path.join(root, "node_modules", "next", "dist", "bin", "next"),
      "dev", "--turbopack", "--hostname", "127.0.0.1", "--port", String(options.port),
    ], { cwd: runtime, env, stdio: "inherit", windowsHide: true });
    const exited = new Promise((resolve, reject) => {
      child.once("error", (error) => { abort.abort(error); reject(error); });
      child.once("exit", (code) => {
        if (!stopping) abort.abort(new Error(`Next development server exited (${code ?? "signal"}). Check the launcher console; the requested port was not replaced.`));
        resolve(code);
      });
    });
    // Observe early startup failures while health polling is in flight.
    void exited.catch(() => undefined);
    const url = `http://127.0.0.1:${options.port}`;
    await waitForHealthy(url, token, { signal: abort.signal });
    console.log(`\nDemo ready: ${url}/\nSynthetic data: ${paths.database}\nKeep this window open. Press Ctrl+C to stop. Do not enter customer data.`);
    if (options.open) {
      try { await openBrowser(`${url}/`, env); }
      catch { console.warn(`Could not open a browser automatically. Open ${url}/ yourself.`); }
    }
    const code = await exited;
    if (!stopping && code !== 0) throw new Error(`Next development server exited with code ${code}.`);
  } catch (error) {
    if (!stopping) throw error;
  } finally {
    await stopChild();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    try {
      if (runtime) rmSync(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      if (locked) rmSync(paths.lock, { force: true });
    } catch {
      console.warn("A demo runtime file is still in use. Saved data is intact; stale launcher locks recover on the next start.");
    }
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0)).catch((error) => {
    console.error(`\nDemo could not start: ${error.message}`);
    process.exit(1);
  });
}
