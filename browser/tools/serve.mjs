import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILES } from "./build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = "/hackathon-facilitator-agent/";
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".png": "image/png" };
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const file = pathname === base ? "index.html" : pathname.startsWith(base) ? pathname.slice(base.length) : "";
  if (request.method !== "GET" || !FILES.includes(file)) { response.writeHead(404).end("Not found"); return; }
  response.writeHead(200, { "Content-Type": types[path.extname(file)], "Cache-Control": "no-store" });
  fs.createReadStream(path.join(root, file)).pipe(response);
});
server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}${base}`));
