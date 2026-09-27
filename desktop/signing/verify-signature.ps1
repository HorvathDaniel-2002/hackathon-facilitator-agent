param(
    [Parameter(Mandatory)][string]$FilePath,
    [switch]$UpstreamNode
)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $FilePath).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolved
if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
    throw 'A valid, trusted Authenticode signature is required. Unsigned, invalid and self-signed fallback artifacts are rejected.'
}
$certificate = $signature.SignerCertificate
if ($UpstreamNode) {
    if ($certificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'OpenJS Foundation') {
        throw 'Bundled Node must retain its valid original OpenJS signature.'
    }
    return
}
if (-not $env:SIGNING_PUBLISHER_SUBJECT -or $certificate.Subject -cne $env:SIGNING_PUBLISHER_SUBJECT) {
    throw 'The signing certificate subject differs from the approved publisher.'
}
if (-not $signature.TimeStamperCertificate) { throw 'The signed artifact lacks a trusted timestamp.' }
$ekus = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
    ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object { $_.Value })
if ('1.3.6.1.5.5.7.3.3' -notin $ekus) { throw 'The certificate is not a code-signing certificate.' }
if ($env:SIGNING_PROVIDER -eq 'certificate-store') {
    if ($env:SIGNING_CERTIFICATE_SHA1 -notmatch '^[a-fA-F0-9]{40}$' -or
        $certificate.Thumbprint -ine $env:SIGNING_CERTIFICATE_SHA1 -or
        -not $env:SIGNING_CERTIFICATE_ISSUER -or
        $certificate.Issuer -cne $env:SIGNING_CERTIFICATE_ISSUER -or
        $certificate.Subject -ceq $certificate.Issuer) {
        throw 'The signature is not from the selected trusted CA-issued certificate.'
    }
} elseif (-not $env:SIGNING_PROVIDER -or $env:SIGNING_PROVIDER -eq 'artifact-signing') {
    foreach ($required in @('1.3.6.1.4.1.311.97.1.0', $env:SIGNING_PROFILE_EKU)) {
        if (-not $required -or $required -notin $ekus) { throw 'The signature is not from the approved Public Trust code-signing profile.' }
    }
} else {
    throw 'Unknown signing provider.'
}
Write-Output "Verified trusted publisher and timestamp: $([IO.Path]::GetFileName($resolved))"
