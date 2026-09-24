# Kanban-first materials — no installation needed

**Created by Daniel Horvath / dahorvath@microsoft.com**

Materials **v0.2.0**, prepared **24 September 2026**. Use the blue/navy Word
playbook, workshop slides or PDFs to run the process manually. **No app, agent,
GitHub Copilot, Node.js or Azure account is required.** Use a compatible office
application to edit Word/PowerPoint, or a browser to read the PDFs.

| File | Use it for | Download |
| --- | --- | --- |
| Word playbook — 15 pages | Outcome alignment, manual Kanban, use-case canvas, evidence checks, agendas, tests and shared handoff worksheets | [Word (.docx)](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/raw/refs/heads/main/materials/Hackathon-Facilitator-Playbook.docx) |
| Workshop deck — 16 slides | A ready-to-present workshop with activities and facilitator prompts in speaker notes | [PowerPoint (.pptx)](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/raw/refs/heads/main/materials/Hackathon-Facilitator-Workshop.pptx) |
| Playbook PDF — 15 pages | Read or print the same playbook | [PDF](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/raw/refs/heads/main/materials/Hackathon-Facilitator-Playbook.pdf) |
| Workshop PDF — 16 pages | Read or print the slides; speaker notes remain in PowerPoint | [PDF](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/raw/refs/heads/main/materials/Hackathon-Facilitator-Workshop.pdf) |

For the versioned package, use
[release v0.2.0](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/tag/v0.2.0).
Choose the named Word, PowerPoint or PDF asset; no source ZIP is needed for manual
use. If GitHub shows a binary-file preview message, use **Download raw file**.

## Start in five minutes

1. Save a working copy in your **approved team location**. Keep completed workbooks
   and approval evidence private.
2. Complete **Align the outcome** and one use-case canvas. This is a manual
   worksheet, not an app page. Edit the prompts in Word; for paper use, write on
   separate answer sheets labeled with the workbook page and case ID.
3. Use page 4 to put fictional or appropriately approved cards on a manual Kanban.
   Give every card an owner, next action and date.
4. Present the PowerPoint; open **Notes** or **Presenter View** for prompts. Resolve
   unknowns with the sponsor and business, IT and data owners.
5. Keep one shared handoff record per case: owners, tests, evidence, learning and a
   dated next step. Record actual external actions, not assumptions.

## Progress is not delivery route

**Progress:** Intake / Assessing / Building / Pilot / In production / Parked.

**Five delivery routes:** Unassigned; **Copilot / Cowork** (one combined route);
Copilot Studio; Custom build; CAF.

These are independent: a case can be **Building** on the **Copilot Studio** route.
Changing the grouping does not change its progress. Choosing CAF does not mean
**Submitted to CAF**. CAF means **Cloud Accelerate Factory**, not Cloud Adoption
Framework. **In production** requires the shared handoff **Business owner** and
**Production evidence / reference**. The CAF form records **Not submitted** or
**Submitted to CAF (external)**; the latter requires the same Business owner and
**CAF submission reference**. **CAF submitted on** is optional. The submitted
badge requires a saved owner and reference.

These statuses record actions completed externally; the workbook and app do not
deploy solutions or submit them to CAF. Changing the delivery route preserves CAF
submission history and evidence. Closing an exit package is not production.
Confirm eligibility, readiness, availability and acceptance with the program owner.

## What's inside the playbook?

- Pages 1–3: getting started, **Align the outcome**, and one-use-case worksheet.
- Page 4: manual Kanban activity, progress versus delivery, and shared card record.
- Pages 5–6: eight qualification conditions and an optional evidence-based rubric.
- Pages 7–8: all 13 start checks with reusable evidence records.
- Pages 9–11: manual two-/three-day agenda, blockers, decisions and six test categories.
- Pages 12–13: shared handoff, production/CAF evidence, four closure checks,
  cleanup and value measurement.
- Pages 14–15: fictional example, optional AI prompt, glossary and public references.

Agendas and planning checkpoints are manual facilitation aids, not app features.

## Optional public app and agent

The repository now also contains the **full web app under `app/`** and the
optional Copilot agent. App setup requires **Node.js 24**. From the repository
root, Windows users can run **`Start-Hackathon.cmd`**; the cross-platform command
is **`node app/scripts/start-demo.mjs`**. See the
[repository README](../README.md) for complete setup and prerequisites.
The app opens on **Kanban**; **Dashboard is optional**. Cards and the overview
open the **same shared handoff panel**.

The app defaults to **mock AI**, not benchmarked recommendations. **Entra SSO is
unavailable.** These limitations do not prevent manual use of these files.
The files are authored templates, not automatic app exports.

## Use safely

All examples are fictional. A score, status or demo is not permission, production
certification, measured business value or acceptance into a program. Schedules,
weights and checks are project-authored defaults, not Microsoft corporate
requirements. Follow your organization's current rules and identify the approver.

Do not upload customer details, internal documents, approval evidence, raw prompt
logs or completed plans to this repository or its issues. The files contain no
macros or app connections; your edits still need appropriate classification and
sharing.

Public references were reviewed **9 September 2026**. App runbook: **v1.1.0**;
published rubric/agendas/sources: **v1.0.0**; qualification/routing/handoff:
**v1.1.0**. No Microsoft logo, endorsement, official hackathon acceptance or
open-source license is implied.
