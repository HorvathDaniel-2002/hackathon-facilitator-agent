# Use-case Kanban and shared handoff

The board tracks **reported progress**, independently of AI recommendations and
the original qualification history. Columns are Intake, Assessing, Building,
Pilot, In production and Parked. Grouping by delivery route shows the same cards
under Unassigned, Copilot / Cowork, Copilot Studio, Custom build and CAF.

Delivery routes are manual classifications, not automatic platform recommendations
or entitlement to a service. Selecting CAF does **not** mark a case as submitted.
The separate Submitted to CAF record needs an owner and submission reference.
In production likewise needs an owner and deployment/decision evidence. These
fields record activity completed elsewhere: the app does not deploy or submit.
Moving a card does not clear unresolved qualification or readiness checks.

The card's handoff panel and Handoff overview read and edit the same record.
Owners, outcome, delivery route, next action/date and evidence therefore remain
consistent. Changes are version-checked to reject stale tabs rather than overwrite
another person's work. Viewers cannot change cards; archived workspaces are
read-only. Closed workspaces permit follow-up tracking while protecting the
original demo, business owner and exit decision.

## Charter and Milestones removal

The standalone Charter and Milestones features have been removed, including the
Milestone table and these Hackathon columns:

`sponsorName`, `objective`, `format`, `startDate`, `endDate`, `location`,
`decisionCriteria`, `productionIntent`.

Workspace identity, customer, status, members, contacts, use cases, assessments,
guides and handoff data remain. Minimal workspace Settings manage identity,
membership and lifecycle; they do not recreate a charter. The handoff's existing
`nextMilestone` and `nextMilestoneDate` storage fields now represent the per-case
**next action** and date, not a standalone milestone plan. Readiness dates are
entered explicitly rather than calculated from retired event dates.
The runbook template is now version 1.1.0. Existing evidence is preserved, but
confirmations against an earlier template need review before counting as current.

## Existing database migration

This change deletes the retired fields and table. **Get the data owner's explicit
approval first, stop the app and other database writers, and choose the correct
database.** Do not reset or re-seed an existing database. Recovery copies can
contain confidential information and must stay in an approved, restricted location.

The standalone migration script requires explicit existing database and new
backup/trial paths. It refuses to overwrite backups, follow symlinks/junctions,
or migrate an already/partially migrated schema. It uses a SQLite backup,
rehearses on a copy, validates foreign keys and integrity, and compares every
retained row/column before modifying the requested database.

```powershell
node .\scripts\migrate-kanban.mjs --preview `
  --database "C:\path\existing.db" `
  --backup "C:\approved-backups\kanban-preview-backup.db" `
  --trial "C:\approved-backups\kanban-preview-trial.db"

# Only after approved preview; use NEW paths so the previous backup is preserved.
node .\scripts\migrate-kanban.mjs --apply `
  --database "C:\path\existing.db" `
  --backup "C:\approved-backups\kanban-apply-backup.db" `
  --trial "C:\approved-backups\kanban-apply-trial.db"
```

Generate the Prisma client from the updated schema before starting the app.
Configure `DATABASE_URL` explicitly to the migrated database. The migration does
not alter other databases, old recordings or historical backups, and does not
transmit data. A database-only rollback requires the matching older application
code; do not replace a database under a running process.

## Conservative mapping of existing cases

| Original qualification state | Initial reported progress |
| --- | --- |
| Draft | Intake |
| Qualified / Selected | Assessing |
| Building / Demoed | Building |
| Closed | Assessing (review the next step) |
| Parked or an existing Stop handoff | Parked |

All routes initially remain Unassigned and CAF status remains Not submitted.
Nothing is inferred as Pilot or In production from a completed demo, a score or
a closed hackathon. The original case status and evaluation history are preserved.
Only an explicit, versioned user update records an advanced reported stage.
