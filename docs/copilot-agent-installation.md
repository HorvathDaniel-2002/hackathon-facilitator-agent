# Install Hackathon Facilitator in GitHub Copilot

This package is a **custom agent profile**, not a hosted service, a trained model,
a VS Code extension, a Marketplace listing or a Microsoft 365 Copilot agent.
It configures GitHub Copilot's behavior for hackathon planning and reviewed
facilitation. The optional web app is a separate local development MVP.

Public repository:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

Download the agent ZIP and SHA-256 checksum from the
[latest release](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/latest).
No repository invitation or GitHub sign-in is needed to download or clone.
Using Copilot still requires its own sign-in/access and applicable organization policy.
This is not a corporate deployment or an official Microsoft Marketplace listing.

## Prerequisites

- GitHub Copilot access and an organization policy that permits the intended
  Copilot host, selected model, custom agents and data use.
- A current VS Code installation with GitHub Copilot enabled, or GitHub Copilot CLI.
- Permission to use any information supplied to the selected Copilot host/model.
- Node.js 24 only for the optional installer. Opening the extracted folder in
  VS Code or manually copying the profile does not require Node or app dependencies.

The agent uses the model selected in Copilot. You do **not** need an Azure OpenAI
key merely to use the custom agent in Copilot Chat.

## Option A: use it in this repository

1. Download and extract the agent ZIP from the latest release, or clone this
   public repository. Review the files before granting workspace trust.
2. Open that folder in VS Code.
3. Open Copilot Chat and choose **hackathon-facilitator** from the agent picker.
   If it is missing, run **Chat: Open Customizations** and inspect Agents, or reload
   the VS Code window after confirming Copilot and workspace trust are enabled.
4. Start with the synthetic prompt below.

Open the folder that contains `README.md` and `.github`, not its parent or the
ZIP file itself. No installer or `npm install` is needed for this option.

Repository profiles live at `.github\agents\hackathon-facilitator.agent.md`.
The agent-only ZIP includes a namespaced methodology reference pack.

```text
Plan a two-day AI hackathon for a fictional company. Start with the charter,
stakeholders, one demoable slice per team, readiness checks and dated handoffs.
Use synthetic examples. Mark missing decisions as unknown and do not provision,
publish, invite or submit anything.
```

## Option B: add it to an existing workspace

From the extracted package or this source repository, run:

```powershell
node .\scripts\install-copilot-agent.mjs --target "C:\src\my-project"
```

On macOS/Linux, from the extracted package, use your existing workspace's path:

```bash
node ./scripts/install-copilot-agent.mjs --target "$HOME/my-project"
```

The target folder must already exist. The installer:

- Copies the profile into `.github\agents`.
- Copies only the seven approved YAML references into
  `.github\hackathon-facilitator\methodology`.
- Makes no network calls, installs no dependencies and changes no authentication.
- Leaves identical installed files alone.
- Refuses to overwrite differing files or install through symbolic links/junctions.

Review the changes before committing them in your own repository. To update a
locally customized version, compare/back up your existing profile and references
first; the installer deliberately has no force-overwrite option.

Manual alternative: copy the profile to `.github\agents` yourself. The profile
contains a self-contained baseline, so it works without the optional reference
pack; it must not claim to have read references that were not installed.

## Option C: personal installation across workspaces

```powershell
node .\scripts\install-copilot-agent.mjs --personal
```

This copies **only the self-contained profile** to the current user's
`.copilot\agents\hackathon-facilitator.agent.md`. It does not modify other agents.
The baseline and public source links are embedded in the profile; repository
reference files, when present, can provide the versioned extended methodology.

On remote/Agent Host sessions, install in the selected host's home directory,
not just on the local desktop. Host policy and permissions still apply.

## GitHub Copilot CLI

Install the official CLI if needed using an approved method:

```powershell
npm install -g @github/copilot
```

Then open your trusted workspace:

```powershell
Set-Location C:\src\my-project
copilot
```

Use `/login` when requested, then `/agent` and choose `hackathon-facilitator`.
Alternatively:

```powershell
copilot --agent=hackathon-facilitator --prompt "Create a readiness checklist for a fictional two-day hackathon. Do not change external systems."
```

