@echo off
chcp 65001 >nul
title Household Budget - DB Setup
cd /d "%~dp0"

echo ================================================
echo   Household Budget - Database account setup
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
  echo [ERROR] hb-setup.mjs not found in this folder.
  echo Put both setup-db.bat and hb-setup.mjs in the household budget folder.
  pause
  exit /b 1
)

echo Enter the PostgreSQL admin ^(postgres^) password you set during install.
set "HB_PGPW="
set /p HB_PGPW=postgres password: 

node hb-setup.mjs
echo.
pause
