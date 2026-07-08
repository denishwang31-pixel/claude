@echo off
chcp 65001 >nul
title Household Budget - DB Setup
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Install it from https://nodejs.org first.
  pause
  exit /b 1
)

if not exist node_modules\postgres (
  echo Installing packages first... this may take a few minutes.
  set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  call npm install
)

node scripts\setup-db.mjs
echo.
pause
