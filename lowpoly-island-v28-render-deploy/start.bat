@echo off
setlocal
cd /d "%~dp0"
title Lowpoly Island Server (port 4010)
set PORT=4010

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install it from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

if not exist "node_modules\ws" (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Server: http://localhost:%PORT%   (Ctrl+C to stop)
echo.
REM open the browser after the server has had a moment to start
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" http://localhost:%PORT%"
node server.js

echo.
echo Server stopped.
pause
