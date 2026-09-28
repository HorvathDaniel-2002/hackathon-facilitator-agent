# Browser Edition: open the link and start

**This is a reduced companion, not the original full app.**
For the complete experience, use the
[one-click Windows installer](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.2/Hackathon-Facilitator-Setup-0.3.2.exe).
It includes the runtime, selects x64/ARM64 automatically and opens after setup.
Its data is separate from this browser workspace.

**[Open Hackathon Facilitator](https://horvathdaniel-2002.github.io/hackathon-facilitator-agent/)**

No installer, Node.js, GitHub/Copilot account, Azure key, subscription or admin
rights are needed. Open the link in a current desktop or mobile browser with
JavaScript and site storage enabled. Bookmark it for next time.

## Getting started

1. Choose **Create empty workspace**, or **Try fictional sample** to explore.
2. Select **New use case** and fill in the title, owner and next action.
3. Open a card to change progress/delivery route and edit its shared handoff.
   Desktop users can also drag cards between lanes. All moves are available
   through the card form for keyboard and touch users.
4. Select **Backup** regularly. Save the JSON file outside your browser.

Progress columns are Intake, Assessing, Building, Pilot, In production and Parked.
Delivery routes are independent: Unassigned, Copilot / Cowork, Copilot Studio,
Custom build and CAF. In production and Submitted to CAF require a business owner
and a corresponding reference. Recording a status does not perform a submission
or deployment.

The Handoffs overview edits the same records as the cards. Dashboard is optional;
Kanban is home. The compact six-item readiness checklist requires review owner,
date and evidence before an item can be marked complete.

## Local storage, backups and privacy

- Records stay in **IndexedDB in this browser profile**, under this Pages origin.
  There is no server database, login, collaboration or cross-device sync.
- Clearing site data, private browsing, device loss or browser storage cleanup
  can erase your workspace. This is not a durable enterprise backup service.
- **Data & help > Download JSON backup** creates a full Browser Edition backup.
  On another device, use **Restore a Browser Edition backup**. Nothing is uploaded.
  Import replaces the current local workspace only after confirmation.
- **CSV** is a report, not a restorable backup. Browser backups do not import
  desktop SQLite databases or the full app's export formats.
- Concurrent writes from two tabs are checked transactionally. A stale save is
  rejected with the draft left open. Download the unsaved draft, then select
  **Reload saved**. Review differences before manually applying them.
- Saving failures are shown explicitly. Do not close an unsaved form without
  downloading a valid draft. Invalid records cannot be exported as valid backups.
- GitHub Pages receives normal web request metadata when serving the site.
  The app includes no analytics, external scripts/fonts, live AI, workspace upload
  or background sync. External GitHub/mail links open only on user selection.
- Browser storage is **not encrypted by this app** and is not a user-access
  boundary. Scripts on the same `horvathdaniel-2002.github.io` origin can
  potentially access its databases. Use approved, non-sensitive information,
  never secrets, regulated information or confidential customer data.

The loaded page can edit locally without network requests, but opening/reloading
the site requires connectivity or a browser-cached copy. This is not an installed
offline PWA; no service worker is registered. Network and browser policies can
still block access. Do not disable organizational protections.

## Scope

This is a lightweight browser companion, not a replacement for every feature of
the [full toolkit](../README.md). It includes Kanban, use-case editing, shared
handoffs, dashboard counts, readiness notes and JSON/CSV exports. No AI scoring,
build-guide generation, Entra SSO, audit history, team permissions, server
integrations or desktop-data migration is claimed.

One workspace per browser profile, up to 250 cases and a 2 MB JSON backup.
Download a backup before using **Start a new empty workspace**.

Created by **Daniel Horvath** · dahorvath@microsoft.com.
Experimental local MVP; not an official Microsoft product or corporate approval.
The [Word/PowerPoint materials](../materials/README.md) remain available.

## Developer validation and deployment

The runtime is dependency-free HTML/CSS/JavaScript; users install nothing.

```powershell
node --test browser\tests\model.test.mjs
node browser\tools\serve.mjs
```

The server prints a loopback URL with the same project subpath as GitHub Pages.
It serves only the reviewed static assets, never the repository or a database.

The `Publish no-install browser app` workflow uses the existing locked Playwright
test driver to exercise Chromium and Firefox, then publishes only the eight
allowlisted files plus `.nojekyll`. The Next.js server, desktop payloads, source
tests and local databases cannot enter the Pages artifact through this builder.
No paid cloud resource or new signing identity is needed.

Validation covers domain/backup rules and 18 browser workflows, including
reload persistence, production/CAF gates, shared handoffs, JSON restore, CSV,
multi-tab conflicts, failed writes, untrusted text, keyboard cancellation,
320–1920 px layouts, dark mode, profile isolation and unavailable/corrupt storage.
Both Chromium and Firefox run these checks before deployment. This is not a claim
of corporate certification, long-term storage durability or Safari-specific testing.

**28 September 2026:** [deployment and browser checks passed](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36469388566).
The same 18 workflows were also repeated successfully against the public HTTPS
site in both browsers, using disposable profiles and fictional data only.
