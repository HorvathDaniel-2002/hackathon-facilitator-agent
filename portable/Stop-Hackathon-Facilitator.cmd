@echo off
setlocal
set "HF_ARCH=%PROCESSOR_ARCHITECTURE%"
if /I "%PROCESSOR_ARCHITEW6432%"=="AMD64" set "HF_ARCH=AMD64"
if /I "%HF_ARCH%"=="AMD64" set "HF_ARCH=x64"
if /I "%HF_ARCH%"=="ARM64" set "HF_ARCH=arm64"
if /I not "%HF_ARCH%"=="x64" if /I not "%HF_ARCH%"=="arm64" exit /b 1
"%~dp0runtime\%HF_ARCH%\node\node.exe" "%~dp0launcher.cjs" --stop
if errorlevel 1 pause
