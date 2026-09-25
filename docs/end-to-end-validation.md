# End-to-end validation — 25 September 2026

This report separates software checks from corporate approval and AI quality.
All modifying tests use fictional data in isolated directories or disposable
GitHub-hosted Windows runners. No existing customer database is reset or seeded.

## Web application

| Check | Result |
| --- | --- |
| Clean dependency installation from the distributed lockfile | Passed |
| TypeScript, ESLint and production build | Passed |
| Unit/API tests | **495 passed**, across 34 test files |
| Browser end-to-end tests | **69 passed**, no skips or retries |
| Independent Windows and Ubuntu verification | Passed |

[Windows/Ubuntu CI evidence](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36097981667).

Browser coverage includes workspace creation/settings/membership protections,
use-case editing, independent Kanban progress and delivery grouping, responsive
desktop/tablet/mobile layouts, shared handoff deep links, required production/CAF
references, unsaved drafts, stale-tab conflicts, readiness evidence, mock
evaluations/guides, exports, frozen-workspace rules and sign-in recovery.

## Desktop and installer

The desktop policy/runtime suite has **40 passing tests**, including session-token
isolation, restricted navigation, sandbox preferences, tray/single-instance
behavior, safe exports, template integrity, schema-mismatch refusal, data
preservation and the ARM64-compatible installer configuration.

The installer workflow uses the real `.exe`, not only an extracted application:

1. Verify the installer hash and install into a disposable per-user directory.
2. Check the installed executable, uninstall registration and both shortcuts.
3. Open the installed app and verify it runs its bundled Node runtime.
4. Create a fictional workspace/case, evaluate it with mock AI and save a guide.
5. Exercise production/CAF evidence guards, shared handoffs and readiness blockers.
6. Open the print-ready view and save a CSV export.
7. Close to the tray, restore through a second launch, and quit the backend.
8. Reinstall the same version, compare saved-data hashes and reopen the saved case.
9. Uninstall the program and shortcuts while retaining the saved workspace.

| v0.3.1 installer lifecycle | Result |
| --- | --- |
| Windows x64: install, shortcuts, complete app workflow, reinstall, uninstall | **Passed** |
| Native Windows ARM64: same complete lifecycle | **Passed** |
| Saved data retained across reinstall and uninstall | **Passed on both** |

[Native x64/ARM64 build and end-to-end evidence](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36099937596).
The release assets are the **same files** tested by these jobs:

```text
x64   90c1e2f1a1c83c69ac0abe9bad8e2a93d3b56d66129cf536b17cf9ee8cbd6b98
ARM64 289d71536aa765b8a98863a0f3d8f8a8bfe567fc84799d031f3005f7d15367d5
```

## Defect found and fixed

The v0.3.0 ARM64 installer could finish without extracting the main executable,
bundled Node executable and ARM64 DLLs. Those entries used the newer ARM64 BCJ
filter in a 7z payload, while the bundled NSIS extractor did not restore them.
The issue reproduced on a real Windows ARM64 runner; no relevant Defender or
Code Integrity blocking event explained the omission.

The v0.3.1 packaging fix uses **ZIP/Deflate** and disables differential 7z
packaging. A regression test requires both settings. No security policy or
antivirus exclusion is changed. Keep existing workspace data; deleting it does
not repair an installer extraction failure.

Test-harness corrections were also made: match NSIS's versioned uninstall name,
inspect the actual Electron main PID, wait for real navigation, observe native
Electron download completion, use a stable main-window reference, and wait for
all uninstall artifacts to disappear. These are not hidden product fixes or
skipped assertions.

## Downloads and reusable materials

The v0.3.0 source ZIP was downloaded without authentication; it contained
**233 files** and all recorded content hashes matched. The embedded DOCX/PPTX archives and XML
were valid. Both PDFs opened with readable text: **15 playbook pages** and
**16 workshop pages**. The optional Copilot profile/installer is covered by the
unit suite; a live Copilot conversation is not used as an accuracy benchmark.

## What this does not establish

- The installers remain **unsigned**. SmartScreen, endpoint protection and
  organizational application-control approval remain environment-dependent;
  no protections were disabled.
- Installer automation uses silent installation. The interactive finish-page
  launch checkbox is configured, not manually clicked by this test.
- The native export Save dialog is approved to a temporary file by the test
  driver; manual save/print dialogs and taskbar pinning are not automated.
- Same-version reinstallation and schema-preservation/refusal rules are tested;
  arbitrary future-version database migrations are not certified.
- Real Microsoft Entra SSO, Work IQ access, live Azure model quality, corporate
  approval and production hosting are not established by these results.
- Mock scores and successful software tests are **not** measured model accuracy,
  achieved customer savings or program eligibility.
