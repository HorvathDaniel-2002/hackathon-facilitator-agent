# Start the local app

The public repository's **app** folder contains the optional web application.
The Copilot agent and Word/PowerPoint materials can be used without installing it.
This app is a local development demo, not an installed production service or
Microsoft SSO. Use **fictional or synthetic data only**.

## First start

1. Install **Node.js 24 LTS**, including npm, from <https://nodejs.org>.
   Node 24 is recommended; versions older than 24 are refused.
2. Download and **extract the entire release/repository ZIP**, not just the
   launcher. Keep `package.json`, `package-lock.json`, `scripts`, `src`, `prisma`,
   `methodology` and `prompts` together. A short local folder outside OneDrive
   or another synchronized/network folder is recommended.
3. Open the extracted **app** folder:
   - **Windows:** double-click `Start-Hackathon.cmd`.
   - **macOS:** open Terminal in that folder, run
     `chmod +x start-hackathon.command`, then `./start-hackathon.command`.
     Afterwards the `.command` file can be opened in Finder. If macOS blocks a
     downloaded file, use the Terminal command below; do not disable system
     security protections.
   - **Linux:** use the Terminal command below (`xdg-open` is optional).
4. Keep the console open. On first start the launcher downloads dependencies
   using `npm ci`, creates a new synthetic SQLite demo, and compiles the app.
   This can take several minutes. Subsequent starts reuse installed dependencies
   and saved demo records.
5. The browser opens **once**, after this launcher's app is healthy, at
   <http://127.0.0.1:3000/> with the Kanban board as the default view.
   Press **Ctrl+C in the console** to stop.

Direct start on any supported system, from the `app` folder:

```text
node scripts/start-demo.mjs
```

Or use `npm run demo`. On Windows PowerShell you can use
`node .\scripts\start-demo.mjs`. No `.env`, database URL, Azure key or corporate
sign-in is required.

## Options

```text
node scripts/start-demo.mjs --check
node scripts/start-demo.mjs --port 3110 --no-open
npm run demo -- --port 3110
```

`--check` reports Node, manifest/lockfile and installed-dependency status without
installing, creating files, reading `.env` or starting a server. `--no-open`
leaves browser navigation to you. An occupied port produces an explicit error;
the launcher never opens some other app or silently switches ports.

## Isolation and saved work

- The launcher **does not load or modify `.env`** or use inherited
  `DATABASE_URL`, authentication, cloud credentials or model-provider settings.
  It serves an allowlisted copy of runtime source without environment files.
- It always uses `AUTH_MODE=dev`, `AI_PROVIDER=mock`, development mode and the
  loopback address `127.0.0.1`. Mock results are not real model assessments.
  Dependency downloads require internet on first start; the demo makes no cloud
  AI calls. Do not expose it through a tunnel, public interface or proxy.
- The launcher-owned database is **`.artifacts/local-demo/demo.db`** inside
  this app folder. Customer databases elsewhere are never selected or migrated.
- Its ownership marker and single-launch lock prevent adopting unknown data or
  starting competing launchers. Existing demo records are neither reseeded nor
  reset. An existing database receives only a schema comparison before startup.
- Next build output, a copied TypeScript configuration and tool
  scratch files stay under `.artifacts/local-demo`. The runtime source/build
  snapshot is removed on normal shutdown; root `tsconfig.json` and app settings
  are not rewritten. Restart after changing source files.
- Dependency installation honors your existing npm registry, proxy,
  authentication and certificate-trust configuration without printing or copying
  its contents. An approved mirror can serve the public lockfile's exact
  versions/integrities. The launcher does not force the public registry, disable
  TLS checks or overwrite your npm configuration. These installation settings
  and credentials are not passed into the running app. npm manages its normal
  configured download cache.
- Saved demo edits persist on disk. They remain local and are not included in
  the public release. Keep the whole app's `.artifacts` directory private.

## Troubleshooting

| Message or symptom | What to do |
| --- | --- |
| Node not found / too old | Install the official Node 24 LTS package with npm, then reopen the console or launcher. |
| Package manifest/lockfile mismatch | Extract both files from the same release. Do not delete the lockfile or run an unreviewed dependency upgrade. |
| Non-public package download locations | Obtain the sanitized public app release. No Microsoft feed credentials are required. |
| `npm ci` fails | Check internet/proxy permissions and free disk space. Use Node 24 LTS. SQLite native installation may require platform build tools if a prebuilt binary is unavailable; review the npm error. |
| Missing/incompatible installed dependency | In this app folder, run `npm ci --include=dev` using the matching public lockfile, then restart. The launcher never silently replaces an existing installation. |
| Port already in use | Stop the intended conflicting app, or choose `--port 3110`. Do not kill unrelated processes. |
| Another launcher may be running | Stop its console first. Stale locks are recovered only when the recorded PID is no longer alive. |
| Schema differs / initialization interrupted | No migration or reset was performed. Follow the fresh-demo procedure below. |
| Browser does not open | Open the exact URL printed after **Demo ready**. For headless Linux use `--no-open`. |
| Development sign-in unavailable | Clear only this local app's sign-in through its recovery button; if the demo was edited beyond recovery, preserve it and start fresh as below. |

### Start fresh without overwriting saved records

Stop all demo launcher windows first. Preserve the entire
`.artifacts/local-demo` directory by moving it to a new, private backup location.
Do not delete it unless you intentionally want to discard your synthetic edits.
Run the launcher again: it creates a **new** demo directory/database.

Do not copy a customer database into this folder. The launcher is deliberately
not an upgrader for old databases. Existing non-demo application installations
require the separately reviewed migration/recovery process.

Closing a terminal forcibly or shutting down the computer may leave a source
snapshot or lock file. The next launch can recover a lock whose process is gone,
but never resets an interrupted database initialization automatically.
