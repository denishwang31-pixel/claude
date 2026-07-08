@echo off
REM ASCII-only DB setup helper (encoding-safe fallback).
REM Creates the "budget" role and "household_budget" database.
title Household Budget - DB Setup
cd /d "%~dp0"

echo ================================================
echo   Household Budget - Database account setup
echo ================================================
echo.

set "PSQL="
for %%V in (17 16 15 14 13) do if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
if "%PSQL%"=="" (
  echo [ERROR] psql.exe not found under C:\Program Files\PostgreSQL\*\bin
  echo Check that PostgreSQL is installed.
  pause
  exit /b 1
)
echo Using: %PSQL%
echo.
echo Enter the PostgreSQL admin (postgres) password you set during install.
set "PGADMINPW="
set /p PGADMINPW=postgres password:
set "PGPASSWORD=%PGADMINPW%"

"%PSQL%" -U postgres -h localhost -c "ALTER ROLE budget WITH LOGIN PASSWORD 'budget123';" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "CREATE ROLE budget WITH LOGIN PASSWORD 'budget123';" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "CREATE DATABASE household_budget OWNER budget;" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE household_budget TO budget;" >nul 2>&1

set "PGPASSWORD=budget123"
if exist "%~dp0drizzle\init_pg.sql" "%PSQL%" -U budget -h localhost -d household_budget -f "%~dp0drizzle\init_pg.sql" >nul 2>&1

"%PSQL%" -U budget -h localhost -d household_budget -c "SELECT 'OK - budget account works' AS result;"
set "RESULT=%errorlevel%"
set "PGPASSWORD="

echo.
if "%RESULT%"=="0" (
  echo [DONE] Setup complete. You can now run 가계부실행.bat
) else (
  echo [FAILED] Could not connect as budget. The postgres password was likely wrong.
)
pause
