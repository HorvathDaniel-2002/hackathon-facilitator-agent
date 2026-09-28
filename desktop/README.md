# Hackathon Facilitator for Windows

**Created by Daniel Horvath** · [dahorvath@microsoft.com](mailto:dahorvath@microsoft.com)

The original full app in an installable, single-user desktop preview with its own window and notification-area
icon. It bundles the browser shell, Node.js runtime and local app: **users do not
need to install Node.js, npm, VS Code or GitHub Copilot**.

**Optional reduced companion, not a replacement for the full app:** the
[no-install Browser Edition](https://horvathdaniel-2002.github.io/hackathon-facilitator-agent/)
has only Kanban, handoffs, compact readiness and exports; it stores data separately
in your browser and does not import your desktop database. [Scope and backups](../browser/README.md).

## Microsoft Store route (in preparation)

[MSIX packaging and onboarding guide](store/README.md) is available for a future
Microsoft Store release. No Store account/product identity has been supplied;
there is no Store download yet. Store MSIX submission does not require buying
a CA-trusted signing certificate: Microsoft re-signs after certification.
The EXE preview below remains unsigned and unchanged.

Store packaging uses a separate data profile, and uninstall/reset can remove
that profile. The EXE data-retention instructions below apply only to NSIS.

## Install and open — one EXE, no setup wizard

1. [Download **Hackathon-Facilitator-Setup-0.3.2.exe**](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.2/Hackathon-Facilitator-Setup-0.3.2.exe).
2. Open the downloaded EXE. It selects x64/ARM64, installs for your Windows account
   and **opens the full app automatically**. No Next/Finish pages, destination
   choice, admin request or separate dependency installation.
3. Open it later from **Start > Hackathon Facilitator** or the desktop shortcut.

The single download includes both native architectures and all app dependencies,
so it is larger than the old architecture-specific EXEs. It is not a web installer:
setup does not download Node.js or app packages. No Copilot subscription or
Azure account is needed. Windows 32-bit, macOS and Linux are not supported by this EXE.

**Updating from v0.3.1:** save your work and choose **Quit** from the tray first,
then open the new installer. It reuses the existing installation location and
compatible data profile. A fresh installation uses
`%LOCALAPPDATA%\Programs\hackathon-facilitator-desktop`.
The app's user-data folder is unchanged. Do not uninstall or delete your database
just to upgrade. Browser Edition data remains separate.

This first preview is **unsigned**. Windows SmartScreen or organizational
application-control policy may block it. Do not disable those protections.
Ask IT to review/sign/approve the package, or use the existing browser demo or
Word/PowerPoint materials while approval is pending. A checksum verifies a
download against the supplied hash; it does not replace a trusted publisher signature.

The [trusted-signing workflow and administrator handoff](signing/README.md) are
prepared but **not enabled**. The public release remains unsigned until the
approved publisher identity, Public Trust profile, role and protected GitHub
environment are configured. Even a valid signature does not guarantee immediate
SmartScreen reputation. No warning-bypass or private-key export is required.

For a publisher signing as a **Hungarian private individual**, the
[personal CA certificate route](signing/individual-signing.md) documents the
official product/identity checks and local SignTool integration. It does not
require corporate signing access, but certificate issuance and any purchase
still require the applicant's confirmation.

**Use v0.3.1 or later on ARM64.** End-to-end testing found that the v0.3.0
NSIS/7z path could omit ARM64 executable files during installation. The patch
uses compatible ZIP payloads. Do not delete saved workspace data to repair a
missing program executable.

## Window, tray and taskbar

- **Close (X)** hides the window and leaves the app in the Windows notification area.
- Double-click its notification-area icon, or choose **Open**, to restore it.
- Choose **Quit** from that icon's menu to stop the app and its local backend.
- Starting the app again restores the existing instance; it does not start a second
  database/server.
- To pin it, right-click the running taskbar icon and choose **Pin to taskbar**,
  or use **Start > All apps > Hackathon Facilitator > More > Pin to taskbar**
  where supported. Windows and your organization's policies control this action;
  the installer does not force pins.
- There is no automatic startup at Windows sign-in. An IT-managed startup/pinning
  policy can be considered separately.

## Data and updates

The first launch creates a **fictional Contoso sample workspace**. This is not your
existing web-app/customer database. Data is kept in:

```text
%APPDATA%\Hackathon Facilitator\data\
```

The tray menu's **Open data folder** opens that exact location. Back up
`workspace.db` and `workspace.schema.json` together while the app is fully quit.
The directory is private local application data, not a sharing/export location.

Reinstalling/updating the executable does not overwrite the workspace. Compatible
versions reuse it. An incompatible schema or missing schema marker produces an
explicit error rather than resetting data. Uninstalling leaves your data in place;
delete it separately only if you intentionally want to discard it.

This is a **local desktop session, not Microsoft Entra SSO**. It uses a fresh
per-launch capability for a loopback-only backend, an isolated browser session,
and a sandboxed renderer. The current preview uses **mock AI**; do not treat its
scores as real model evaluations. Corporate/customer-data approval, identity,
sharing and production operations remain separate requirements.

Exports require a Save dialog. External documentation opens in your normal browser.
No cloud service, CAF submission or deployment is performed automatically.

## Build from source

Build each Windows architecture on a matching Windows machine with **official,
signed Node.js 24** installed. Runtime/native SQLite files are built together for
that architecture; do not mix an x64 backend into an ARM64 application.

From this `desktop` folder:

```text
npm ci
npm test
npm run prepare:app
npm run dist -- --arm64
```

Use `--x64` on an x64 build machine. `prepare:app` creates an isolated app build,
synthetic template, standalone server, signed Node binary and license notices.
The output `payload` and `dist` folders are generated artifacts, not source.
The NSIS installer is under `dist`.

`npm run pack -- --arm64` creates an unpacked app for local verification without
installing shortcuts. After a successful build, remove only the generated
`payload` directory before rebuilding; never point the packager at real customer data.

The build is deliberately configured with Windows signing disabled for this
unsigned preview. Production distribution requires an approved signing workflow
and organizational review. Signing keys, tokens and private certificates must
never be committed.

`npm run signing:check` validates the required signing configuration without
signing or provisioning anything. The separate manual **Prepare trusted-signed
Windows candidate** workflow signs and verifies all owned executables, then runs
the real installer lifecycle on both architectures. It does not automatically
publish, and it fails instead of falling back to an unsigned build.

## Repeatable installer validation

The primary workflow now builds both native payloads, packages them into one EXE,
then tests that **same file** on native x64 and ARM64 runners. It runs without
installer arguments or UI clicks, confirms the automatically opened window and
bundled loopback backend, then exercises the full app. Separate scenarios verify
a fresh default install and upgrade over the actual published v0.3.1 installation,
including a custom old installation directory.

`scripts/verify-oneclick.ps1` is restricted to disposable Windows CI. It also
verifies architecture selection, original Node signature, shortcuts, registration,
reinstall and data-preserving uninstall. Its initial auto-launched test instance
is stopped by exact owned PIDs; normal graceful Quit is checked separately in the
existing full app workflow. SmartScreen/enterprise approval is not bypassed.

`scripts/verify-installer.ps1` and `scripts/e2e-installed.cjs` are restricted to
disposable Windows GitHub Actions runners. They test the real installer,
shortcuts, per-user registration, installed app workflows, bundled runtime,
tray behavior, same-version reinstall and data-preserving uninstall.
They refuse to run against an existing local user's profile.

`npm run dist:universal` requires clean `payload-x64` and `payload-arm64`
directories produced by `prepare:app` on the matching native machines. The
`Build one-click Windows desktop` workflow assembles these and retains a verified
candidate only after all four native fresh/upgrade scenarios pass.
`Test published desktop installers` repeats the check from a named public release.
For old releases, disable its `universal` option to use the earlier per-architecture
installer check. Interactive SmartScreen decisions and native save/print dialog
interaction remain separate manual/policy checks. There is no Finish checkbox
in the new one-click installer.
