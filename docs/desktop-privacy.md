# Hackathon Facilitator desktop privacy notice

**Last updated: 27 September 2026.**

This describes the local desktop preview and the prepared Microsoft Store package.
The Store package is not yet submitted or certified. Publication rights, support
ownership and the final Store listing must be confirmed by the publisher.

## Information you enter

The app can store workspace names, use-case descriptions, contacts, ownership,
evaluation records, readiness notes, evidence references and next actions.
These records are kept in a local SQLite database in the current Windows
profile. First launch uses fictional sample data.

Do not enter secrets, identity documents or unapproved personal/customer data.
Public GitHub issues and attachments are public; provide synthetic reproductions
instead of databases, raw prompts or internal approval documents.

## Network use

The desktop preview uses **mock AI** and does not automatically transmit workspace
content to the developer or an AI provider. The Electron window communicates
with its bundled backend on the same device through a token-protected loopback
listener. This local connection is not a shared cloud service.

When you choose an external documentation/support link, it opens in your normal
browser or mail application. The selected external service's privacy terms apply
and it may receive the URL, IP address or information you deliberately send.
The app does not silently send support messages or upload workspace databases.

Microsoft Store downloads, account verification and updates, and operating-system
security/reputation checks are handled by Microsoft under its own terms. The app
does not disable those protections or collect verification documents.

## Exports and sharing

Exports are written to a location you choose. The app does not automatically apply
corporate sensitivity labels; review and classify exports before sharing.
Printing uses the operating system's chosen printer/PDF workflow.

## Retention and deletion

For the NSIS/EXE preview, local data is stored separately from installed program
files and retained on uninstall by design. Quit the app before copying or
intentionally deleting its data.

For the prepared MSIX/Store version, data is stored in a separate package-managed
profile. **Windows uninstall/reset can remove it.** Use **Open data folder** from
the notification-area menu, quit the app, and back up the database/schema marker
outside the package-managed directory before uninstalling or resetting.
There is no automatic migration from a customer's web/NSIS database.

## Support

Project creator/contact: **Daniel Horvath — dahorvath@microsoft.com**.
Only information that you deliberately include in a support request is sent
through that communication channel. Do not send identity documents, secrets or
customer databases. This notice is not Microsoft corporate approval or a claim
that the project is an official Microsoft product.
