@echo off
chcp 65001 >nul
title 가계부 대시보드
cd /d "%~dp0"

echo ================================================
echo   가계부 대시보드를 시작합니다
echo   현재 폴더: %cd%
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
for /f "delims=" %%v in ('node -v') do echo [확인] Node.js %%v 감지됨

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

REM ── 패키지 설치 확인 (없거나 불완전하면 설치) ──
if not exist node_modules\vite (
  echo [안내] 패키지를 설치합니다... ^(처음 실행 시 몇 분 걸릴 수 있어요^)
  echo.
  set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
  call npm install
  if errorlevel 1 (
    echo.
    echo [오류] 패키지 설치에 실패했습니다. 위의 에러 메시지를 확인하세요.
    pause
    exit /b 1
  )
  echo.
  echo [완료] 패키지 설치가 끝났습니다.
  echo.
)

REM ── 서버가 실제로 뜰 때까지 기다렸다가 브라우저 열기 ──
REM    (고정 대기시간 대신 포트 응답을 직접 확인 — 느린 PC에서도 안전)
set WAITER=%TEMP%\가계부_대기.bat
> "%WAITER%" echo @echo off
>> "%WAITER%" echo set n=0
>> "%WAITER%" echo :wait
>> "%WAITER%" echo set /a n+=1
>> "%WAITER%" echo curl -s -o nul --max-time 2 http://localhost:5173
>> "%WAITER%" echo if not errorlevel 1 ^( start http://localhost:5173 ^& exit ^)
>> "%WAITER%" echo if %%n%% GEQ 90 exit
>> "%WAITER%" echo timeout /t 2 /nobreak ^>nul
>> "%WAITER%" echo goto wait
start "" /min "%WAITER%"

echo 서버를 시작합니다. 준비되는 대로 브라우저가 자동으로 열립니다...
echo (오래 걸리면 직접 http://localhost:5173 으로 접속해도 됩니다)
echo.

call npm run dev

echo.
echo ================================================
echo   서버가 종료되었습니다.
echo   위에 빨간색/오류 메시지가 있다면 그대로 캡처해서 문의하세요.
echo ================================================
pause
