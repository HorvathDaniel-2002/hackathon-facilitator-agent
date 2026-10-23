# Distribute Hackathon Facilitator to colleagues

**Current state:** verified full portable application at
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/tag/v0.3.2-portable.2 ,
with source, optional light browser companion, agent and materials at
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent .
No colleague access grant, announcement or official hackathon submission has been performed.

## Choose the delivery channel

| Route | Who acts | What colleagues need |
| --- | --- | --- |
| Full portable local application | Anyone can download | Windows x64/ARM64; extract ZIP and open one CMD file |
| Optional light Browser Edition | Anyone with the link | Current browser; reduced Kanban/readiness scope only |
| Public agent repository / latest release | Anyone can download | Permitted Copilot access; no repository invitation or Azure key |
| Approved private/internal GitHub repository | Repository owner | Repository access, Copilot entitlement/policy, profile on the default branch |
| Reviewed agent-only ZIP via an approved internal channel | Owner of the artifact and channel | ZIP, installation guide, a permitted Copilot host |
| Organization-wide Copilot agent | Authorized organization/enterprise administrator | Profile published in the designated organization agent repository and permitted policies |

Do not publish a recipient workspace or the companion app's history without
review. The repository contains an allowlisted app source tree, not a copy of
the author's complete working folder, databases or original git history.

## Controlled rollout

1. Confirm ownership, the allowed recipient group, repository/channel visibility,
   reuse permissions, and a named maintainer. No open-source license is implied.
2. Review `.github\agents\hackathon-facilitator.agent.md`, the references and the
   package manifest. Compare the ZIP SHA-256 with the hash supplied by its owner.
3. Pilot with a small group of colleagues using **synthetic cases only**.
4. Have participants extract the portable app, run the same fictional workflow
   and optionally try the separate Copilot agent with the same starter prompt.
5. Capture installation failures, unsupported/overconfident recommendations,
   missing requirements and usefulness ratings. Do not publish customer examples
   or raw prompt logs as feedback.
6. Version changes, retain a changelog and roll out more broadly only after the
   pilot and the relevant internal approvals.

## Copy-ready Teams / email announcement

**Subject:** Try the full Hackathon Facilitator locally

Hi colleagues,

I have built **Hackathon Facilitator**, a full local workspace for use-case intake,
mock evaluation and build guides, Kanban progress, delivery routes, readiness,
contacts and accountable handoffs.

I am looking for a small pilot group to try it with synthetic scenarios and
provide feedback on first-use clarity, planning completeness and usefulness.

**Download the full application:**
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.2-portable.2/Hackathon-Facilitator-Full-Portable-0.3.2.zip

1. Extract the complete ZIP into a normal writable folder.
2. Open `Start-Hackathon-Facilitator.cmd`.
3. Keep the launcher window open while using the app in your browser.

There is no Store installation, admin requirement, separate Node.js/npm, Copilot
subscription or Azure key. Data stays under
`%APPDATA%\Hackathon Facilitator Portable\data`. Stop the app before using the
included backup command. Use only approved, non-sensitive information.

**No technical setup needed:** download the Word playbook, PowerPoint workshop or
PDFs from https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/tree/main/materials .
Use the editable templates and checklists manually; no agent or Copilot
subscription is needed for that route.

The repository is public; no invitation is needed:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

**Full app start/backup guide:**
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/blob/main/portable/README.md

**Optional Copilot agent install guide:**
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/blob/main/docs/copilot-agent-installation.md

Open the reviewed folder in VS Code and select `hackathon-facilitator`, or run
the included installer against an existing workspace and use Copilot CLI `/agent`.
Opening the extracted folder in VS Code requires no Node.js, Azure key or app
dependencies; you still need GitHub Copilot access and applicable policy permission.

This is an experimental local planning aid with fictional starter data and mock
AI, not an official Microsoft policy authority or production service. It has no
live AI, Entra SSO or cloud synchronization. Do not supply unapproved customer
data. Corporate approvals are not bundled.

Please send sanitized feedback through
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/issues , covering:
first use, one useful workflow, one confusing or missing capability and whether
the tool helped identify a better next action.

Thanks,
Daniel Horvath
dahorvath@microsoft.com

## Short project description

Hackathon Facilitator is a full portable local workspace and optional GitHub
Copilot custom agent for AI hackathons. It structures sponsorship, use-case
intake, evidence-based scoping, technical readiness, event agendas, demos and
ownership handoffs. It distinguishes project defaults from verified Microsoft
guidance, unknowns from approvals, and working software from validated AI quality.

## Suggested first-use prompts

```text
Plan a two-day hackathon for a fictional logistics company with three teams.
Produce a charter, a readiness register and a dated handoff template.
Mark missing decisions as unknown. Do not contact anyone or provision resources.
```

```text
Review this synthetic campaign-brief assistant use case. Explain whether brand
images actually require computer vision, and whether an existing SaaS capability
is enough before proposing a custom agent. Do not invent numeric accuracy.
```

```text
Act as a final-readout reviewer. Identify missing owners, evidence, dates and
unresolved approvals. Separate demonstrated outcomes from estimated value.
```

## Publication checklist

- Repository owner authorized public distribution of the reviewed app, agent and materials.
- Customer contacts, data, screenshots, databases and session artifacts excluded.
- `.env`, credentials and internal/private links absent from the shareable set.
- Package manifest and hash reviewed; clean install tested.
- Agent profile available in the target host after installation/default-branch merge.
- No unsupported "Microsoft approved", accuracy, cost-savings or adoption claims.
- No colleague invitation is required for downloads; actual announcements are approved separately.
- Maintainer, feedback route, update procedure and permitted distribution scope set.
