# Trusted signing setup — administrator handoff

**Status: prepared, not enabled.** The published v0.3.1 installers remain
unsigned. No signing account, paid service, certificate, new trust root or
permission was created. No trusted-signed release has been produced.

Edge's “isn't commonly downloaded” message concerns reputation. Code signing
establishes an authenticated publisher and artifact integrity; it does **not**
guarantee immediate removal of all SmartScreen warnings or corporate approval.
Keep SmartScreen, antivirus and application-control policies enabled.

## 1. Approve the publisher and service

An authorized owner must approve the publisher, IP/distribution rights, subscription
costs and signing policy. Employment at Microsoft or a `@microsoft.com` attribution
does not authorize signing as Microsoft Corporation.

The prepared workflow uses **Azure Artifact Signing Public Trust** (formerly
Trusted Signing). An approved Microsoft-internal signing service may be the
appropriate corporate route instead. Do not connect a personal repository to
corporate signing infrastructure without that infrastructure owner's approval.

**Check eligibility before buying/provisioning anything.** Microsoft's quickstart,
checked 27 September 2026, lists Public Trust organizations in the EU and several
other markets, but individual developers only in the US/Canada. If you are applying
as a Hungary/EU individual rather than an eligible organization, this route may
not be available. An authorized organizational publisher or a suitable publicly
trusted certificate provider is required; do not invent organization details.

For the prepared route, an administrator must create:

1. An approved Azure subscription/resource group and Artifact Signing account.
2. A completed **Public Trust identity validation** in Azure Portal.
3. A **Public Trust certificate profile**, not Private Trust or Public Trust Test.
4. A dedicated Entra application/service principal with federated credentials;
   no client secret, PFX export or Microsoft Graph permission is needed.
5. **Artifact Signing Certificate Profile Signer** at the specific profile scope.
   Ordinary Azure Contributor/Owner does not itself grant this signing role.

The service's private signing key stays managed by the service. Do not send keys,
PFX files, passwords or tokens to chat or commit them to GitHub.

## 2. Restrict GitHub and OIDC before enabling

Repository: `HorvathDaniel-2002/hackathon-facilitator-agent`.

Create GitHub environment **`release-signing`** with:

- Required independent reviewers and prevention of self-review, where supported.
- Deployment branch restriction: **`main` only**.
- Appropriate restrictions on administrator bypass.
- Protected/reviewed changes to `.github/workflows`, `desktop/signing`, packaging
  configuration and dependency lockfiles.

Use this Entra federated credential:

| Field | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Audience | `api://AzureADTokenExchange` |
| Subject | `repo:HorvathDaniel-2002@255726314/hackathon-facilitator-agent@1366069279:environment:release-signing` |

This repository's live OIDC configuration uses **immutable subject IDs**, confirmed
through the GitHub API on 27 September 2026. Do not copy an old name-only
`repo:owner/repo:environment:...` example. Recheck the repository's OIDC
configuration if it is transferred, renamed or its subject template changes.
The environment restriction is essential: the environment replaces the branch
portion of the OIDC subject. The workflow also refuses to run outside `main`.

Store these **environment variables** in `release-signing` (identifiers, not keys):

| Variable | Required value |
| --- | --- |
| `SIGNING_ENABLED` | Set to `true` **only after** identity, permissions and environment protection are approved |
| `AZURE_TENANT_ID` | Tenant UUID for the dedicated signing service principal |
| `AZURE_CLIENT_ID` | Application/client UUID |
| `AZURE_SUBSCRIPTION_ID` | Approved subscription UUID |
| `SIGNING_ENDPOINT` | Account's exact regional URL, for example `https://weu.codesigning.azure.net` |
| `SIGNING_ACCOUNT_NAME` | Existing approved signing account name |
| `SIGNING_CERTIFICATE_PROFILE` | Existing Public Trust profile name |
| `SIGNING_PUBLISHER_SUBJECT` | Exact Subject DN from the verified certificate/profile, starting `CN=` |
| `SIGNING_PROFILE_EKU` | Profile-specific Public Trust EKU from that profile's certificate |

The common Public Trust EKU is `1.3.6.1.4.1.311.97.1.0`; do **not** enter that as
the profile-specific EKU. Use the actual additional `1.3.6.1.4.1.311.97.…` value
for the profile. Certificates rotate frequently; pinning a leaf-certificate
thumbprint is not a durable substitute. Copy the DN/EKU from the profile's
certificate details or an admin-approved sample signature, never guess them.

