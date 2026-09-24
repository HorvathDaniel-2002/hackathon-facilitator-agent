# Hackathon Facilitator for Windows

**Created by Daniel Horvath** · [dahorvath@microsoft.com](mailto:dahorvath@microsoft.com)

An installable, single-user desktop preview with its own window and notification-area
icon. It bundles the browser shell, Node.js runtime and local app: **users do not
need to install Node.js, npm, VS Code or GitHub Copilot**.

## Install and open

1. Download the Windows installer that matches your device: **x64** for Intel/AMD
   PCs, **ARM64** for Windows on Arm. Check **Settings > System > About > System type**
   if unsure.
2. Run `Hackathon-Facilitator-Setup-0.3.0-<architecture>.exe`. It installs for your
   current Windows account without requesting administrator access.
3. Keep **Run Hackathon Facilitator** selected at the end of setup.
4. Open it later from the **Start menu** or the desktop shortcut.

This first preview is **unsigned**. Windows SmartScreen or organizational
application-control policy may block it. Do not disable those protections.
Ask IT to review/sign/approve the package, or use the existing browser demo or
Word/PowerPoint materials while approval is pending. A checksum verifies a
download against the supplied hash; it does not replace a trusted publisher signature.

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
