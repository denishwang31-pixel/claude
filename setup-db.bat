@echo off
chcp 65001 >nul
title DB SETUP - run me first
cd /d "%~dp0"

echo ================================================
echo   STEP 1 of 2 : Database account setup
echo   (Run this FIRST, before the launcher)
echo ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist "node_modules\postgres" (
  echo Installing packages first... this may take a few minutes.
  set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  call npm install
)

if not exist "hb-setup.mjs" (
  echo [ERROR] hb-setup.mjs is missing from this folder.
  echo Copy BOTH setup-db.bat and hb-setup.mjs into the household budget folder.
  pause
  exit /b 1
)

echo Enter the PostgreSQL admin ^(postgres^) password you set during install.
set "HB_PGPW="
set /p HB_PGPW=postgres password: 

node hb-setup.mjs
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (
  echo ================================================
  echo   DONE. Now close this window and run the launcher.
  echo ================================================
) else (
  echo ================================================
  echo   Setup did NOT finish. See the message above.
  echo ================================================
)
pause
