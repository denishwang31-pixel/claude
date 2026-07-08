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

REM ── 이전에 켜둔 가계부 서버 정리 (가장 흔한 문제 원인) ────────
REM   앱을 껐다 켜지 않고 여러 번 실행하면 예전 서버가 포트 3001/5173을
REM   계속 잡고 있어서, 새로(수정된) 서버가 뜨지 못하고 화면은 옛날 코드에
REM   연결된 채로 남는다. 그래서 시작 전에 해당 포트를 쓰는 프로세스를 정리.
echo [정리] 이전 서버 인스턴스 종료 중...
for %%P in (3001 5173 5174 5175 5176 5177 5178 5179) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

REM ── PostgreSQL 서비스 시작 시도 (이미 실행 중이면 무시) ──
for %%v in (17 16 15 14) do (
  sc query "postgresql-x64-%%v" >nul 2>&1 && net start "postgresql-x64-%%v" >nul 2>&1
)

REM ── PostgreSQL이 실제로 포트에 응답하는지 확인 (최대 10초) ──
set PG_OK=0
for /l %%i in (1,1,10) do (
  powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('localhost',5432); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (set PG_OK=1 & goto pgdone)
  timeout /t 1 /nobreak >nul
)
:pgdone
if "%PG_OK%"=="0" (
  echo.
  echo ================================================
  echo   [경고] PostgreSQL^(포트 5432^)이 응답하지 않습니다.
  echo   서비스가 설치되어 있는지, 켜져 있는지 확인해주세요:
  echo   1^) Win+R -^> services.msc 실행
  echo   2^) 이름에 postgresql이 들어간 서비스를 찾아 "시작"
  echo   이 상태로 계속 진행하면 업로드 등에서 응답 없이 멈출 수 있습니다.
  echo ================================================
  echo.
) else (
  echo [확인] PostgreSQL 응답 정상
)

REM ── 가계부용 DB 계정(budget)/데이터베이스 자동 설정 ──────────
REM   .env가 새로 만들어진 경우 budget 계정이 아직 없어 인증 실패
REM   ("password 인증에 실패")가 난다. psql로 접속 테스트 후, 없으면
REM   postgres 관리자 계정으로 budget 계정과 household_budget DB를 생성.
set "PSQL="
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\17\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\16\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\15\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\14\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\13\bin\psql.exe" set "PSQL=C:\Program Files\PostgreSQL\13\bin\psql.exe"
if "%PSQL%"=="" goto skipdb

set "PGPASSWORD=budget123"
"%PSQL%" -U budget -h localhost -d household_budget -c "SELECT 1" >nul 2>&1
if not errorlevel 1 goto dbok

echo.
echo ================================================
echo   [최초 설정] 가계부용 DB 계정을 만들어야 합니다.
echo   PostgreSQL 설치 시 정한 관리자^(postgres^) 비밀번호를 입력하세요.
echo   ^(입력해도 화면에 표시되지 않을 수 있습니다^)
echo ================================================
set "PGADMINPW="
set /p PGADMINPW=postgres 비밀번호:
set "PGPASSWORD=%PGADMINPW%"
"%PSQL%" -U postgres -h localhost -c "ALTER ROLE budget WITH LOGIN PASSWORD 'budget123';" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "CREATE ROLE budget WITH LOGIN PASSWORD 'budget123';" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "CREATE DATABASE household_budget OWNER budget;" >nul 2>&1
"%PSQL%" -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE household_budget TO budget;" >nul 2>&1
set "PGPASSWORD=budget123"
"%PSQL%" -U budget -h localhost -d household_budget -c "SELECT 1" >nul 2>&1
if errorlevel 1 goto dbfail
echo [완료] 가계부용 DB 계정 설정이 끝났습니다.
goto dbok
:dbfail
echo.
echo   [오류] DB 계정 설정에 실패했습니다.
echo   - postgres 관리자 비밀번호가 맞는지 확인하세요.
echo   - 비밀번호가 기억나지 않으면 알려주세요 (재설정 방법 안내).
echo.
:dbok
REM ── 테이블 생성 (없으면 만들고, 있으면 그대로 — 멱등적) ──
set "PGPASSWORD=budget123"
if exist "%~dp0drizzle\init_pg.sql" (
  "%PSQL%" -U budget -h localhost -d household_budget -f "%~dp0drizzle\init_pg.sql" >nul 2>&1
  if not errorlevel 1 echo [확인] 데이터베이스 테이블 준비 완료
)
set "PGPASSWORD="
:skipdb

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
