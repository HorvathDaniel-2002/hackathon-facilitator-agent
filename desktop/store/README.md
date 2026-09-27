# Microsoft Store MSIX preparation

**Status: packaging prepared; no Store account/product identity has been supplied.
Not submitted, certified or available in the Store.**

This route does not require buying a public code-signing certificate for the
MSIX submission. Microsoft re-signs the package **after Store certification**.
It does not make the current GitHub EXE installers signed, and an unsigned
MSIX downloaded directly from GitHub is not a trusted public installer.

## Preparation verification

On 27 September 2026, the [native x64 and ARM64 workflow](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36307079073)
passed all 60 desktop tests, rebuilt the app, generated MSIX with Microsoft
MakeAppx manifest validation enabled, and compared every staged file with its
packaged bytes. These builds used **LocalValidation.HackathonFacilitator**, not
a reserved Store identity. Only the manifests/reports are retained for that mode.

The [existing EXE install/reinstall/uninstall checks](https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/actions/runs/36306445753)
also passed on both architectures after the Store-specific runtime change.
Neither check validates an actual Store installation, update, file-system
virtualization, WACK certification or Store acceptance. Those remain required
before a Store release. The published v0.3.1 EXE binaries were not replaced.

## What the publisher needs to do once

1. Start at [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com).
   The current new onboarding flow advertises no registration fee; identity
   verification and agreements still apply.
2. Choose the account type that matches the project. Microsoft's current
   instructions place professional/business-related distribution and teams
   within a company under **Company** accounts. Individual accounts are for the
   personal/hobby/non-professional cases described in its policy. Do not select
   a personal category merely to bypass a company's publishing rules.
3. Complete identity verification and review/accept the agreements yourself.
   Never put ID images, passwords or verification codes in chat or GitHub.
4. Create a **Windows MSIX app** and reserve its name. Name availability is not
   guaranteed. Do not choose the EXE/MSI listing path: that path still needs
   publisher signing.
5. Under **Product management > Product identity**, copy these exact fields:
   - `Package/Identity/Name`
   - `Package/Identity/Publisher`
   - `Package/Properties/PublisherDisplayName`
   Also record the reserved display name and Store product ID.

Those identity fields are **not private keys or passwords**. They are required
for a real Store package. No identity is invented by this project.

## Build configuration

The `Prepare Microsoft Store MSIX` GitHub workflow is manual. It has two modes:

- **validation**: uses a clearly labeled local test identity in disposable CI,
  builds both architectures and validates with Microsoft MakeAppx. The fixture
  MSIX is not published as a user download or a submission artifact.
- **submission**: refuses to start until the following repository variables are
  supplied from the actual Partner Center product:

| Variable | Value |
| --- | --- |
| `STORE_IDENTITY_CONFIRMED` | `true`, only after checking the actual product |
| `STORE_IDENTITY_NAME` | Exact `Package/Identity/Name` |
| `STORE_PUBLISHER` | Exact `Package/Identity/Publisher`, normally `CN=<UUID>` |
| `STORE_PUBLISHER_DISPLAY_NAME` | Exact registered publisher display name |
| `STORE_DISPLAY_NAME` | Exact reserved app name |
| `STORE_PACKAGE_VERSION` | Four-part Store version, e.g. `1.0.0.0` |

The first version component must be nonzero; the fourth must be `0` for Store
submission. Increase the version for subsequent submissions. The Store package
version is independent from the existing desktop preview's `0.3.1` version.

From the `desktop` folder on a build machine with Node.js 24 and the Microsoft
Windows SDK:

```powershell
npm ci
npm test
npm run prepare:app
npm run store:pack -- --x64
npm run store:check
npm run store:package -- --arch x64 --input .\dist-store\win-unpacked --output .\store-output
```

Build the ARM64 backend on an ARM64 runner and use `--arm64` /
`dist-store\win-arm64-unpacked`. The Store unpacked build omits the NSIS elevation
helper and uses a separate output tree. MakeAppx validates the manifest and emits unsigned
`.msix` files plus checksums. They are for **Partner Center review**, not ordinary
double-click distribution. The workflow does not sign, install, upload to the
Store, create a publisher account or accept terms.

## Desktop behavior and capabilities

The package retains the Electron window, notification-area tray, bundled Node
backend, synthetic first-run data, mock AI, sandboxed renderer and per-launch
loopback capability. The app is a **packaged classic desktop process**, not a
UWP AppContainer application.

`runFullTrust` is the only requested restricted capability. It is required to
run the Electron desktop process and its bundled local Node child at normal
user privilege. It does not request administrator elevation. Explain this use
in certification notes; restricted-capability approval is not guaranteed.
The Store may install the declared Microsoft Visual C++ Desktop framework
dependency. No separate Node.js installation is needed.

When Windows reports an MSIX package identity, the app does not override Windows'
AppUserModelID with the NSIS ID. This keeps Start/taskbar identity package-managed.
No forced taskbar pin, start-at-login task, Windows service or custom uninstaller
is included. The user can pin the app through normal Windows UI.

## Data and transition from the EXE preview

The MSIX app uses a separate **Hackathon Facilitator Store** user-data directory
under the package-managed AppData environment. It does not automatically adopt,
reset, move or delete the existing NSIS/web-app profile.

**Unlike the NSIS preview, uninstalling/resetting the MSIX can remove its
package-managed data.** Before uninstall/reset, quit the app completely and
back up the database and schema marker via the tray's **Open data folder**.
Keep backups outside the package-managed directory. Windows Store updates normally
preserve application data, but this must be confirmed with the real signed Store
package during certification testing. Do not promise NSIS-style retention on
MSIX uninstall.

The package installation directory is read-only. No runtime installer, package
manager or cloud model provisioning runs on first launch. All user changes belong
in the app's data folder, not the installed program tree.

## Submission materials and remaining checks

- [Store listing and certification notes draft](submission-draft.md)
- [Desktop privacy notice](../../docs/desktop-privacy.md)
- Existing safe public screenshots: `media/kanban-progress.png`,
  `media/kanban-route.png`, `media/handoff-panel.png`

Before submission the owner must confirm identity, account eligibility, IP/reuse
rights, the privacy/support URLs, pricing/markets, age-rating answers and required
Store form fields. Run the Windows App Certification Kit and test installation,
update, full-trust local backend, tray restore, export and data behavior using an
approved package test route. Packaging checks alone are not Store certification.
No self-signed root, Developer Mode change or SmartScreen bypass is performed by
the packaging scripts.

## References

- [Developer account creation and account types](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account)
- [Partner Center identity fields](https://learn.microsoft.com/en-us/windows/apps/publish/view-app-identity-details)
- [MSIX Store re-signing versus EXE/MSI signing](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [Manual MSIX generation with MakeAppx](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)
- [Packaged desktop restrictions, including AUMID](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-prepare)
- [Package storage and uninstall behavior](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)
