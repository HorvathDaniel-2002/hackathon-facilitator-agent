# Distribute Hackathon Facilitator to colleagues

**Current state:** public GitHub agent-only distribution at
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent .
No colleague access grant, announcement or official hackathon submission has been performed.

## Choose the delivery channel

| Route | Who acts | What colleagues need |
| --- | --- | --- |
| Public agent repository / latest release | Anyone can download | Permitted Copilot access; no repository invitation, Azure key or app dependencies needed |
| Approved private/internal GitHub repository | Repository owner | Repository access, Copilot entitlement/policy, profile on the default branch |
| Reviewed agent-only ZIP via an approved internal channel | Owner of the artifact and channel | ZIP, installation guide, a permitted Copilot host |
| Organization-wide Copilot agent | Authorized organization/enterprise administrator | Profile published in the designated organization agent repository and permitted policies |

Do not publish a recipient workspace or the companion app's history without
review. Only the agent-only allowlist is included in this repository and package. The companion app's
source is a separate release candidate requiring its own repository/history,
dependency-feed, security and ownership review.

## Controlled rollout

1. Confirm ownership, the allowed recipient group, repository/channel visibility,
   reuse permissions, and a named maintainer. No open-source license is implied.
2. Review `.github\agents\hackathon-facilitator.agent.md`, the references and the
   package manifest. Compare the ZIP SHA-256 with the hash supplied by its owner.
3. Pilot with a small group of colleagues using **synthetic cases only**.
4. Have participants install, select the agent and run the same starter prompt.
5. Capture installation failures, unsupported/overconfident recommendations,
   missing requirements and usefulness ratings. Do not publish customer examples
   or raw prompt logs as feedback.
6. Version changes, retain a changelog and roll out more broadly only after the
   pilot and the relevant internal approvals.

## Copy-ready Teams / email announcement

**Subject:** Pilot invitation: Hackathon Facilitator for GitHub Copilot

Hi colleagues,

I have prepared **Hackathon Facilitator**, a GitHub Copilot custom agent that
helps structure customer AI hackathons from charter and use-case scoping through
readiness, demo preparation and accountable follow-up.

I am looking for a small pilot group to try it with synthetic scenarios and
provide feedback on installation, planning completeness and recommendation
quality.

**Package/repository:** https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent

The repository is public; no invitation is needed.
Download and extract the ZIP from
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/latest .

**Install guide:** https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/blob/main/docs/copilot-agent-installation.md

Open the reviewed folder in VS Code and select `hackathon-facilitator`, or run
the included installer against an existing workspace and use Copilot CLI `/agent`.
Opening the extracted folder in VS Code requires no Node.js, Azure key or app
dependencies; you still need GitHub Copilot access and applicable policy permission.

This is an experimental planning aid, not an official Microsoft policy authority
or production service. The optional web app uses demo authentication and mock
scoring by default. Do not supply unapproved customer data or treat mock scores
as validated assessments. Work IQ access and corporate approvals are not bundled.

Please send sanitized feedback through
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/issues , covering:
installation, one useful output, one wrong/missing recommendation and whether the
tool helped you identify a better next action.

Thanks!

## Short project description

Hackathon Facilitator is a reusable GitHub Copilot custom agent and optional local
workspace app for customer AI hackathons. It structures sponsorship, use-case
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

- Repository owner authorized public visibility for the reviewed agent-only package.
- Customer contacts, data, screenshots, databases and session artifacts excluded.
- `.env`, credentials and internal/private links absent from the shareable set.
- Package manifest and hash reviewed; clean install tested.
- Agent profile available in the target host after installation/default-branch merge.
- No unsupported "Microsoft approved", accuracy, cost-savings or adoption claims.
- No colleague invitation is required for downloads; actual announcements are approved separately.
- Maintainer, feedback route, update procedure and permitted distribution scope set.
