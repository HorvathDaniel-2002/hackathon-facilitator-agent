param(
    [ValidateSet('x64', 'arm64')]
    [string]$Architecture = 'x64',
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version = '0.3.0',
    [string]$InstallerPath = ''
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or -not $env:RUNNER_TEMP) {
    throw 'This installer lifecycle test must only run on a disposable GitHub Windows runner.'
}
$root = Join-Path $env:RUNNER_TEMP "hf-desktop-e2e-$Architecture"
$profile = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Hackathon Facilitator'
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hackathon Facilitator.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Hackathon Facilitator.lnk'
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
function Find-Registration {
    @(Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue |
        Get-ItemProperty | Where-Object { $_.DisplayName -match '^Hackathon Facilitator(?: \d+\.\d+\.\d+.*)?$' })
}
if ((Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $profile) -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink) -or (Find-Registration).Count) {
    throw 'A prior app/profile/shortcut/test directory exists. Refusing to modify it.'
}
New-Item -ItemType Directory -Path $root | Out-Null
$installerName = "Hackathon-Facilitator-Setup-$Version-$Architecture.exe"
$installer = Join-Path $root $installerName
if ($InstallerPath) {
    $candidate = (Resolve-Path -LiteralPath $InstallerPath).Path
    if ((Split-Path $candidate -Leaf) -ne $installerName) { throw 'Candidate name does not match version/architecture.' }
    Copy-Item -LiteralPath $candidate -Destination $installer
    $expected = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
    $packageSource = 'Fresh CI build'
} else {
    $releaseBase = "https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v$Version"
    $checksumFile = Join-Path $root 'release-checksums.txt'
    Invoke-WebRequest -Uri "$releaseBase/hackathon-facilitator-$Version.sha256" -OutFile $checksumFile
    $checksumText = Get-Content -LiteralPath $checksumFile -Raw -Encoding utf8
    $matching = @($checksumText -split "`n" | Where-Object { $_.TrimEnd() -match "^[a-f0-9]{64}  $([regex]::Escape($installerName))$" })
    if ($matching.Count -ne 1) { throw 'Release checksum file has no unique installer entry.' }
    $expected = $matching[0].Substring(0, 64)
    Invoke-WebRequest -Uri "$releaseBase/$installerName" -OutFile $installer
    $packageSource = "Published v$Version release"
}
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Published installer digest differs from the pinned release.'
}
$installDir = Join-Path $root 'installed'
$installStarted = Get-Date
$executable = Join-Path $installDir 'Hackathon Facilitator.exe'
$signing = [string](Get-AuthenticodeSignature -LiteralPath $installer).Status
if ($signing -ne 'NotSigned') { throw "Unexpected signing status for this unsigned preview: $signing" }
function Install-Preview {
    $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -PassThru
    if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id; throw 'Installer timed out.' }
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ((-not (Test-Path -LiteralPath $executable)) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
    @{
        expectedDirectory = $installDir
        osArchitecture = [string][Runtime.InteropServices.RuntimeInformation]::OSArchitecture
        powershellArchitecture = [string][Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture
        installerExitCode = $process.ExitCode
        executableExists = Test-Path -LiteralPath $executable
        entries = @(Get-ChildItem -LiteralPath $installDir -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name)
        userRegistrations = @(Find-Registration | Select-Object DisplayName, DisplayVersion, UninstallString, InstallLocation)
        defaultInstallation = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs\Hackathon Facilitator\Hackathon Facilitator.exe')
        remainingFileTypes = @(Get-ChildItem -LiteralPath $installDir -Recurse -File -ErrorAction SilentlyContinue |
            Group-Object Extension | Select-Object Name, Count)
        defenderEvents = @(Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-Windows Defender/Operational'; StartTime = $installStarted; Id = 1116,1117
        } -ErrorAction SilentlyContinue | Where-Object { $_.Message -like "*$root*" } |
            Select-Object -First 5 Id, Message)
        integrityEvents = @(Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-CodeIntegrity/Operational'; StartTime = $installStarted; Id = 3076,3077
        } -ErrorAction SilentlyContinue | Where-Object { $_.Message -like "*$root*" } |
            Select-Object -First 5 Id, Message)
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'installation-observation.json') -Encoding utf8
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable is missing.' }
    $registration = @(Find-Registration)
    $registration | Select-Object DisplayName, DisplayVersion, UninstallString |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'installation-registration.json') -Encoding utf8
    if ($registration.Count -ne 1 -or $registration[0].DisplayVersion -ne $Version) {
        throw 'Per-user uninstall registration is missing, duplicated or has the wrong version.'
    }
    $wsh = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in @($desktopLink, $startLink)) {
            if (-not (Test-Path -LiteralPath $shortcut)) { throw "Expected shortcut is missing: $shortcut" }
            if ($wsh.CreateShortcut($shortcut).TargetPath -ne $executable) { throw 'Shortcut points to a different app.' }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wsh) }
}
Install-Preview
node (Join-Path $PSScriptRoot 'e2e-installed.cjs') first $root $Version
if ($LASTEXITCODE -ne 0) { throw 'Installed app workflow checks failed.' }
$saved = Get-Content -LiteralPath (Join-Path $root 'data-before-reinstall.json') -Raw | ConvertFrom-Json
Install-Preview
if ((Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.database -or
    (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.schema.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.marker) {
    throw 'Reinstall changed the saved workspace.'
}
node (Join-Path $PSScriptRoot 'e2e-installed.cjs') reinstalled $root $Version
if ($LASTEXITCODE -ne 0) { throw 'Relaunch after reinstall failed.' }
$beforeUninstall = (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash
$uninstaller = Join-Path $installDir 'Uninstall Hackathon Facilitator.exe'
if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller is missing.' }
$remove = Start-Process -FilePath $uninstaller -ArgumentList @('/currentuser', '/S') -PassThru
if (-not $remove.WaitForExit(120000)) { Stop-Process -Id $remove.Id; throw 'Uninstaller timed out.' }
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while (((Test-Path -LiteralPath $executable) -or (Find-Registration).Count -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) -and
    [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
if ((Test-Path -LiteralPath $executable) -or (Find-Registration).Count -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink)) {
    throw 'Uninstall did not remove the executable, shortcuts or registration.'
}
if ((Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash -ne $beforeUninstall) {
    throw 'Uninstall removed or changed the saved workspace.'
}
$config = Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json
if (-not $config.build.nsis.runAfterFinish -or $config.build.nsis.allowElevation -or $config.build.nsis.deleteAppDataOnUninstall) {
    throw 'Installer settings no longer match launch-after-finish/per-user/data-preservation expectations.'
}
$report = @{
    status = 'passed'; version = $Version; source = $packageSource; architecture = $Architecture; installerSha256 = $expected
    actualSilentInstall = $true; startMenuShortcut = $true; desktopShortcut = $true
    perUserRegistration = $true; installedAppWorkflow = $true
    reinstallPreservesData = $true; uninstallRemovesProgram = $true; uninstallPreservesData = $true
    signing = $signing; interactiveFinishCheckbox = 'Configured; not clicked by silent automation'
    smartScreenAndOrganizationPolicy = 'Not bypassed; interactive policy approval remains environment-dependent'
}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'installer-lifecycle.json') -Encoding utf8
$report | ConvertTo-Json -Depth 4
