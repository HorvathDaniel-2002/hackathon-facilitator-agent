param([Parameter(Mandatory)][string]$FilePath)
$ErrorActionPreference = 'Stop'
if ($env:SIGNING_ENABLED -cne 'true') { throw 'Signing is not enabled.' }
Import-Module ArtifactSigning -RequiredVersion 0.1.20 -ErrorAction Stop
$parameters = @{
    Endpoint = $env:SIGNING_ENDPOINT
    CodeSigningAccountName = $env:SIGNING_ACCOUNT_NAME
    CertificateProfileName = $env:SIGNING_CERTIFICATE_PROFILE
    Files = (Resolve-Path -LiteralPath $FilePath).Path
    FileDigest = 'SHA256'
    TimestampRfc3161 = 'http://timestamp.acs.microsoft.com'
    TimestampDigest = 'SHA256'
    ExcludeEnvironmentCredential = $true
    ExcludeWorkloadIdentityCredential = $true
    ExcludeManagedIdentityCredential = $true
    ExcludeSharedTokenCacheCredential = $true
    ExcludeVisualStudioCredential = $true
    ExcludeVisualStudioCodeCredential = $true
    ExcludeAzureCliCredential = $false
    ExcludeAzurePowerShellCredential = $true
    ExcludeAzureDeveloperCliCredential = $true
    ExcludeInteractiveBrowserCredential = $true
}
# azure/login performs the federated login; no credential-chain fallback is allowed.
Invoke-ArtifactSigning @parameters
& (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $FilePath
