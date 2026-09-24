# Hackathon Facilitator web app

**Created by Daniel Horvath** · [dahorvath@microsoft.com](mailto:dahorvath@microsoft.com)

Kanban-first local workspace for AI hackathon use cases, with a blue interface,
selectable Dashboard, readiness evidence and a shared handoff panel/overview.

## Start the synthetic demo

Install **Node.js 24**, then double-click `Start-Hackathon.cmd` on Windows,
or run from this folder:

```text
npm run demo
```

The launcher prepares a separate synthetic sample database and opens the board
in your browser. It keeps authentication local and AI in mock mode. Keep the
terminal open; Ctrl+C stops the server. No Copilot subscription or Azure API key
is required. First use needs internet to download npm packages.

[Full setup and troubleshooting](docs/local-demo-setup.md).
Do not expose development authentication beyond localhost or put real customer
data in a demo installation.

## Workflow

- **Progress:** Intake, Assessing, Building, Pilot, In production, Parked.
- **Delivery route:** Unassigned, Copilot / Cowork, Copilot Studio, Custom build, CAF.
- Grouping changes the view, not the record. Drag or use accessible controls to
  move cards. Open a card for its shared handoff.
- In production and Submitted to CAF need a named owner and evidence/reference.
  The app records activity completed elsewhere; it never deploys or submits.
- Evaluation/qualification history remains separate from reported operational
  progress. Mock scores are not validated portfolio recommendations.
- Settings manage workspace identity, membership and lifecycle. Standalone Charter
  and Milestones were removed; each handoff still has a next action and date.

[Kanban semantics and existing-database migration](docs/kanban-workflow.md).
[Microsoft source grounding and its limits](docs/microsoft-grounding.md).

## Developer commands

```text
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

Browser tests use a new isolated SQLite database and loopback port 3101:

```text
npx playwright install chromium
npm run test:e2e
```

On Windows the test configuration uses installed Edge when available. Otherwise
set the documented Playwright browser path/channel for your test environment.
Tests must not point at an existing user database.

For a separately configured local development workspace, copy `.env.sample`
without overwriting existing settings and explicitly choose a database. Never run
`npm run setup` or schema reset on existing data without reviewed consent.
The demo launcher is safer for first-time users because it isolates its data.

## Limitations

This is **not an official Microsoft product, corporate deployment or hosted service**.
Real Microsoft Entra SSO is not implemented and fails closed. Production hosting,
PostgreSQL migration/operations, live-model quality and organizational approvals
remain separate work. Public references and a completed checklist are not corporate
approval or licensing entitlement.

The published lockfile uses public npm tarball URLs with pinned versions and
integrity hashes. Proxy policy, native SQLite availability and system prerequisites
still affect setup. Do not disable security controls to install.

No customer database, credentials, internal documents or original local git history
are included. Keep completed plans and evidence out of public commits and issues.
The parent repository contains the optional Copilot agent and no-install Word,
PowerPoint and PDF materials.
