# Microsoft hackathon submission draft

**Status: draft only; not submitted.** The exact official event, portal, category,
deadline, eligibility and submission terms have not been confirmed.

Provisional target: Microsoft internal Global Hackathon / Microsoft Garage,
subject to confirmation. The public Garage page establishes the program's
existence, not this year's internal registration requirements:
https://www.microsoft.com/en-us/garage/hackathon/

The public page describes the Global Hackathon as an annual private employee/intern
event using Innovation Studio. It does not establish this project's eligibility,
the current edition's deadline or a completed internal registration.

**Submission access:** https://innovationstudio.microsoft.com opens the Microsoft
work-account sign-in flow. Submission is blocked until the owner signs in and
confirms the exact event/project. No entry has been created or submitted.
Do not assume the edition from the generic `aka.ms/hackathon` shortcut: it
redirected to a `hackathon2025` path during preparation.

## Project name

**Hackathon Facilitator**

## One-line pitch

Turn scattered hackathon preparation and prototype follow-up into one repeatable,
evidence-aware workflow, with a GitHub Copilot facilitator and a local workspace app.

## Short description

Customer AI hackathons often start with disconnected idea lists, spreadsheets,
technical prerequisites and unclear post-event ownership. Hackathon Facilitator
brings these activities into a reusable workflow: structured use cases,
independent progress and delivery routes, readiness evidence, demo preparation
and dated ownership handoffs.

The project combines a GitHub Copilot custom-agent profile with a working local
web MVP. It emphasizes evidence and human judgment: missing approvals do not
become green checks, old assessments remain traceable, and every prototype needs
an accountable next step.

## Problem

Facilitators repeatedly reconstruct the same planning assets and have to reconcile
business ambition with access, licensing, data, governance and delivery readiness.
After the event, otherwise promising prototypes can lose momentum when ownership,
pilot scope, a next milestone or a permitted follow-on engagement is unclear.

## Proposed solution

- A Copilot custom agent that guides the facilitator through the lifecycle and
  challenges unsupported assumptions.
- Structured use-case capture with evidence-based review, human overrides and
  explicit distinctions between customer priority, votes and assessment scores.
- Source-linked readiness and closure checks with owners, dates and evidence.
- Workspace-scoped collaboration roles, version-checked edits, Kanban and
  preserved historical artifacts.
- Readout/handoff exports and follow-up/cleanup ownership.

## What is implemented

The local application opens on a responsive blue Kanban board with selectable
Dashboard, contacts/teams, evaluation workflow, saved guides, readiness checks,
shared card/overview handoffs and Markdown/CSV/print-ready exports. Standalone
Charter and Milestones were removed. In production and Submitted to CAF are
explicit external-activity records requiring owner and evidence.

The public repository distributes sanitized app source under `app/`, an easy
local-demo launcher, the Copilot agent, and Word/PowerPoint/PDF materials:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent .
Reviewers can download it without an invitation. Node.js 24 is required for the
local app; only the optional agent requires permitted GitHub Copilot access.
Created by Daniel Horvath; contact: dahorvath@microsoft.com.

Stack: Next.js, React, TypeScript, Prisma/SQLite and an optional Azure OpenAI
provider. Tests use synthetic data and mock AI. The existing local application
review recorded **409 unit/API tests and 53 browser tests passing** for the
September 11 version. The current version has separate regression checks;
that historical count is not a claim about the redesigned version. These are software regression
evidence, not model accuracy, customer adoption or production certification.

## Differentiation

The central idea is not another idea tracker. It is a reusable facilitation process
that keeps business scope, readiness evidence and post-event accountability
together, with an agent that helps identify missing decisions instead of merely
generating optimistic plans.

The project also makes a practical distinction between deterministic software
checks and AI judgment. A valid JSON response or repeatable score is not evidence
that an architecture recommendation is correct.

## Honest current limitations

- The web app defaults to a keyword/hash-based **mock evaluator**. Its scores are
  demonstration fixtures and are not suitable for real portfolio selection.
