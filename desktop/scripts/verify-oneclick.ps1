param(
    [Parameter(Mandatory)][ValidateSet('x64', 'arm64')][string]$Architecture,
    [Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$InstallerPath = '',
    [switch]$UpgradeFromPrevious
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) {
    throw 'This modifying test is restricted to disposable GitHub Windows runners.'
}
if ([string][Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ine $Architecture) {
    throw 'The test runner must use the native target architecture.'
}
$scenario = if ($UpgradeFromPrevious) { 'upgrade' } else { 'fresh' }
$root = Join-Path $env:RUNNER_TEMP "hf-oneclick-$Architecture-$scenario"
$profile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Hackathon Facilitator'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hackathon Facilitator.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Hackathon Facilitator.lnk'
$defaultDir = Join-Path $env:LOCALAPPDATA 'Programs\hackathon-facilitator-desktop'
$installDir = if ($UpgradeFromPrevious) { Join-Path $root 'installed' } else { $defaultDir }
$executable = Join-Path $installDir 'Hackathon Facilitator.exe'
$nodePath = Join-Path $installDir 'resources\backend\node\node.exe'
function Find-Registration {
    @(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall' -ErrorAction SilentlyContinue |
        Get-ItemProperty | Where-Object { $_.DisplayName -match '^Hackathon Facilitator(?: \d+\.\d+\.\d+.*)?$' })
}
foreach ($item in @($root, $profile, $defaultDir, $desktopLink, $startLink)) {
    if (Test-Path -LiteralPath $item) { throw "Refusing to touch an existing app/profile/test location: $item" }
}
if ((Find-Registration).Count) { throw 'A prior app registration exists; no test was started.' }
New-Item -ItemType Directory -Path $root | Out-Null
$name = "Hackathon-Facilitator-Setup-$Version.exe"
$installer = Join-Path $root $name
if ($InstallerPath) {
    $source = (Resolve-Path -LiteralPath $InstallerPath).Path
    if ((Split-Path $source -Leaf) -cne $name) { throw 'Unexpected universal installer filename.' }
    Copy-Item -LiteralPath $source -Destination $installer
    $packageSource = 'CI candidate'
} else {
    $base = "https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v$Version"
    $checksums = (Invoke-WebRequest -Uri "$base/hackathon-facilitator-$Version.sha256").Content
    $matches = @($checksums -split "`n" | Where-Object { $_.TrimEnd() -match "^[a-f0-9]{64}  $([regex]::Escape($name))$" })
    if ($matches.Count -ne 1) { throw 'No unique published installer checksum.' }
    Invoke-WebRequest -Uri "$base/$name" -OutFile $installer
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -cne $matches[0].Substring(0, 64)) {
        throw 'Downloaded release checksum mismatch.'
    }
    $packageSource = "Published v$Version"
}
if ((Get-AuthenticodeSignature -LiteralPath $installer).Status -ne 'NotSigned') { throw 'Unexpected preview signing status.' }
$installerHash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$env:HF_E2E_INSTALL_DIR = $installDir
$autoLaunches = @()

function Wait-Installer($file, [string[]]$arguments) {
    $options = @{ FilePath = $file; PassThru = $true }
    if ($arguments.Count) { $options.ArgumentList = $arguments }
    $process = Start-Process @options
    if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id; throw 'Installer did not finish without user interaction.' }
    if ($process.ExitCode -ne 0) { throw "Installer failed with exit $($process.ExitCode)." }
}
function Assert-Installation($expectedVersion) {
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed app executable is missing.' }
    $registration = @(Find-Registration)
    if ($registration.Count -ne 1 -or $registration[0].DisplayVersion -cne $expectedVersion) { throw 'Uninstall registration version/identity is incorrect.' }
    $metadata = Get-Content -LiteralPath (Join-Path $installDir 'resources\backend\metadata.json') -Raw | ConvertFrom-Json
    if ($metadata.arch -cne $Architecture -or $metadata.appVersion -cne $expectedVersion) { throw 'Automatic architecture/version selection is incorrect.' }
    if ((& $nodePath -p 'process.arch') -cne $Architecture) { throw 'Bundled Node architecture is incorrect.' }
    if ((Get-AuthenticodeSignature -LiteralPath $nodePath).Status -ne 'Valid') { throw 'Bundled Node has lost its original trusted signature.' }
    $wsh = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in @($desktopLink, $startLink)) {
            if (-not (Test-Path -LiteralPath $shortcut) -or $wsh.CreateShortcut($shortcut).TargetPath -ine $executable) {
                throw 'Start menu/desktop shortcut is missing or points to the wrong app.'
            }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wsh) }
}
function Assert-AutomaticLaunch {
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    $main = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $mains = @(Get-CimInstance Win32_Process -Filter "Name='Hackathon Facilitator.exe'" |
            Where-Object { $_.ExecutablePath -ieq $executable -and $_.CommandLine -notmatch '--type=' })
        if ($mains.Count -eq 1) {
            $candidate = Get-Process -Id $mains[0].ProcessId -ErrorAction SilentlyContinue
            if ($candidate -and $candidate.MainWindowHandle -ne 0 -and $candidate.MainWindowTitle -eq 'Hackathon Facilitator') {
                $main = $mains[0]; break
            }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $main) { throw 'The installer did not automatically open the full application window.' }
    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$($main.ProcessId)" |
        Where-Object { $_.ExecutablePath -ieq $nodePath })
    if ($children.Count -ne 1) { throw 'Automatically opened app did not start exactly one bundled backend.' }
    $listeners = @(Get-NetTCPConnection -OwningProcess $children[0].ProcessId -State Listen)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -cne '127.0.0.1') { throw 'Backend must listen on numeric loopback only.' }
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$($listeners[0].LocalPort)/api/desktop-health" -SkipHttpErrorCheck
    if ($response.StatusCode -ne 403) { throw 'Automatically launched backend did not reject unauthenticated requests.' }
    $evidence = @{ mainPid = $main.ProcessId; windowTitle = 'Hackathon Facilitator'; backendPid = $children[0].ProcessId;
        backendArchitecture = $Architecture; anonymousHealthStatus = $response.StatusCode }

    # Only the just-observed test instance is stopped. Graceful tray Quit is tested separately by Playwright.
    $all = @(Get-CimInstance Win32_Process)
    $owned = [Collections.Generic.HashSet[uint32]]::new()
    [void]$owned.Add([uint32]$main.ProcessId)
    do {
        $before = $owned.Count
        foreach ($process in $all) {
            if ($owned.Contains([uint32]$process.ParentProcessId)) { [void]$owned.Add([uint32]$process.ProcessId) }
        }
    } while ($owned.Count -gt $before)
    Stop-Process -Id $main.ProcessId -Force
    foreach ($processId in @($owned | Where-Object { $_ -ne $main.ProcessId })) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ((Get-Process -Id $main.ProcessId -ErrorAction SilentlyContinue) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (Get-Process -Id $main.ProcessId -ErrorAction SilentlyContinue) { throw 'Test-owned auto-launched process did not stop.' }
    return $evidence
}
function Run-Workflow($phase, $expectedVersion) {
    node (Join-Path $PSScriptRoot 'e2e-installed.cjs') $phase $root $expectedVersion
    if ($LASTEXITCODE -ne 0) { throw "Full installed-app workflow failed: $phase $expectedVersion" }
}
if ($UpgradeFromPrevious) {
    $previous = Join-Path $root "Hackathon-Facilitator-Setup-0.3.1-$Architecture.exe"
    $previousHash = if ($Architecture -eq 'x64') { '90c1e2f1a1c83c69ac0abe9bad8e2a93d3b56d66129cf536b17cf9ee8cbd6b98' }
        else { '289d71536aa765b8a98863a0f3d8f8a8bfe567fc84799d031f3005f7d15367d5' }
    Invoke-WebRequest -Uri "https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.1/$(Split-Path $previous -Leaf)" -OutFile $previous
    if ((Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash.ToLowerInvariant() -cne $previousHash) { throw 'Previous release hash mismatch.' }
    Wait-Installer $previous @('/S', "/D=$installDir")
    Assert-Installation '0.3.1'
    Run-Workflow 'first' '0.3.1'
}
Wait-Installer $installer @()
Assert-Installation $Version
$autoLaunches += Assert-AutomaticLaunch
if ($UpgradeFromPrevious) { Run-Workflow 'reinstalled' $Version } else { Run-Workflow 'first' $Version }
$beforeReinstall = (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash
$markerBefore = (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.schema.json') -Algorithm SHA256).Hash
Wait-Installer $installer @()
Assert-Installation $Version
$autoLaunches += Assert-AutomaticLaunch
Run-Workflow 'reinstalled' $Version
if ((Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash -cne $beforeReinstall -or
    (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.schema.json') -Algorithm SHA256).Hash -cne $markerBefore) {
    throw 'Reinstall modified the existing workspace or schema marker.'
}
$uninstaller = Join-Path $installDir 'Uninstall Hackathon Facilitator.exe'
Wait-Installer $uninstaller @('/currentuser', '/S')
$deadline = [DateTime]::UtcNow.AddSeconds(40)
while (((Test-Path -LiteralPath $executable) -or (Find-Registration).Count -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 500
}
if ((Test-Path -LiteralPath $executable) -or (Find-Registration).Count -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) {
    throw 'Uninstall did not remove program, shortcuts and registration.'
}
if ((Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash -cne $beforeReinstall) {
    throw 'Uninstall changed or removed the saved workspace.'
}
$report = @{
    status = 'passed'; version = $Version; source = $packageSource; architecture = $Architecture; scenario = $scenario
    installerSha256 = $installerHash; installerArguments = @(); automaticLaunches = $autoLaunches
    automaticArchitectureSelection = $true; installedAppWorkflow = $true; trayAndExports = $true
    reinstallPreservesData = $true; uninstallPreservesData = $true; previousVersion = $(if ($UpgradeFromPrevious) { '0.3.1' } else { $null })
    signing = 'NotSigned'; smartScreenAndOrganizationPolicy = 'Not bypassed; approval depends on the device'
    autoLaunchTestCleanup = 'Only observed test-owned PIDs stopped; normal graceful Quit tested by the full app workflow'
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'oneclick-lifecycle.json') -Encoding utf8
$report | ConvertTo-Json -Depth 6
