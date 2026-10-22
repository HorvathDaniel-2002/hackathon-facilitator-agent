@echo off
setlocal
title Hackathon Facilitator - keep this window open
set "HF_ARCH=%PROCESSOR_ARCHITECTURE%"
if /I "%PROCESSOR_ARCHITEW6432%"=="AMD64" set "HF_ARCH=AMD64"
if /I "%HF_ARCH%"=="AMD64" set "HF_ARCH=x64"
if /I "%HF_ARCH%"=="ARM64" set "HF_ARCH=arm64"
if /I not "%HF_ARCH%"=="x64" if /I not "%HF_ARCH%"=="arm64" (
  echo Unsupported Windows architecture: %PROCESSOR_ARCHITECTURE%
  echo This package supports 64-bit Intel/AMD and Windows ARM64.
  pause
  exit /b 1
)
"%~dp0runtime\%HF_ARCH%\node\node.exe" "%~dp0launcher.cjs" %*
set "HF_EXIT=%ERRORLEVEL%"
if not "%HF_EXIT%"=="0" pause
exit /b %HF_EXIT%
