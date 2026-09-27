$ErrorActionPreference = 'Stop'
$verifier = Join-Path $PSScriptRoot '..\signing\verify-signature.ps1'
$env:SIGNING_PUBLISHER_SUBJECT = 'CN=Example Publisher, O=Example Publisher, C=US'
$env:SIGNING_PROFILE_EKU = '1.3.6.1.4.1.311.97.1234.5678.9012'
function New-Fixture {
    $certificate = [pscustomobject]@{
        Subject = $env:SIGNING_PUBLISHER_SUBJECT
        Extensions = @([pscustomobject]@{
            Oid = [pscustomobject]@{ Value = '2.5.29.37' }
            EnhancedKeyUsages = @('1.3.6.1.5.5.7.3.3','1.3.6.1.4.1.311.97.1.0',$env:SIGNING_PROFILE_EKU) |
                ForEach-Object { [pscustomobject]@{ Value = $_ } }
        })
    }
    $certificate | Add-Member -MemberType ScriptMethod -Name GetNameInfo -Value { 'OpenJS Foundation' }
    [pscustomobject]@{ Status = 'Valid'; SignerCertificate = $certificate; TimeStamperCertificate = [pscustomobject]@{} }
}
function Get-AuthenticodeSignature { param([string]$LiteralPath) return $global:HFSigningTestFixture }
function Assert-Rejected {
    $rejected = $false
    try { & $verifier -FilePath $PSCommandPath } catch { $rejected = $true }
    if (-not $rejected) { throw 'Expected signature rejection.' }
}
$global:HFSigningTestFixture = New-Fixture
& $verifier -FilePath $PSCommandPath
$global:HFSigningTestFixture.Status = 'NotSigned'
Assert-Rejected
$global:HFSigningTestFixture = New-Fixture
$global:HFSigningTestFixture.SignerCertificate.Subject = 'CN=Different Publisher'
Assert-Rejected
$global:HFSigningTestFixture = New-Fixture
$global:HFSigningTestFixture.TimeStamperCertificate = $null
Assert-Rejected
$global:HFSigningTestFixture = New-Fixture
$global:HFSigningTestFixture.SignerCertificate.Extensions = @()
Assert-Rejected
$global:HFSigningTestFixture = New-Fixture
& $verifier -FilePath $PSCommandPath -UpstreamNode
Remove-Variable HFSigningTestFixture -Scope Global
Write-Output 'Signature decision tests passed with mocked certificate metadata only. No certificate or key was generated.'
