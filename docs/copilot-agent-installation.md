# Install Hackathon Facilitator in GitHub Copilot

This package is a **custom agent profile**, not a hosted service, a trained model,
a VS Code extension, a Marketplace listing or a Microsoft 365 Copilot agent.
It configures GitHub Copilot's behavior for hackathon planning and reviewed
facilitation. The optional web app is a separate local development MVP.

Private repository:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

Obtain repository access from its owner before cloning. The release ZIP is an
alternative for approved recipients. This repository is not a corporate deployment
or an official Microsoft Marketplace listing.

## Prerequisites

- GitHub Copilot access and an organization policy that permits the intended
  Copilot host, selected model, custom agents and data use.
- VS Code with GitHub Copilot enabled, or GitHub Copilot CLI.
- Permission to access the package/repository and to use any information supplied.
- Node 24 for the included installer or companion app. Manual profile copying
  does not require Node or the application's dependencies.

The agent uses the model selected in Copilot. You do **not** need an Azure OpenAI
key merely to use the custom agent in Copilot Chat.

## Option A: use it in this repository

1. Obtain the reviewed source repository or extract the agent-only ZIP into a
   folder you trust. Never use a ZIP of the author's entire working directory.
2. Open that folder in VS Code.
3. Open Copilot Chat and choose **hackathon-facilitator** from the agent picker.
   If it is missing, run **Chat: Open Customizations** and inspect Agents, or reload
   the VS Code window after confirming Copilot and workspace trust are enabled.
4. Start with the synthetic prompt below.

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

1. Confirm the approved owner/repository and private/internal visibility.
2. Review the allowlisted package and its contents.
3. Add `.github\agents\hackathon-facilitator.agent.md` and the desired reference
   pack, then merge to the repository's default branch.
4. Open <https://github.com/copilot/agents>, select that repository and select
   `hackathon-facilitator` from the custom-agent picker.

This repository already contains the repository-level profile. The organization-wide
steps below are optional administrator actions, not changes performed by this project.

Repository access and Copilot cloud-agent availability are prerequisites. A local
file passing validation does not prove the agent appears in every host's picker.

For organization-wide distribution, an authorized organization/enterprise owner
can place the profile in the appropriate root `agents` directory of the designated
`.github` / `.github-private` repository according to GitHub's current guidance.
Do not create or modify those organization-level repositories without approval.

## Optional companion web app

The agent-only package is sufficient for Copilot planning. The full web app
requires the separately reviewed source repository:

```powershell
npm ci
Copy-Item .env.sample .env  # first setup only; never overwrite existing settings
npm run setup             # NEW local database only
npm run dev
```

Open <http://127.0.0.1:3000>. Keep it loopback-only.

The local app's default AI evaluator is **mock**, whose keyword/hash scores are
not reliable for real portfolio selection. Installing this Copilot profile does
not replace that evaluator or configure Azure OpenAI. Real app evaluations need
an approved endpoint, deployment, credentials and quality review.

Entra SSO, production hosting, recovery operations and corporate approvals are
not supplied by this installer. The existing app lockfile references an approved
package feed; dependency access must be checked in the recipient's environment.
Do not promise outside-organization or Linux cloud-app installation until validated.

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
