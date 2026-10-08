@echo off
setlocal
title Bokji Compass - Public Server

pushd "%~dp0"
if errorlevel 1 (
    echo [ERROR] Cannot open the project folder.
    pause
    exit /b 1
)

if /i "%~1"=="stop" goto :stop
if /i "%~1"=="status" goto :status
if not "%~1"=="" (
    echo Usage: start-server-prod.bat [stop^|status]
    goto :failed
)

if not exist "backend\.venv\Scripts\python.exe" (
    echo [ERROR] Python environment is missing. Run backend\scripts\setup.ps1 first.
    goto :failed
)
if not exist "backend\.env" (
    echo [ERROR] backend\.env is missing. Configure the server first.
    goto :failed
)
if not exist "backend\data\tunnel-demo\tunnel-token.txt" (
    echo [ERROR] Fixed-domain tunnel token is missing. See backend\docs\fixed-domain.md.
    goto :failed
)
powershell.exe -NoLogo -NoProfile -Command "if ([string]::IsNullOrWhiteSpace([IO.File]::ReadAllText('backend\data\tunnel-demo\tunnel-token.txt'))) { exit 1 }"
if errorlevel 1 (
    echo [ERROR] Fixed-domain tunnel token is empty.
    echo Copy the connector token from the bokji-compass tunnel in Cloudflare.
    echo Save the token or the full install command in backend\data\tunnel-demo\tunnel-token.txt.
    echo Then run start-server-prod.bat again.
    goto :failed
)
if not exist "frontend\web\node_modules\.bin\vite.cmd" (
    echo [ERROR] Web dependencies are missing. Run npm ci in frontend\web first.
    goto :failed
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js and npm are required.
    goto :failed
)

echo Building the public website...
call npm.cmd --prefix "frontend\web" run build
if errorlevel 1 goto :failed

echo Starting the project MySQL database...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\mysql.ps1" start
if errorlevel 1 (
    echo [ERROR] MySQL startup failed. Public server startup was cancelled.
    goto :failed
)
echo.

echo Starting the public servers; an existing fixed-domain tunnel will be reused...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" start -TunnelMode fixed -ReloadIfRunning
set "server_exit_code=%errorlevel%"
if not "%server_exit_code%"=="0" (
    echo [ERROR] Startup failed. Check the messages above.
    echo To inspect the server: start-server-prod.bat status
    echo To stop all public server processes: start-server-prod.bat stop
    goto :finished
)
echo.
echo Public address: https://bokji.commitnaru.com
echo The servers keep running after this window closes.
echo To stop them: start-server-prod.bat stop
echo MySQL is running and will remain running when the public servers stop.
goto :finished

:stop
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" stop
set "server_exit_code=%errorlevel%"
goto :finished

:status
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" status
set "server_exit_code=%errorlevel%"
goto :finished

:failed
set "server_exit_code=1"

:finished
popd
pause
exit /b %server_exit_code%
