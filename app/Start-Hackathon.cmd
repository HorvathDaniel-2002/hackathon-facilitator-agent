@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js 24 LTS from https://nodejs.org, then reopen this launcher.
  pause
  exit /b 1
)
node "%~dp0scripts\start-demo.mjs" %*
set "demo_exit=%errorlevel%"
if not "%demo_exit%"=="0" (
  echo.
  echo Demo setup stopped. Read the message above or docs\local-demo-setup.md.
  pause
)
exit /b %demo_exit%
