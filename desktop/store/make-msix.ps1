param(
    [Parameter(Mandatory)][string]$InputDirectory,
    [Parameter(Mandatory)][string]$PackagePath
)
$ErrorActionPreference = 'Stop'
$inputPath = (Resolve-Path -LiteralPath $InputDirectory).Path
$outputPath = [IO.Path]::GetFullPath($PackagePath)
if (Test-Path -LiteralPath $outputPath) { throw 'MSIX output already exists.' }
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$candidates = @(Get-ChildItem -LiteralPath $sdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
    Where-Object { Test-Path -LiteralPath $_ })
if ($env:HF_MAKEAPPX_PATH) { $candidates = @($env:HF_MAKEAPPX_PATH) }
if (-not $candidates.Count) { throw 'Microsoft Windows SDK MakeAppx.exe is missing. Install the official Windows SDK packaging tools on the build machine.' }
$tool = (Get-Item -LiteralPath $candidates[0]).FullName
$sig = Get-AuthenticodeSignature -LiteralPath $tool
if ($sig.Status -ne 'Valid' -or
    $sig.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Microsoft Corporation') {
    throw 'Only a valid Microsoft-signed Windows SDK MakeAppx tool may build the package.'
}
& $tool pack /d $inputPath /p $outputPath /h SHA256 /v
if ($LASTEXITCODE -ne 0) { throw "MakeAppx package/manifest validation failed with exit $LASTEXITCODE." }
if (-not (Test-Path -LiteralPath $outputPath)) { throw 'No MSIX package was created.' }
Write-Output 'MakeAppx package validation passed. Package is unsigned and has not been submitted to Microsoft Store.'
