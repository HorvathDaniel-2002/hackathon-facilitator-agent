param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = (Resolve-Path -LiteralPath $Directory).Path
$report = Get-Content -LiteralPath (Join-Path $root 'package-report.json') -Raw | ConvertFrom-Json
$package = Join-Path $root $report.packageName
if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $report.sha256) {
    throw 'MSIX bytes do not match their recorded checksum.'
}
$archive = [IO.Compression.ZipFile]::OpenRead($package)
try {
    if ($archive.GetEntry('AppxSignature.p7x')) { throw 'Unexpected local signature. Store submission must not be disguised as a trusted standalone installer.' }
    foreach ($name in @('AppxManifest.xml','AppxBlockMap.xml','[Content_Types].xml',
        'app/Hackathon Facilitator.exe','app/resources/app.asar','app/resources/backend/node/node.exe',
        'app/resources/backend/server/server.js','app/resources/backend/template.db',
        'Assets/StoreLogo.png','Assets/Square44x44Logo.png','Assets/Square150x150Logo.png')) {
        if (-not $archive.GetEntry($name)) { throw "Required MSIX component missing: $name" }
    }
    $reader = [IO.StreamReader]::new($archive.GetEntry('AppxManifest.xml').Open())
    try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($manifest.Package.Identity.Name -cne $report.identityName -or
        $manifest.Package.Identity.Version -cne $report.version -or
        $manifest.Package.Identity.ProcessorArchitecture -cne $report.arch) {
        throw 'Manifest identity/version/architecture differs from build configuration.'
    }
    if (@($manifest.Package.Capabilities.ChildNodes).Count -ne 1 -or
        $manifest.Package.Capabilities.FirstChild.GetAttribute('Name') -ne 'runFullTrust') {
        throw 'Unexpected MSIX capability declaration.'
    }
    if ($report.validationOnly -and $manifest.Package.Identity.Name -notlike 'LocalValidation.*') {
        throw 'Validation output must not use a real Store identity.'
    }
} finally { $archive.Dispose() }
Write-Output 'MSIX layout, identity, checksum and unsigned boundary verified; package was not installed, signed or submitted.'
