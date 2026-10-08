@echo off
setlocal
title Bokji Compass - Development API Server

pushd "%~dp0"
if errorlevel 1 (
    echo [ERROR] Cannot open the project folder.
    pause
    exit /b 1
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Python environment is missing.
    echo Run backend\scripts\setup.ps1 first.
    goto :failed
)

if not exist "backend\.env" (
    echo [ERROR] backend\.env is missing.
    echo Run backend\scripts\setup.ps1 and configure the server.
    goto :failed
)

echo Starting the Bokji Compass development API server...
echo The server address is configured in backend\.env.
echo Start the frontend separately and open its address in your browser.
echo Press Ctrl+C to stop the server.
echo Data collection is started separately by the ingestion worker.
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\start.ps1"
set "server_exit_code=%errorlevel%"
echo.
echo Server stopped. Exit code: %server_exit_code%
popd
pause
exit /b %server_exit_code%

:failed
popd
pause
exit /b 1