- An approved live Azure OpenAI deployment and a human-reviewed reference set
  are needed to measure recommendation quality.
- Corporate Entra SSO is not implemented; the development identity path is
  loopback-only and fails closed in production.
- Work IQ retrieval attempts did not yield usable internal source evidence.
  Public Microsoft references must not be described as internal corporate approval.
- Production hosting, PostgreSQL migration, backup/restore, operations and
  relevant privacy/security/Responsible AI approvals remain work to complete.
- Exports are not automatically sensitivity-labeled; native Office document
  generation is not implemented.

## Responsible AI, privacy and security

Use a fictional scenario in the submission and demo. Do not include customer
names, employee/customer contact details, tenant identifiers, live financial data,
screenshots of real workspaces, credentials or internal documents.

AI outputs are planning drafts subject to human review. The agent must identify
unknowns and cite sources actually retrieved. It must not claim risk approval,
model accuracy or program eligibility from a score. Consequential actions require
documented human oversight; the facilitator does not autonomously act in customer
systems.

The submission must disclose the model/provider used in the demo. If the web app
uses mock mode, state that visibly and verbally. Do not relabel Copilot's chat
reasoning as a live Azure OpenAI app evaluation.

## Three-minute demo script

| Time | Demonstration | Evidence/message |
| --- | --- | --- |
| 0:00-0:25 | Explain the fragmented preparation/follow-up problem | Use a fictional company; no unsupported adoption or savings numbers |
| 0:25-0:55 | Select the Copilot agent and create a compact charter/readiness plan | Show missing decisions as unknown; name the host/model actually used |
| 0:55-1:30 | Open the local workspace, inspect a structured use case and its checks | Clearly label mock app evaluations; demonstrate why a high score is not approval |
| 1:30-2:00 | Show a blocker, responsible owner and evidence-backed readiness check | Demonstrate human review and source traceability |
| 2:00-2:35 | Show an exit package with decision, owner and dated next milestone | No orphaned prototype; measured outcomes remain distinct from estimates |
| 2:35-3:00 | Export a synthetic readout and state the next validation milestone | Approved pilot/reference set and internal release requirements, not a claim of production readiness |

Prepare a backup recording using the same synthetic data and approved sharing
location. Verify the event's actual video-length/file/link requirements first.

## Impact hypothesis and how to measure it

**Hypothesis, not measured result:** the tool can reduce preparation rework,
surface blockers earlier and improve the completeness of post-event ownership.

For a controlled facilitator pilot, measure:

- Preparation time per event against a documented baseline.
- Percentage of selected cases with explicit owner, demo scope and approved sample.
- Access/licensing/data blockers identified before Day 0 versus on the event day.
- Percentage of prototypes leaving with a decision, accountable owner and dated next action.
- Follow-up completion and facilitator feedback after the event.
- False passes and unsupported recommendations against a blinded, reviewed
  assessment set.

No achieved percentage improvement, ROI, adoption count or accuracy claim is
asserted here.

## Team and submission fields still required

| Field | Status |
| --- | --- |
| Exact official event and edition | Confirm |
| Authenticated submission portal | https://innovationstudio.microsoft.com ; owner sign-in and exact event/project required |
| Eligibility and project/category rules | Confirm |
| Registration/submission deadlines and time zone | Confirm |
| Project owner, team members and their consent | Confirm |
| Organization/IP/reuse permission and visibility | Confirm |
| Repository/package link | https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent (public app, agent and materials) |
| Approved synthetic demo video/slides link | Prepare after portal requirements are known |
| Privacy/security/Responsible AI disclosures and required review | Confirm |
| Final review of generated text against portal word limits | Pending |
| Submitted/accepted status | **Not submitted; not accepted** |

## Before pressing Submit

Confirm the fields above in the official portal, adapt this draft to the required
limits/categories, verify links with the intended audience, review all claims and
obtain the required team/ownership/terms approvals. Only then submit through the
authorized account and retain the actual submission receipt/ID.
