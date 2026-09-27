param([Parameter(Mandatory)][ValidateSet('x64','arm64')][string]$Architecture)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$output = Join-Path $root 'dist-signed'
$unpacked = if ($Architecture -eq 'x64') { 'win-unpacked' } else { 'win-arm64-unpacked' }
$app = Join-Path $output "$unpacked\Hackathon Facilitator.exe"
$node = Join-Path $output "$unpacked\resources\backend\node\node.exe"
$installerName = "Hackathon-Facilitator-Setup-$version-$Architecture-signed.exe"
$installer = Join-Path $output $installerName
foreach ($file in @($app, $installer)) { & (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $file }
& (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $node -UpstreamNode
$receipts = @(Get-Content -LiteralPath (Join-Path $output 'signing-receipts.jsonl') |
    ForEach-Object { $_ | ConvertFrom-Json })
foreach ($expected in @("$unpacked/Hackathon Facilitator.exe", $installerName, ($installerName -replace '\.exe$', '.__uninstaller.exe'))) {
    if (-not @($receipts | Where-Object { $_.file -ceq $expected -and $_.result -eq 'publisher-and-timestamp-verified' }).Count) {
        throw "Missing verified signing receipt for $expected"
    }
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $output "$installerName.sha256"), "$hash  $installerName`n")
Write-Output 'App, embedded uninstaller signing receipt, installer and original Node signature verified. This does not certify SmartScreen reputation or corporate approval.'
