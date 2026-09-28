import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

export const FILES = ["index.html", "styles.css", "theme.js", "startup.js", "app.mjs", "model.mjs", "storage.mjs", "icon.png"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function build(output) {
  const target = path.resolve(output);
  if (fs.existsSync(target)) throw new Error("Choose a new site output folder.");
  const prepared = FILES.map(name => {
    const file = path.join(root, name);
    if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error(`Invalid public asset: ${name}`);
    return { name, content: fs.readFileSync(file) };
  });
  fs.mkdirSync(target, { recursive: true });
  for (const file of prepared) fs.writeFileSync(path.join(target, file.name), file.content, { flag: "wx" });
  fs.writeFileSync(path.join(target, ".nojekyll"), "", { flag: "wx" });
  return prepared.map(({ name, content }) => ({ name, sha256: createHash("sha256").update(content).digest("hex") }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node browser/tools/build.mjs <new output directory>");
  console.log(JSON.stringify({ files: build(process.argv[2]) }, null, 2));
}
