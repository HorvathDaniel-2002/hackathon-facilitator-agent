@echo off
setlocal
cd /d "%~dp0app"
if errorlevel 1 (
  echo The app folder is missing. Extract the complete release ZIP before starting.
  pause
  exit /b 1
)
call Start-Hackathon.cmd %*
exit /b %errorlevel%
