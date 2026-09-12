# Hackathon Facilitator for GitHub Copilot

A custom Copilot agent for planning customer AI hackathons from charter and
use-case intake to readiness, demos and accountable follow-up.

**Public agent-only preview. Not an official Microsoft product.**

## Try it in VS Code

You need a current VS Code installation with GitHub Copilot enabled and signed in,
Copilot access, and any required organization permission to use custom agents.
Downloading the files does not require repository access approval.

1. [Download the latest agent ZIP](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/latest)
   and extract it. Open the extracted folder containing this README in VS Code.
   Alternatively, clone this public repository.
2. Open **Copilot Chat** and select **hackathon-facilitator** in the agent picker.
   If it is missing, reload the window and check **Chat: Open Customizations**.
   Review the files before granting workspace trust.
3. Paste this starter prompt:

```text
Plan a two-day AI hackathon for a fictional logistics company with three teams.
Start with a charter, one demoable slice per team, a readiness checklist and
dated handoffs. Mark missing decisions as unknown. Use synthetic examples only.
Do not provision, publish, invite or submit anything.
```

Expect a planning draft with explicit unknowns, not a deployment or approval.
The downloaded folder already contains the agent and reference pack: **no installer,
Node.js, Azure key, database or application dependencies are needed for this route.**

## Install into your own workspace

Use this option to keep your plans separate from the public agent repository.
The optional installer requires **Node.js 24** and an existing target folder.
From a downloaded/extracted package, skip the first two commands:

```powershell
git clone https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent.git
Set-Location hackathon-facilitator-agent
node .\scripts\install-copilot-agent.mjs --target "C:\src\my-project"
```

Open the target workspace in VS Code and select the agent. The installer copies
eight files, makes no network calls and refuses to overwrite local customizations.
Reinstalling identical files is safe.

For a personal Copilot CLI profile across workspaces:

```powershell
node .\scripts\install-copilot-agent.mjs --personal
```

In Copilot CLI, use `/agent` and choose `hackathon-facilitator`.
See the [installation guide](docs/copilot-agent-installation.md) for manual copying,
CLI setup, GitHub.com, troubleshooting and uninstall instructions.

**This is not the companion web app.** There is no `package.json`, `npm run dev`,
web server or hosted demo in this package. The agent uses your Copilot host's
selected model; it does not connect Work IQ, configure Azure, enable corporate SSO
or grant data-processing permissions.

## Share and give feedback

Share this repository or the [latest release](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/latest).
No repository invitation is needed. A [copy-ready colleague announcement](docs/colleague-distribution.md)
and a [detailed setup guide](docs/copilot-agent-installation.md) are included.

Report installation problems or missing recommendations in
[GitHub Issues](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/issues),
using synthetic examples only. Issues, commits and forks of this repository are public:
do not post customer data, internal documents, contact details, credentials or raw
prompt logs. Keep real planning artifacts in an appropriately restricted workspace.

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

Official Microsoft hackathon submission remains pending. The
[submission draft](docs/official-hackathon-submission.md) is prepared, but no official
entry has been created or submitted. Public GitHub availability is not Microsoft
corporate approval or competition acceptance.
