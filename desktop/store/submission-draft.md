# Microsoft Store submission draft

**Not submitted or approved.** Confirm all claims against the actual packaged
build and Partner Center field limits. Do not use a fictional publisher identity.

## Suggested product name

Hackathon Facilitator — subject to name reservation.

## Short description

Plan AI hackathon use cases with a visual Kanban board, readiness evidence and
accountable handoffs in a local desktop workspace.

## Description

Hackathon Facilitator helps facilitators and teams organize prototype work without
losing track of owners, decisions and next actions. Group use cases by progress
or delivery route, review readiness, and keep a shared handoff record for each case.

The desktop app stores its workspace locally in the current Windows profile.
It includes fictional examples for first use and needs no separate Node.js,
Copilot subscription or Azure account. The current AI evaluation and build-guide
provider is a **mock demonstration**, not a live or validated recommendation service.

The app is created by Daniel Horvath. It is not an official Microsoft product,
a source of corporate approval or a production deployment platform.

## Features

- Kanban progress and independent delivery-route grouping.
- Shared card/overview handoffs with owners and dated next actions.
- Readiness checks with explicit evidence and unresolved blockers.
- Demonstration evaluations, mock build guides and versioned records.
- Markdown, CSV and print-ready exports.
- Notification-area icon; close to hide, Open to restore, Quit to exit.

## Privacy and support

Privacy notice draft:
https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/blob/main/docs/desktop-privacy.md

Support: dahorvath@microsoft.com — owner must approve public support use and response
responsibility. Public issue tracker must accept only synthetic/minimized examples.

No account is required to open the desktop preview. It is single-user local
access, not Microsoft Entra authentication.

## Certification notes — restricted capability

`runFullTrust` is required because the application is an Electron classic desktop
app that launches a bundled Node.js process. The backend listens only on a random
loopback port and requires a fresh per-launch token injected only by the app's
isolated browser session. It is not a system service, does not elevate, and does
not accept unauthenticated workspace requests.

No installers, npm package downloads, additional executable downloads or live AI
service calls occur during normal desktop first launch. The runtime and synthetic
database template are packaged with the application.

## Suggested certification test flow

1. Launch from Start; confirm the blue board and fictional sample cases.
2. Open a card; record a next action/date and save.
3. Confirm that In production and Submitted to CAF require owner/reference.
4. Export a portfolio CSV and open the print-ready view.
5. Close the main window; restore through the notification-area icon.
6. Quit and reopen; confirm saved data persists.
7. Update to a higher package version with the same identity; verify saved data.
8. Back up through Open data folder before testing uninstall/reset. MSIX-managed
   data may be removed by Windows; no promise of NSIS-style uninstall retention.

## Owner decisions still required

- Actual Store identity and reserved name.
- Correct developer account type and rights to publish this project.
- Verified support/privacy URLs and screenshots of the exact Store build.
- Age-rating and data-collection declarations based on actual behavior.
- Selected markets, pricing and availability.
- Completed WACK/runtime/update tests, restricted-capability response and final
  review of the Store submission.

Do not mark any of these as completed merely because a package was built.