Do not add `--allow-all` or automatically approve every command just to make
installation easier. Review tool permissions and keep the normal approval flow.

## GitHub.com / Copilot cloud agent

There is no separate "upload this chatbot" step. A supported agent profile is
committed to a permitted GitHub repository:

1. Choose a repository you control and whose data/visibility policy permits the
   intended task. Public read access to this repository does not grant write
   access or permission to run cloud-agent tasks in it.
2. Review the allowlisted package and its contents.
3. Add `.github\agents\hackathon-facilitator.agent.md` and the desired reference
   pack, then merge to the repository's default branch.
4. Open <https://github.com/copilot/agents>, select that repository and select
   `hackathon-facilitator` from the custom-agent picker.

This repository already contains the repository-level profile. The organization-wide
steps below are optional administrator actions, not changes performed by this project.

Repository access and Copilot cloud-agent availability are prerequisites. A local
file passing validation does not prove the agent appears in every host's picker.
Use a restricted repository for real customer planning; cloud-agent commits,
pull requests and issues in a public repository expose their contents publicly.

For organization-wide distribution, an authorized organization/enterprise owner
can place the profile in the appropriate root `agents` directory of the designated
`.github` / `.github-private` repository according to GitHub's current guidance.
Do not create or modify those organization-level repositories without approval.

## Optional companion web app

The agent-only package is sufficient for Copilot planning. The web app's source,
runtime and database are **not included** in this repository or its releases.
Do not run `npm ci`, `npm run setup` or `npm run dev` here: this is not an npm
application and has no `package.json`. The separate local web MVP is not a hosted
service or a publicly downloadable companion app.

The local app's default AI evaluator is **mock**, whose keyword/hash scores are
not reliable for real portfolio selection. Installing this Copilot profile does
not replace that evaluator or configure Azure OpenAI. Real app evaluations need
an approved endpoint, deployment, credentials and quality review.

Entra SSO, production hosting, recovery operations and corporate approvals are
not supplied by this installer. The existing app lockfile references an approved
package feed; dependency access must be checked in the recipient's environment.
Do not promise outside-organization or Linux cloud-app installation until validated.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Agent is missing | Open the extracted root containing `.github`, not the ZIP or its parent. Update VS Code/Copilot, check sign-in and custom-agent policy, then reload the window. Use **Chat: Open Customizations** to inspect agent discovery. |
| `node` is not recognized | Use Option A without an installer, copy the profile manually, or install Node.js 24 before using Options B/C. |
| Target folder does not exist | Create or select your actual workspace first. `C:\src\my-project` is an example, not a folder the installer creates. |
| Existing file differs | Compare and back up the local customization before updating. The installer intentionally does not overwrite it. |
| Symlink/junction rejected | Choose a normal directory whose parents do not redirect through links; do not bypass the protection. |
| `npm` reports a missing `package.json` | Do not install application dependencies in this agent package. Open it directly in VS Code or run the standalone installer with Node. |
| Copilot access is denied | Confirm Copilot access and your organization's host/model/custom-agent policies. Making this repository public does not grant a Copilot entitlement. |

Release assets include a SHA-256 checksum. On Windows, compare the ZIP hash from
`Get-FileHash -Algorithm SHA256` with the checksum file before extraction if
verifying the download. Report problems with your host/OS/version and a synthetic
reproduction in [Issues](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/issues).
Never attach customer data, internal documents, credentials or raw prompt logs.

## Confirm installation

- The expected profile file exists and appears in the host's agent picker.
- The synthetic kickoff prompt produces a charter/readiness/handoff plan.
- Missing attendance/data approvals stay unknown, not silently approved.
- A campaign brief mentioning brand images does not automatically become an
  Azure vision project.
- "Choose one of three MVP slices" is reported as an unresolved choice.
- The agent never claims an unavailable Work IQ source was retrieved.

These are a first-use checklist, not a validated model-quality benchmark.

## Disable / uninstall

Remove the specific profile file you installed, or move it outside the host's
agent discovery directory. The optional namespaced reference folder can remain
or be removed after confirming it contains no local edits. Do not recursively
delete `.github` or `.copilot`.

## Official installation references

Reviewed 2026-09-11:

- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/overview
- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
- https://code.visualstudio.com/docs/copilot/customization/custom-agents
