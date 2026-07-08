@echo off
chcp 949 >nul
title 가계부 대시보드
cd /d "%~dp0"

echo ================================================
echo   가계부 대시보드를 시작합니다
echo   이 창을 닫으면 가계부도 종료됩니다
echo ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
echo [확인] Node.js 감지됨

echo [정리] 이전에 켜둔 서버 정리 중...
for %%P in (3001 5173 5174 5175 5176 5177 5178 5179) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
)

echo [DB] PostgreSQL 서비스 시작 확인...
for %%v in (17 16 15 14 13) do (
  sc query "postgresql-x64-%%v" >nul 2>&1 && net start "postgresql-x64-%%v" >nul 2>&1
)

if not exist .env (
  echo DEV_AUTO_LOGIN=true> .env
  echo DATABASE_URL=postgres://budget:budget123@localhost:5432/household_budget>> .env
)

if not exist node_modules\vite (
  echo [설치] 패키지를 설치합니다... 처음 실행 시 몇 분 걸릴 수 있어요.
  set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  call npm install
  if errorlevel 1 (
    echo [오류] 패키지 설치 실패. 위 메시지를 확인하세요.
    pause
    exit /b 1
  )
)

echo [DB] 데이터베이스 계정 확인/설정...
node scripts\setup-db.mjs
if errorlevel 1 (
  echo.
  echo [경고] 데이터베이스 설정이 완료되지 않았습니다. 위 메시지를 확인하세요.
  echo 계속 진행하지만 정상 동작하지 않을 수 있습니다.
  pause
)

start "" /min cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:5173"

echo.
echo 서버를 시작합니다. 약 10초 후 브라우저가 자동으로 열립니다...
echo (안 열리면 직접 http://localhost:5173 으로 접속하세요)
echo.

call npm run dev

echo.
echo ================================================
echo   서버가 종료되었습니다. 오류 메시지가 있으면 캡처해서 문의하세요.
echo ================================================
pause