If using another corporate signing provider, adapt the signing hook with its
owner; the current Public Trust checks deliberately reject substitutes.

## 3. What the prepared workflow does

Run **Prepare trusted-signed Windows candidate** manually from Actions on `main`.
The “authorized publisher/signing charges” checkbox defaults to false. The
`release-signing` environment approval remains required.

The jobs:

1. Fail early if signing is not configured. No Azure login occurs at this point.
2. Build native x64/ARM64 backend payloads without any signing identity.
3. Transfer those payloads to **Windows x64 signing runners**. Microsoft's signing
   tools do not support native ARM64 runners; x64 tools sign/package the ARM64
   files without executing them.
4. Authenticate with GitHub OIDC through `azure/login`. The signing module uses
   only that Azure CLI credential; all other credential-chain entries are excluded.
5. Build with `forceCodeSigning`, a custom signing hook and SHA-256/timestamping.
   Sign the app executable, the embedded uninstaller and the installer. Preserve
   the original signed OpenJS Node runtime after matching its recorded hash.
6. Require valid Authenticode trust, exact approved publisher DN, Public Trust and
   profile EKUs, and a timestamp. Missing/invalid signatures abort the build.
7. Run the real install/use/reinstall/uninstall tests on native x64 and ARM64.
   The tests verify the installed app and uninstaller signatures too.
8. Retain only verified candidates for human release review. **No workflow publishes
   them automatically or changes a current release.**

The normal `npm run dist` remains an explicitly **unsigned preview** build.
The separate `npm run dist:signed -- --arch x64` path writes to `dist-signed`
and has **no unsigned fallback**. Running it without approved settings fails.
Pinned `ArtifactSigning` PowerShell module version: **0.1.20**.

## 4. Release and reputation follow-up

Before the first real signed release:

- Bump to a new desktop version; do not silently replace v0.3.1's verified files.
- Review signing receipts and post-signing checksums, and repeat download/install
  tests on the exact signed bytes. Update the release metadata and documentation.
- Have the approved IT/distribution owner review Company Portal/Intune delivery
  if this is a corporate application. This preparation does not create that approval.
- If SmartScreen still flags the approved build, the publisher can use Microsoft's
  official file-review portal and select **Microsoft Defender SmartScreen**.
  Review is discretionary and no disappearance date is guaranteed. No file has
  been submitted for review by this setup.

Do not rename/repack files to evade detection, install a self-signed root on user
devices or disable warning policies. The existing Word/PowerPoint/PDF materials
remain available without running an installer.

## Administrator request (copy-ready)

> Please review the publisher/IP and public distribution of Hackathon Facilitator
> (Daniel Horvath, dahorvath@microsoft.com). The repository has a prepared manual
> OIDC-based Public Trust signing workflow with no automatic release. Please
> identify the approved corporate signing route, or provision an eligible
> Artifact Signing identity/profile and least-privilege service principal.
> Protect the GitHub `release-signing` environment, provide the non-secret
> configuration above and confirm any signing costs. We need approval for the
> app, uninstaller and installer signatures; we are not requesting a SmartScreen
> bypass, a private-key export or blanket tenant permissions.

## Validation scope and sources

Configuration/target restrictions and signature-verification failure paths are
covered by offline tests with mocked certificate metadata. The pinned Microsoft
module was inspected for the required parameter names without signing anything.
A real signed build, OIDC trust exchange and removal of the reputation warning
**cannot be verified until an approved signing account/profile is available**.

Verified public references (27 September 2026):

- [Artifact Signing prerequisites and identity eligibility](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
- [Resources, trust types and least-privilege roles](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-resources-roles)
- [Signing integrations and timestamp requirements](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
- [Certificate profile EKUs and rotation](https://learn.microsoft.com/en-us/azure/artifact-signing/concept-certificate-management)
- [Official GitHub integration, supported runners and OIDC](https://github.com/Azure/artifact-signing-action)
- [GitHub OIDC subject configuration](https://docs.github.com/en/actions/reference/security/oidc)
- [Edge download-reputation warnings](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-security-smartscreen)
- [Microsoft file-review portal](https://www.microsoft.com/wdsi/filesubmission/)
