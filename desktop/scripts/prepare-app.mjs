import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parent = path.dirname(desktop);
const source = fs.existsSync(path.join(parent, "app", "prisma", "schema.prisma")) ? path.join(parent, "app") : parent;
const buildRoot = path.join(desktop, ".build", randomUUID());
const payload = path.join(buildRoot, "payload");
const publishedPayload = path.join(desktop, "payload");
const appRoot = path.join(buildRoot, "app");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function run(file, args, cwd, env = process.env) {
  const result = spawnSync(file, args, { cwd, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed with exit ${result.status}.`);
}
function copy(source, target, ancestors = new Set()) {
  const resolved = fs.realpathSync(source);
  const stat = fs.statSync(source);
  if (fs.lstatSync(source).isSymbolicLink()) {
    const relative = path.relative(buildRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Payload link escapes its isolated build: ${source}`);
  }
  if (stat.isDirectory()) {
    if (ancestors.has(resolved)) throw new Error(`Circular payload link: ${source}`);
    const next = new Set(ancestors).add(resolved);
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(target, name), next);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      if (!fs.readFileSync(source).equals(fs.readFileSync(target))) throw new Error(`Conflicting payload file: ${target}`);
      return;
    }
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  }
}
async function prepare() {
  if (process.platform !== "win32" || !["x64", "arm64"].includes(process.arch) ||
      Number(process.versions.node.split(".")[0]) !== 24) {
    throw new Error("Build on Windows x64 or ARM64 with the matching official Node.js 24 runtime.");
  }
  if (fs.existsSync(publishedPayload)) throw new Error("payload already exists. Preserve needed artifacts, then remove only this generated payload before rebuilding.");
  const signatureCommand = `$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath '${process.execPath.replaceAll("'", "''")}'; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'OpenJS Foundation'){exit 1}`;
  const signed = ["pwsh.exe", "powershell.exe"].some(shell =>
    spawnSync(shell, ["-NoProfile", "-Command", signatureCommand], { windowsHide: true, encoding: "utf8" }).status === 0);
  if (!signed) throw new Error("The bundled Node runtime must have a valid OpenJS Foundation Authenticode signature.");
  const packageScript = path.join(source, "scripts", "package-public-app.mjs");
  const { packagePublicApp } = await import(pathToFileURL(packageScript).href);
  packagePublicApp(source, appRoot);
  const env = {
    ...process.env, AI_PROVIDER: "mock", AUTH_MODE: "dev",
    DATABASE_URL: `file:${path.join(buildRoot, "template.db")}`,
    NEXT_TELEMETRY_DISABLED: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1",
    HF_DESKTOP_BUILD: "1", HF_NEXT_DIST_DIR: ".next-desktop", HF_TEST_DIST_DIR: ".next-desktop",
    HF_TEST_TSCONFIG: "tsconfig.json", NODE_ENV: "development",
  };
  const npm = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!fs.existsSync(npm)) throw new Error("Install Node.js with npm before building.");
  run(process.execPath, [npm, "ci", "--include=dev", "--no-audit", "--no-fund"], appRoot, env);
  const prisma = path.join(appRoot, "node_modules", "prisma", "build", "index.js");
  run(process.execPath, [prisma, "generate"], appRoot, env);
  run(process.execPath, [prisma, "db", "push"], appRoot, env);
  run(process.execPath, ["--import", "tsx", path.join(appRoot, "prisma", "seed.ts")], appRoot, env);
  run(process.execPath, [path.join(appRoot, "node_modules", "next", "dist", "bin", "next"), "build"], appRoot,
    { ...env, NODE_ENV: "production", AUTH_MODE: "desktop-local" });
  const standalone = path.join(appRoot, ".next-desktop", "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Next standalone server was not emitted at the expected location.");
  copy(standalone, path.join(payload, "server"));
  copy(path.join(appRoot, ".next-desktop", "static"), path.join(payload, "server", ".next-desktop", "static"));
  for (const name of ["methodology", "prompts"]) {
    const destination = path.join(payload, "server", name);
    copy(path.join(appRoot, name), destination);
  }
  copy(path.join(buildRoot, "template.db"), path.join(payload, "template.db"));
  copy(process.execPath, path.join(payload, "node", "node.exe"));
  const licenseUrl = `https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`;
  const response = await fetch(licenseUrl);
  if (!response.ok) throw new Error(`Unable to obtain the matching Node redistribution license: ${response.status}`);
  const license = await response.text();
  if (!license.includes("Permission is hereby granted")) throw new Error("Unexpected Node license document.");
  fs.writeFileSync(path.join(payload, "node", "LICENSE.txt"), license);
  const lock = JSON.parse(fs.readFileSync(path.join(appRoot, "package-lock.json")));
  const notices = Object.entries(lock.packages).filter(([key]) => key).map(([name, pkg]) =>
    `${name.replace(/^node_modules\//, "")} ${pkg.version} | ${pkg.license ?? "See package license"} | https://www.npmjs.com/package/${name.split("node_modules/").at(-1)}`);
  fs.mkdirSync(path.join(payload, "licenses"), { recursive: true });
  fs.writeFileSync(path.join(payload, "licenses", "dependencies.txt"), notices.join("\n") + "\n");
  const modules = path.join(payload, "server", "node_modules");
  const preserveLicenses = directory => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const relative = path.relative(modules, path.join(directory, item.name));
      const original = path.join(appRoot, "node_modules", relative);
      if (item.isDirectory()) {
        if (fs.existsSync(path.join(original, "package.json"))) {
          for (const file of fs.readdirSync(original)) {
            if (/^(licen[cs]e|copying|notice)(?:\.|$)/i.test(file) && fs.statSync(path.join(original, file)).isFile()) {
              const target = path.join(payload, "licenses", relative, file);
              if (!fs.existsSync(target)) copy(path.join(original, file), target);
            }
          }
        }
        preserveLicenses(path.join(directory, item.name));
      }
    }
  };
  preserveLicenses(modules);
  const metadata = {
    schemaHash: hash(fs.readFileSync(path.join(appRoot, "prisma", "schema.prisma"))),
    arch: process.arch, nodeVersion: process.versions.node,
    appVersion: JSON.parse(fs.readFileSync(path.join(desktop, "package.json"))).version,
    templateSha256: hash(fs.readFileSync(path.join(payload, "template.db"))),
    nodeSha256: hash(fs.readFileSync(path.join(payload, "node", "node.exe"))),
    source: "Synthetic desktop template; never copied from a user's application database",
  };
  fs.writeFileSync(path.join(payload, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  fs.renameSync(payload, publishedPayload);
  console.log(JSON.stringify({ payload: publishedPayload, metadata, buildRoot }, null, 2));
}

prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
