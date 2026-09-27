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
    $entries = [Collections.Generic.Dictionary[string,IO.Compression.ZipArchiveEntry]]::new([StringComparer]::Ordinal)
    foreach ($entry in $archive.Entries) {
        # Compare logical package paths, not ZIP URI escaping or path separators.
        $name = [Uri]::UnescapeDataString($entry.FullName).Replace('\', '/')
        if (-not $entries.TryAdd($name, $entry)) { throw "Duplicate logical package path: $name" }
    }
    if ($entries.ContainsKey('AppxSignature.p7x')) { throw 'Unexpected local signature. Store submission must not be disguised as a trusted standalone installer.' }
    foreach ($name in @('AppxManifest.xml','AppxBlockMap.xml','[Content_Types].xml',
        'app/Hackathon Facilitator.exe','app/resources/app.asar','app/resources/backend/node/node.exe',
        'app/resources/backend/server/server.js','app/resources/backend/template.db',
        'Assets/StoreLogo.png','Assets/Square44x44Logo.png','Assets/Square150x150Logo.png')) {
        if (-not $entries.ContainsKey($name)) { throw "Required MSIX component missing: $name" }
    }
    $content = Join-Path $root 'content'
    foreach ($file in Get-ChildItem -LiteralPath $content -Recurse -File) {
        $name = [IO.Path]::GetRelativePath($content, $file.FullName).Replace('\', '/')
        if (-not $entries.ContainsKey($name)) { throw "Staged file missing from MSIX: $name" }
        $stream = $entries[$name].Open()
        try { $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
        if ($digest -cne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
            throw "Packaged file bytes differ from the staged input: $name"
        }
    }
    $reader = [IO.StreamReader]::new($entries['AppxManifest.xml'].Open())
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
    $report | Add-Member -NotePropertyName payloadBytesVerified -NotePropertyValue $true -Force
    $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'package-report.json') -Encoding utf8
} finally { $archive.Dispose() }
Write-Output 'MSIX layout, identity, checksum and unsigned boundary verified; package was not installed, signed or submitted.'
