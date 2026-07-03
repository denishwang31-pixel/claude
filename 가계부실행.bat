@echo off
chcp 65001 >nul
title 가계부 대시보드
cd /d "%~dp0"

echo ================================================
echo   가계부 대시보드를 시작합니다
echo   이 창을 닫으면 가계부도 종료됩니다
echo ================================================
echo.

REM ── Node.js 설치 확인 ──────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

REM ── PostgreSQL 서비스 시작 시도 (이미 실행 중이면 무시) ──
for %%v in (17 16 15 14) do (
  sc query "postgresql-x64-%%v" >nul 2>&1 && net start "postgresql-x64-%%v" >nul 2>&1
)

REM ── .env 파일이 없으면 생성 ────────────────────
if not exist .env (
  echo DEV_AUTO_LOGIN=true> .env
  echo DATABASE_URL=postgres://budget:budget123@localhost:5432/household_budget>> .env
  echo [안내] .env 파일을 생성했습니다.
)

REM ── 처음 실행이면 패키지 설치 ──────────────────
if not exist node_modules (
  echo [안내] 처음 실행입니다. 패키지를 설치합니다... ^(몇 분 걸릴 수 있어요^)
  call npm install
  if errorlevel 1 (
    echo [오류] 패키지 설치에 실패했습니다.
    pause
    exit /b 1
  )
)

REM ── 8초 뒤 브라우저 자동 열기 ──────────────────
start "" /min cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:5173"

echo 서버를 시작합니다. 잠시 후 브라우저가 자동으로 열립니다...
echo 브라우저가 안 열리면 직접 http://localhost:5173 으로 접속하세요.
echo.

call npm run dev

pause
