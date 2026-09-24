# Hackathon Facilitator for GitHub Copilot

A custom Copilot agent for planning customer AI hackathons from charter and
use-case intake to readiness, demos and accountable follow-up.

**A public GitHub release is available. Official Microsoft hackathon submission
remains pending; this is not an official Microsoft product.**

Repository: https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

Published ZIP and checksum:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/latest

Locally generated packages are separate build candidates, not automatically
published releases. No repository invitation is needed; permitted Copilot access
is still required.

For the shortest setup, download the latest release ZIP, extract it, open the
folder containing `.github` in VS Code with Copilot enabled, and select
`hackathon-facilitator` in Chat. This route needs no Node.js, Azure key or app dependencies.

## Choose the app or the agent

The public toolkit now also includes the blue Kanban-first web app under `app/`.
Install Node.js 24 and run the root `Start-Hackathon.cmd` on Windows or
`node app/scripts/start-demo.mjs`. The local synthetic app demo needs no Copilot
subscription or Azure key. This lean agent bundle is a separate optional artifact.

Created by Daniel Horvath · dahorvath@microsoft.com.

## Install the optional agent

No-install alternative: use the [Word playbook, PowerPoint workshop or PDFs](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/tree/main/materials)
manually. These downloadable templates need no agent, Copilot or developer tools.
The source packager here still builds the lean agent bundle; the public release
also offers the Office materials separately.

Open this extracted folder in VS Code with GitHub Copilot enabled and select
`hackathon-facilitator` in Chat, or install into another existing workspace:

```powershell
node .\scripts\install-copilot-agent.mjs --target "C:\src\my-project"
```

For a personal profile:

```powershell
node .\scripts\install-copilot-agent.mjs --personal
```

See `docs\copilot-agent-installation.md` for CLI, GitHub.com and organization
deployment instructions.

The profile uses your host's selected Copilot model. It does not install the
companion web app, connect Work IQ, configure Azure, enable corporate SSO or grant
data-processing permissions.

## Included

- GitHub Copilot custom-agent profile.
- Seven public-source/project-methodology YAML references.
- Safe, no-overwrite local installer.
- Installation and colleague-sharing guides.
- Submission-ready Microsoft hackathon draft and demo script.
- Package manifest with SHA-256 hashes.

## Deliberately excluded

Customer workspaces, personal contact information, local databases/backups, keys,
`.env` files, private reports, screenshots, session artifacts, git history,
`node_modules`, generated app files and app runtime code.

Use synthetic examples first. Public Microsoft guidance and agent-generated
plans are not corporate approval. Distribution and reuse remain subject to
applicable ownership and organization permissions; this package does not declare
an open-source license or Microsoft endorsement.
