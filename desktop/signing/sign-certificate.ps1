param(
    [string]$FilePath,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
if ($env:SIGNING_ENABLED -cne 'true' -or $env:SIGNING_PROVIDER -cne 'certificate-store') {
    throw 'Explicit certificate-store signing approval is required.'
}
$thumbprint = $env:SIGNING_CERTIFICATE_SHA1
if ($thumbprint -notmatch '^[a-fA-F0-9]{40}$') { throw 'An exact certificate thumbprint is required.' }
$certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumbprint" -ErrorAction Stop
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) {
    throw 'The selected certificate is expired, not yet valid, or its hardware/cloud private key is unavailable.'
}
if (-not $env:SIGNING_PUBLISHER_SUBJECT -or $certificate.Subject -cne $env:SIGNING_PUBLISHER_SUBJECT -or
    -not $env:SIGNING_CERTIFICATE_ISSUER -or $certificate.Issuer -cne $env:SIGNING_CERTIFICATE_ISSUER -or
    $certificate.Subject -ceq $certificate.Issuer) {
    throw 'The certificate does not match the selected CA-issued personal/organizational identity.'
}
$ekus = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
    ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
if ('1.3.6.1.5.5.7.3.3' -notin $ekus) { throw 'Select a code-signing certificate, not a document/e-mail certificate.' }
$chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
try {
    $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::Online
    $chain.ChainPolicy.VerificationFlags = [Security.Cryptography.X509Certificates.X509VerificationFlags]::NoFlag
    $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(30)
    $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    if (-not $chain.Build($certificate)) { throw 'The certificate chain/revocation check failed. Do not add a root certificate or disable validation to bypass this.' }
} finally { $chain.Dispose() }
$tool = (Get-Item -LiteralPath $env:SIGNING_SIGNTOOL_PATH -ErrorAction Stop).FullName
$toolSignature = Get-AuthenticodeSignature -LiteralPath $tool
if ($toolSignature.Status -ne 'Valid' -or
    $toolSignature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Microsoft Corporation') {
    throw 'Use a valid Microsoft-signed SignTool from the Windows SDK.'
}
if ($CheckOnly) {
    Write-Output 'Selected certificate, key availability, chain, validity and Microsoft SignTool verified. No file was signed.'
    return
}
if (-not $FilePath) { throw 'A specific file is required for signing.' }
$file = (Get-Item -LiteralPath $FilePath -ErrorAction Stop).FullName
$timestamp = [Uri]$env:SIGNING_TIMESTAMP_URL
if (-not $timestamp.IsAbsoluteUri -or $timestamp.Scheme -notin @('http','https') -or $timestamp.UserInfo) {
    throw 'Configure the certificate provider-approved RFC3161 timestamp URL.'
}
# The provider's token/SimplySign session supplies the private key; no PFX or PIN is passed.
& $tool sign /s My /sha1 $thumbprint /fd SHA256 /tr $env:SIGNING_TIMESTAMP_URL /td SHA256 $file
if ($LASTEXITCODE -ne 0) { throw 'SignTool failed. Review the provider session/PIN prompt; no unsigned fallback is allowed.' }
& (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $file
