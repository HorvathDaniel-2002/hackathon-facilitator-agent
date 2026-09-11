# Hackathon Facilitator for GitHub Copilot

A custom Copilot agent for planning customer AI hackathons from charter and
use-case intake to readiness, demos and accountable follow-up.

**Private repository distribution. Not an official Microsoft product.
Official Microsoft hackathon submission remains pending.**

Repository: https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

Colleagues need repository access and a permitted GitHub Copilot subscription.
Repository ownership/visibility is not Microsoft corporate approval.

## Install

Clone this private repository using your authorized GitHub account:

```powershell
git clone https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent.git
Set-Location hackathon-facilitator-agent
```

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
