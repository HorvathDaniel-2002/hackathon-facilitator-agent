# Full portable local application

**[Download the complete original app](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.2-portable.1/Hackathon-Facilitator-Full-Portable-0.3.2.zip)**

This is the full application shown in the product walkthrough, including Kanban,
use-case intake, contacts, mock evaluation, mock build guides, readiness/runbook,
shared handoffs, dashboard and exports.

## Start

1. Download the ZIP and extract the **complete folder** into a normal writable
   location such as Documents.
2. Open `Start-Hackathon-Facilitator.cmd`.
3. Keep the launcher window open while using the application in the browser.

The same package automatically selects native Windows x64 or ARM64. It includes
the required official Node.js runtime and full app payload. Users do not install
Node.js, npm, Electron, a Store package or a Windows service.

If Windows or organizational policy blocks the downloaded CMD or runtime, stop
and ask the device administrator to review the package. Do not disable or bypass
those protections.

## Stop, restart and backup

- Open `Stop-Hackathon-Facilitator.cmd`, or press **Ctrl+C** in the launcher.
- Data is stored in `%APPDATA%\Hackathon Facilitator Portable\data`.
- `Open-Hackathon-Data-Folder.cmd` opens the profile.
- After stopping the app, `Backup-Hackathon-Workspace.cmd` creates a timestamped
  copy under `%APPDATA%\Hackathon Facilitator Portable\backups`.
- Restarting or replacing the extracted program folder does not reset a
  compatible workspace in the profile.

## Security and scope

- Both the app backend and browser gateway bind to numeric loopback only.
- The browser gateway uses a fresh launch capability and injects the separate
  backend token; anonymous requests are rejected.
- The included Node executables retain their upstream OpenJS Foundation
  Authenticode signatures.
- Inherited cloud credentials and runtime injection settings are removed before
  the backend starts.
- The package contains only fictional starter data and mock AI.

This is an experimental local single-user MVP, not Store-certified software,
Entra SSO, live AI, cloud synchronization or corporate approval. Use approved,
non-sensitive information only.

## Verification

The exact universal ZIP passed the complete original-app workflow, restart/data
preservation and backup creation on native x64 and native ARM64:

[GitHub Actions run 39770207915](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/39770207915)

SHA-256:

```text
d802ccca1b35686aac0610aed965518383d4009ffd7c44daa535d9eb1b59ce56
```
