param(
    [ValidateSet('x64', 'arm64')]
    [string]$Architecture = 'x64'
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
        Get-ItemProperty | Where-Object DisplayName -EQ 'Hackathon Facilitator')
}
if ((Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $profile) -or
    (Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startLink) -or (Find-Registration).Count) {
    throw 'A prior app/profile/shortcut/test directory exists. Refusing to modify it.'
}
New-Item -ItemType Directory -Path $root | Out-Null
$installerName = "Hackathon-Facilitator-Setup-0.3.0-$Architecture.exe"
$installer = Join-Path $root $installerName
$expected = @{
    x64 = '8ad7a7e9ce9c853f50a7bd7f39cfb63f3576d2bceea260157facfb214ed9b6a6'
    arm64 = '42542a736ad54c3e6d600856e9d87e2909ee58f98f94f48ac4f9fb38decad3d2'
}[$Architecture]
Invoke-WebRequest -Uri "https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent/releases/download/v0.3.0/$installerName" -OutFile $installer
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Published installer digest differs from the pinned release.'
}
$installDir = Join-Path $root 'installed'
$executable = Join-Path $installDir 'Hackathon Facilitator.exe'
$signing = [string](Get-AuthenticodeSignature -LiteralPath $installer).Status
if ($signing -ne 'NotSigned') { throw "Unexpected signing status for this unsigned preview: $signing" }
function Install-Preview {
    $process = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -PassThru
    if (-not $process.WaitForExit(180000)) { Stop-Process -Id $process.Id; throw 'Installer timed out.' }
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable is missing.' }
    if ((Find-Registration).Count -ne 1) { throw 'Per-user uninstall registration is missing or duplicated.' }
    $wsh = New-Object -ComObject WScript.Shell
    try {
        foreach ($shortcut in @($desktopLink, $startLink)) {
            if (-not (Test-Path -LiteralPath $shortcut)) { throw "Expected shortcut is missing: $shortcut" }
            if ($wsh.CreateShortcut($shortcut).TargetPath -ne $executable) { throw 'Shortcut points to a different app.' }
        }
    } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($wsh) }
}
Install-Preview
node (Join-Path $PSScriptRoot 'e2e-installed.cjs') first $root
if ($LASTEXITCODE -ne 0) { throw 'Installed app workflow checks failed.' }
$saved = Get-Content -LiteralPath (Join-Path $root 'data-before-reinstall.json') -Raw | ConvertFrom-Json
Install-Preview
if ((Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.database -or
    (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.schema.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $saved.marker) {
    throw 'Reinstall changed the saved workspace.'
}
node (Join-Path $PSScriptRoot 'e2e-installed.cjs') reinstalled $root
if ($LASTEXITCODE -ne 0) { throw 'Relaunch after reinstall failed.' }
$beforeUninstall = (Get-FileHash -LiteralPath (Join-Path $profile 'data\workspace.db') -Algorithm SHA256).Hash
$uninstaller = Join-Path $installDir 'Uninstall Hackathon Facilitator.exe'
if (-not (Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller is missing.' }
$remove = Start-Process -FilePath $uninstaller -ArgumentList '/S' -PassThru
if (-not $remove.WaitForExit(120000)) { Stop-Process -Id $remove.Id; throw 'Uninstaller timed out.' }
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ((Test-Path -LiteralPath $executable) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
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
    status = 'passed'; version = '0.3.0'; architecture = $Architecture; installerSha256 = $expected
    actualSilentInstall = $true; startMenuShortcut = $true; desktopShortcut = $true
    perUserRegistration = $true; installedAppWorkflow = $true
    reinstallPreservesData = $true; uninstallRemovesProgram = $true; uninstallPreservesData = $true
    signing = $signing; interactiveFinishCheckbox = 'Configured; not clicked by silent automation'
    smartScreenAndOrganizationPolicy = 'Not bypassed; interactive policy approval remains environment-dependent'
}
$report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $root 'installer-lifecycle.json') -Encoding utf8
$report | ConvertTo-Json -Depth 4
