# End-to-end validation

This report separates software checks from corporate approval and AI quality.
All modifying tests use fictional data in isolated directories or disposable
GitHub-hosted Windows runners. No existing customer database is reset or seeded.

## Full portable local application — 22 October 2026

The supported public route for the original full application is the
[universal portable ZIP](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/tag/v0.3.2-portable.2).
Users extract one folder and open `Start-Hackathon-Facilitator.cmd`; there is no
Store installation, admin requirement or separate Node/npm setup.

The package contains native x64 and ARM64 payloads and automatically selects the
matching official Node runtime. It starts the unchanged full Next.js application
behind a fresh-capability local browser gateway. Both listeners bind to numeric
loopback only, anonymous gateway/backend requests are rejected, and inherited
cloud credentials/runtime injection variables are not passed to the backend.

| Portable full-app check | x64 | Native ARM64 |
| --- | --- | --- |
| Complete ZIP extraction, architecture selection and payload hashes | Passed | Passed |
| Upstream Authenticode signature on bundled Node runtime | Passed | Passed |
| Six fictional seed cases only | Passed | Passed |
| Create/evaluate use case and generate mock build guide | Passed | Passed |
| Production/CAF guards, shared handoff and readiness persistence | Passed | Passed |
| Dashboard, print-ready view and CSV export | Passed | Passed |
| Graceful stop, restart and saved-workspace preservation | Passed | Passed |
| Timestamped local database backup | Passed | Passed |

[Native CI evidence](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/39904667838).
The exact CI-produced candidate was also downloaded and passed the complete
lifecycle again on native ARM64 before publication. After publication, the
release asset was downloaded back from GitHub; its SHA-256 matched and the full
startup, workflow, restart/data-preservation and backup lifecycle passed again
on native ARM64.

Package: `Hackathon-Facilitator-Full-Portable-0.3.2.zip`,
**145,160,646 bytes**. SHA-256:

```text
aa2fa0f9fc2ffc819e2cede845942d4d5c479ccd13b935abe5c7cf9ca1f172a2
```

The `v0.3.2-portable.2` package also replaces a `cmd.exe start` invocation that
could hang after a successful backend start. It now calls the Windows URL
protocol handler directly. The packaged automatic-open path was exercised on
native Windows ARM64; when browser launch is blocked, the app remains running
and prints the protected manual URL.

The ZIP is not a Store-certified or Authenticode-signed installer. Windows or
organizational policy may still block downloaded CMD/binary files; no protection
was disabled or bypassed. The app remains local, single-user and mock-AI only.

## Optional light Browser Edition — 22 October 2026

The reduced
[GitHub Pages Browser Edition](https://horvathdaniel-2002.github.io/hackathon-facilitator-agent/)
remains available as an optional Kanban-only companion.
It requires no download, installer, account, subscription, Azure key or admin
rights, but it does not include the full evaluator, build guides, contacts or
server-backed workspace.

The browser edition is now an installable progressive web app. After one
successful online load, its allowlisted static files are cached for offline
reopening. Workspace records remain in IndexedDB in that browser profile; the
service worker does not upload or synchronize workspace data.

| Check | Result |
| --- | --- |
| Domain, validation, backup and strict deployment-allowlist tests | **10 passed** |
| Complete Chromium browser workflows | **19 passed** |
| Complete Firefox browser workflows | **19 passed** |
| Manifest, install metadata, service-worker control and offline reload | **Passed in both browsers** |
| Persistence, handoffs, readiness, production/CAF guards and exports | **Passed in both browsers** |
| Multi-tab conflict, failed/corrupt storage and untrusted-text handling | **Passed in both browsers** |
| Responsive layouts from 320 to 1920 pixels and dark mode | **Passed in both browsers** |

The same checks gate every
[Browser Edition deployment](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/workflows/deploy-browser.yml).
GitHub Pages and browser/network policy can still block access. Local browser
storage is neither an encrypted user boundary nor a durable backup; users must
download JSON backups and use approved, non-sensitive data.

## One-click full desktop app — 28 September 2026

Version **0.3.2** changes packaging, not the original application's functionality.
The `app/` source, Electron main process, runtime and security policy are unchanged
from the preceding source revision. The browser companion is not bundled in place
of the full app.

One offline EXE contains the native x64 and ARM64 payloads. It installs with
**no command-line arguments and no wizard clicks**, then automatically opens the
full app. The same exact EXE passed all four
[native lifecycle scenarios](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36470901171):

| Scenario | x64 | Native ARM64 |
| --- | --- | --- |
| Fresh, default per-user installation and automatic full-app launch | Passed | Passed |
| Upgrade over the published v0.3.1 app in an existing custom directory | Passed | Passed |
| Full workflow, mock evaluation/build guide, CAF/production guards, handoff and readiness | Passed | Passed |
| Print-ready view, CSV, tray restore, single instance and graceful Quit | Passed | Passed |
| One-click reinstall, automatic relaunch and saved-data preservation | Passed | Passed |
| Uninstall removes program/shortcuts/registration but retains data | Passed | Passed |

Both native payload jobs also passed **62 desktop tests**. The automatically
launched instance was observed through its real visible window, native bundled
Node child and loopback listener; unauthenticated health requests were rejected.
Only observed test-owned PIDs were stopped before the separate full UI workflow,
which verifies normal graceful Quit.

Installer: `Hackathon-Facilitator-Setup-0.3.2.exe`, **429,427,789 bytes**.
SHA-256:

```text
e9dce7e06329fee81db78cd92b8778ae3ceb38ce2aa03a8259f7bac56bc58212
```

The installer is **NotSigned**, not Store-approved. Interactive SmartScreen,
corporate policy, manual print/save dialogs and arbitrary future schema migrations
remain outside this result. No security setting, trust root, Defender exclusion
or organizational policy was changed.

## Earlier full web application baseline — 25 September 2026

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

## Earlier v0.3.1 desktop and installer baseline

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

The complete lifecycle was repeated successfully **after publication**, downloading
both installers from the public release and checking their published hashes:
[published-installer verification](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36101143870).

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

Source-bundle verification also caught two CRLF/LF normalization mismatches in
the first v0.3.1 archive's manifest. The source-only download was corrected as
`hackathon-facilitator-0.3.1-source-r2.zip`; the signed-off installer bytes did not
change. The checksum file names the corrected source archive explicitly.

## What this does not establish

- The installers remain **unsigned**. SmartScreen, endpoint protection and
  organizational application-control approval remain environment-dependent;
  no protections were disabled.
- The earlier v0.3.1 installer automation used silent installation and did not
  click its Finish checkbox. The new v0.3.2 check above verifies no-argument
  installation and automatic launch; that installer has no Finish checkbox.
- The native export Save dialog is approved to a temporary file by the test
  driver; manual save/print dialogs and taskbar pinning are not automated.
- Same-version reinstallation and schema-preservation/refusal rules are tested;
  arbitrary future-version database migrations are not certified.
- Real Microsoft Entra SSO, Work IQ access, live Azure model quality, corporate
  approval and production hosting are not established by these results.
- Mock scores and successful software tests are **not** measured model accuracy,
  achieved customer savings or program eligibility.
