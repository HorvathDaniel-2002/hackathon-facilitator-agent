param(
    [Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture,
    [Parameter(Mandatory)][string]$ZipPath
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) {
    throw 'This modifying test is restricted to disposable GitHub Windows runners.'
}
if ([string][Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ine $Architecture) {
    throw 'The test runner must use the native target architecture.'
}

$root = Join-Path $env:RUNNER_TEMP "hf-portable-$Architecture"
$extract = Join-Path $root 'extracted'
$profile = Join-Path $root 'profile'
if (Test-Path -LiteralPath $root) { throw "Refusing existing test directory: $root" }
New-Item -ItemType Directory -Path $extract | Out-Null
Expand-Archive -LiteralPath (Resolve-Path -LiteralPath $ZipPath) -DestinationPath $extract
$package = @(Get-ChildItem -LiteralPath $extract -Directory)
if ($package.Count -ne 1) { throw 'Portable ZIP must contain exactly one root folder.' }
$package = $package[0].FullName
$node = Join-Path $package "runtime\$Architecture\node\node.exe"
$start = Join-Path $package 'Start-Hackathon-Facilitator.cmd'
$stop = Join-Path $package 'Stop-Hackathon-Facilitator.cmd'
$backup = Join-Path $package 'Backup-Hackathon-Workspace.cmd'
foreach ($file in @($node, $start, $stop, $backup, (Join-Path $package 'checksums.json'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing package file: $file" }
}
if ((Get-AuthenticodeSignature -LiteralPath $node).Status -ne 'Valid') {
    throw 'Bundled Node runtime has lost its upstream trusted signature.'
}
if ((& $node -p 'process.arch') -cne $Architecture) { throw 'Bundled Node architecture is incorrect.' }

$manifest = Get-Content -LiteralPath (Join-Path $package 'checksums.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $file = Join-Path $package ($entry.path -replace '/', '\')
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Manifest file missing: $($entry.path)" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.sha256) {
        throw "Manifest hash mismatch: $($entry.path)"
    }
}

$env:HF_PORTABLE_PROFILE = $profile
& $start --check
if ($LASTEXITCODE -ne 0) { throw 'Portable package integrity check failed.' }

function Start-Portable {
    $process = Start-Process -FilePath $start -ArgumentList '--no-open' -PassThru -WindowStyle Hidden
    $lock = Join-Path $profile 'launcher.json'
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Path -LiteralPath $lock) {
            try {
                $record = Get-Content -LiteralPath $lock -Raw | ConvertFrom-Json
                if ($record.status -eq 'ready' -and $record.pid -gt 0 -and $record.architecture -eq $Architecture) {
                    return @{ Process = $process; Lock = $lock }
                }
            } catch {}
        }
        if ($process.HasExited) { throw "Portable launcher exited early with $($process.ExitCode)." }
        Start-Sleep -Milliseconds 250
    }
    throw 'Portable launcher did not become ready.'
}

function Stop-Portable($run) {
    & $stop
    if ($LASTEXITCODE -ne 0) { throw 'Portable stop command failed.' }
    if (-not $run.Process.WaitForExit(20000)) {
        Stop-Process -Id $run.Process.Id
        throw 'Portable launcher did not stop gracefully.'
    }
    if (Test-Path -LiteralPath $run.Lock) { throw 'Portable launcher lock remained after shutdown.' }
}

$first = Start-Portable
node (Join-Path $PSScriptRoot 'e2e-portable.cjs') first $root $first.Lock
if ($LASTEXITCODE -ne 0) { throw 'First portable full-app workflow failed.' }
Stop-Portable $first

$database = Join-Path $profile 'data\workspace.db'
$marker = Join-Path $profile 'data\workspace.schema.json'
$databaseHash = (Get-FileHash -LiteralPath $database -Algorithm SHA256).Hash
$markerHash = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash

$second = Start-Portable
node (Join-Path $PSScriptRoot 'e2e-portable.cjs') restarted $root $second.Lock
if ($LASTEXITCODE -ne 0) { throw 'Restarted portable full-app workflow failed.' }
Stop-Portable $second

if ((Get-FileHash -LiteralPath $database -Algorithm SHA256).Hash -cne $databaseHash -or
    (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash -cne $markerHash) {
    throw 'Stop/restart modified the saved workspace unexpectedly.'
}

& $node (Join-Path $package 'launcher.cjs') --backup
if ($LASTEXITCODE -ne 0) { throw 'Portable backup command failed.' }
$backups = @(Get-ChildItem -LiteralPath (Join-Path $profile 'backups') -Directory)
if ($backups.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $backups[0].FullName 'workspace.db'))) {
    throw 'Portable backup was not created correctly.'
}

$report = @{
    status = 'passed'
    architecture = $Architecture
    fullOriginalApplication = $true
    noInstaller = $true
    noAdminRights = $true
    bundledNodeSignature = 'Valid'
    protectedLoopbackGateway = $true
    firstWorkflow = $true
    restartPreservesData = $true
    backupCreated = $true
}
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'portable-lifecycle.json') -Encoding utf8
$report | ConvertTo-Json
