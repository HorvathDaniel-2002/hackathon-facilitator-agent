# Personal code signing from Hungary

**Selected route:** a publicly trusted CA-issued **individual code-signing
certificate**, used through Windows' current-user certificate store. No Azure
subscription, Microsoft-internal signing access or client secret is needed for
this route. The app is signed under the subscriber's validated legal identity,
not as Microsoft Corporation.

**Current state:** technical support is prepared. No certificate has been bought
or issued, no payment or identity verification has been performed, and the
published installers remain unsigned.

## Certificate option and purchase boundary

A documented option is [Certum Standard Code Signing in the Cloud](https://shop.certum.eu/standard-code-signing-in-the-cloud.html).
The official product specification permits **natural-person data**, natural-person
plus organization data, or organization data. Its [identity requirements](https://support.certum.eu/en/code-signing-required-documents/)
explicitly include individual applicants and require identity verification plus
a utility bill issued to the subscriber.

As checked on **27 September 2026**, the official page shows a starting price
of **EUR 209**. This is a displayed starting price, not a binding quote for a
particular term, tax treatment or Hungarian application. Confirm the selected
duration, total price and renewal/reissue terms before paying.

Before ordering, ask Certum to confirm:

> I am a natural person resident in Hungary, not applying for an organizational
> certificate. I need Standard Code Signing in the Cloud to Authenticode-sign
> Windows EXE installers under my own legal name using SimplySign Desktop and
> Microsoft SignTool. Please confirm current eligibility, accepted Hungarian
> identity/address documents, total price and term, which personal details will
> appear publicly in the certificate, and the approved SHA-256 RFC3161 timestamp
> service URL.

Use [Certum's official contact channel](https://www.certum.eu/en/contact/).
The pages reviewed establish individual support but do not explicitly enumerate
Hungary-specific acceptance; do not treat that final eligibility as verified.

The cheaper **Open Source Code Signing** product is not assumed appropriate:
a public GitHub repository is not automatically an open-source-licensed project.
This project currently makes no open-source license grant. Do not change the
project's licensing merely to qualify for a discount.

Do not buy a document-signing/electronic-signature certificate or an EV
organization-only product as a substitute. The needed certificate must support
the code-signing EKU and Windows Authenticode for a natural-person publisher.

## What the applicant must do

1. Confirm product eligibility and the final price, then order directly with the
   provider if acceptable. This preparation does not authorize a purchase.
2. Complete identity/address verification in the provider's secure portal.
   Do not put ID photos, bills or verification codes in chat, GitHub or this app.
3. Activate the cloud certificate and install the provider's official
   **SimplySign mobile application** and **SimplySign Desktop**. The product uses
   a cloud virtual cryptographic card; it does not require a physical card/reader.
4. Authenticate to the signing session through the provider's application.
   Its key remains cloud/HSM-backed. Do not export a private key or place a
   password/PIN in an environment variable, source file or workflow.
5. Install **PowerShell 7** and the official **Windows SDK SignTool** on the
   signing workstation. These are publisher build tools, not end-user prerequisites.

An unlocked signing session authorizes signatures. Keep it short-lived and sign
only reviewed builds. The store integration authenticates the publisher; it does
not grant permission to publish corporate intellectual property or bypass a
managed computer's software policy.

## Configure the already-issued certificate

The provider's certificate must be visible with its key through
`Cert:\CurrentUser\My`. Inspect only public metadata:

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Select-Object Subject, Issuer, Thumbprint, NotBefore, NotAfter, HasPrivateKey
```

Set these values in the local publisher terminal; replace the prompts with actual
certificate/tool details. Do not copy the literal prompts into a signing run:

```powershell
$env:SIGNING_PROVIDER = 'certificate-store'
$env:SIGNING_ENABLED = 'true'
$env:SIGNING_CERTIFICATE_SHA1 = '<exact 40-hex certificate thumbprint>'
$env:SIGNING_PUBLISHER_SUBJECT = '<exact issued Subject DN beginning CN=>'
$env:SIGNING_CERTIFICATE_ISSUER = '<exact issued Issuer DN beginning CN=>'
$env:SIGNING_SIGNTOOL_PATH = '<full local Windows SDK path to signtool.exe>'
$env:SIGNING_TIMESTAMP_URL = '<provider-approved RFC3161 timestamp URL>'
```

`SIGNING_CERTIFICATE_SHA1` is a **certificate selector**, not the file signature
algorithm: files and timestamp digests are explicitly **SHA-256**. The provider's
verified spelling of the legal name must be used; do not assume the display name
in the app is identical to the certificate DN.

From the `desktop` folder:

```powershell
npm run signing:check
pwsh -NoProfile -File .\signing\sign-certificate.ps1 -CheckOnly
```

The second command checks certificate/key availability, dates, exact subject and
issuer, code-signing usage, online chain/revocation and Microsoft SignTool's own
signature. It signs nothing. A missing/offline key or untrusted chain fails
explicitly; no root certificate is installed or validation disabled.

## Sign and release a reviewed build

Prepare the reviewed native backend as described in the desktop build guide.
The payload architecture and app version must match. Build each installer using:

```powershell
npm run dist:signed -- --arch x64
# Or --arch arm64 with its separately prepared matching payload.
```

The hook signs the app, embedded uninstaller and installer through the selected
certificate, preserves the original OpenJS Node signature, verifies the result
and writes receipts. Output goes to `dist-signed` with `-signed.exe` filenames.
It never falls back to publishing an unsigned build.

Provider PIN/session confirmation may require the publisher's interaction. This
local certificate-store route is **not** silently converted to a hosted CI token,
PFX secret or unattended GitHub signing job. The existing Azure workflow remains
explicitly on the separate `artifact-signing` provider.

Before distributing, use a new release version, verify the exact signed bytes,
repeat x64/ARM64 installation and data-preservation tests, and update checksums.
The current unsigned release is not overwritten automatically.

**SmartScreen:** a verified signature establishes the publisher and file
integrity. Reputation may still take time, and managed-device approval remains
separate. Do not promise that the first signed build cannot show a warning.

## Current verification boundary

Configuration and signature decision paths are tested offline with synthetic
metadata. No actual CA certificate/key is available yet, so provider login,
hardware/cloud key access, live revocation checking and signing remain unverified.

Sources:

- [Standard Cloud Code Signing product and technical requirements](https://shop.certum.eu/standard-code-signing-in-the-cloud.html)
- [Individual identity/address documents](https://support.certum.eu/en/code-signing-required-documents/)
- [Provider SignTool instructions](https://support.certum.eu/en/signing-the-code-using-tools-like-signtool-and-jarsigner-instruction/)
- [Open Source product's licensing restriction](https://shop.certum.eu/open-source-code-signing-on-simplysign.html)
- [Azure Artifact Signing eligibility — a different provider path](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)
