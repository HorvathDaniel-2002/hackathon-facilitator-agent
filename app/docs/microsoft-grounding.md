# Microsoft guidance grounding

Reviewed against public Microsoft sources on **2026-09-09**. The machine-readable
source register is `methodology/sources.yaml`; the operational checklist is
`methodology/runbook.yaml` and appears in each workspace's **Facilitator runbook**.
This is curated, versioned grounding, not live web retrieval or an internal
SharePoint RAG connection. Recheck the linked licensing and product documentation
before each event; model output can still be wrong.

## What this does and does not establish

This application is a project-authored facilitation aid informed by Microsoft
guidance. It is **not an official Microsoft corporate standard, security approval,
Responsible AI sign-off, licensing entitlement or funding commitment**.

The internal documents named in the original specification (field mentor packs,
internal delivery guides, specific pilot scopes and internal SharePoint material)
were not available to verify. Do not represent these public sources as substitutes
for the applicable internal requirements. The event sponsor and the relevant
Microsoft IT, security, privacy and Responsible AI owners must confirm those.

The 40/30/20/10 rubric, score bands, hard gates, 4-week cadence, 2/3-day templates,
mentor ratio and "one useful demo path" constraint come from this project's
specification. Microsoft publishes compatible principles, but the sources below
do **not** establish those exact numbers as corporate requirements.

## Verified recommendations and application controls

| Source | Verified recommendation | Application behavior |
| --- | --- | --- |
| [Organize hackathons](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/hackathons) | Sponsor, judges, logistics, registration, participant training, test data/access, team presentations and follow-up | Contacts/teams, readiness evidence, use-case Kanban and exit packages; generic agenda guidance remains outside the app |
| [Solution envisioning](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/solution-envisioning) | Define business objectives, include business/IT/end users, capture current/future process, pain points and value | Structured intake and portfolio selection; not just idea titles |
| [Licensing](https://learn.microsoft.com/en-us/microsoft-copilot-studio/requirements-licensing-subscriptions) | Trial permits authoring and test chat, **not publishing**; licensing/capacity depends on capabilities | Required licensing/capacity check and approved test-chat fallback; no fixed quota promises |
| [Environments](https://learn.microsoft.com/en-us/microsoft-copilot-studio/environments-first-run-experience) | Appropriate environment, region, Dataverse and access; non-default production environments for production agents | Environment/maker-account dry run before event readiness; experimental builds do not imply production readiness |
| [Data policies](https://learn.microsoft.com/en-us/microsoft-copilot-studio/admin-data-loss-prevention) | Compatible data groups; policies can block knowledge, HTTP, tools and channels; enforcement exemption no longer supported | Required policy review; approved sandbox/mock instead of blanket DLP bypass |
| [Teams publication](https://learn.microsoft.com/en-us/microsoft-copilot-studio/publication-add-bot-to-microsoft-teams) | Publish first, share correctly, check Teams app policy and admin approval for organization-wide distribution | End-user installation test or explicitly approved fallback; no assumption that a trial can deploy to Teams |
| [Knowledge sources](https://learn.microsoft.com/en-us/microsoft-copilot-studio/knowledge-copilot-studio) | Source-specific authentication and limits; user access trimming | Sample readiness, indexing and denied-document tests; a text field does not prove access approval |
| [Agent technology plan](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/technology-solutions-plan-strategy) | Consider whether an agent is appropriate and whether prebuilt SaaS meets the need before a custom build | Mandatory no-agent/prebuilt assessment in the runbook. Fit evaluator only compares custom-build choices |
| [Responsible AI policies](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai/responsible-ai-policies) | Align to corporate governance, impact assessment, human oversight, risk-based formal approvals and incident response | Risk-review decision reference, human review, stop authority and test evidence; no claims that synthetic data exempts a prototype from review |
| [Business value](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/business-value) | Compare baseline to actual time/cost/errors/productivity; distinguish tangible/intangible value | Baseline/target/measurement owner check, exit outcome evidence and follow-up. Priority score is not ROI |
| [Agent operations](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/integrate-manage-operate) | Measured phased expansion, change management, ownership, monitoring and retirement | Pilot handoff, accountable owner, dated next action, resource/access/retention cleanup and value check-in |
| [Frontier Accelerate for Azure](https://azure.microsoft.com/en-us/solutions/frontier-accelerate) | Assessment/business case/proof of value precedes implementation assistance | Follow-on suggestions are provisional; account/engagement owner confirms scope, eligibility and funding |

## Naming and routing corrections

Current Cloud Adoption Framework documentation uses **Microsoft Foundry**. Internal
database identifiers such as `AzureAI` remain stable for compatibility; they do not
mean a specific model or service has been provisioned.

The public `azure-accelerate` page redirected to **Frontier Accelerate for Azure**
when reviewed. This does not prove every internal funding/engagement label was
renamed. "AI Agents Pilot", its Workforce Productivity/Business Process Automation
variants, local Solution Assessment scope and Factory eligibility require confirmation
with the relevant internal owner. FastTrack eligibility and scope likewise cannot be
inferred from a prototype's score.

**CAF** is ambiguous: *Cloud Adoption Framework* is architecture/adoption guidance,
whereas *Cloud Accelerate Factory* is an engagement/program label. Do not use the
acronym alone as a promise of delivery assistance.

## Stage-by-stage operating procedure

1. **Around four weeks before:** confirm sponsor, objective, judges, participant
   roster, accessibility, venue/Teams collaboration and decision criteria.
2. **Around three/two weeks before:** hold scoping calls; assess no-agent/prebuilt
   alternatives; choose a small portfolio with named process owners; establish
   baseline, target, sample size and measurement owner.
3. **Two/one weeks before:** confirm licenses, capacity, maker/environment roles,
   region, approved test data, knowledge permissions, connector/DLP policies,
   authentication, publication permissions and risk review. Train participants.
4. **Day 0:** dry-run the actual end-user path; resolve blockers or document the
   approved mock/test-chat fallback. Record the sponsor/technical go/no-go.
5. **Hackathon days:** reconfirm scope, run mentor checkpoints, log blockers,
   freeze the demonstrable path, test permission failures and human approvals,
   prepare a recording and capture demo/judging evidence.
6. **Readout and follow-up:** capture what worked and what did not, actual versus
   estimated benefit, every portfolio decision and accountable owners. Schedule
   a dated next action, confirm engagement eligibility, assign cleanup and
   data retention, and arrange a value check-in/retrospective.

These timings are editable project defaults. The public hackathon guide allows
one or more days and provides an example agenda, not a mandatory 2-day event.

## Evidence semantics

Runbook checks start unconfirmed. Marking a check complete requires a named owner,
date and evidence/decision reference. Required start/closure checks cannot be
waived by selecting "Not applicable". A version change invalidates previous
completion until it is reviewed and saved against the new template.

A check is a **human attestation**, not an automated tenant scan. Do not paste
secrets, unapproved customer data or the contents of sensitive internal decisions
into free-text evidence. Use a permissible reference, with the actual approval
stored in the appropriate corporate system.

Exports include context and source references but do not apply Microsoft Purview
sensitivity labels. A facilitator must classify, label and approve sharing.
