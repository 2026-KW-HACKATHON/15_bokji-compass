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
if /i "%~1"=="mysql" (
    set "service_script=mysql.ps1"
    goto :dependency
)
if /i "%~1"=="tunnel" (
    set "service_script=tunnel.ps1"
    goto :dependency
)
set "restart_requested=0"
if /i "%~1"=="restart" (
    set "restart_requested=1"
    goto :start
)
if /i "%~1"=="start" goto :start
if not "%~1"=="" (
    echo Usage: start-server-prod.bat [start^|stop^|restart^|status]
    echo Services: start-server-prod.bat mysql^|tunnel [start^|stop^|restart^|status]
    goto :failed
)

:start
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

if "%restart_requested%"=="1" (
    echo Stopping the public services and MySQL before restarting...
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" stop
    if errorlevel 1 goto :failed
    powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\mysql.ps1" stop
    if errorlevel 1 goto :failed
)

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
echo Stop shuts down API, web, QR, tunnel and MySQL.
echo Manage MySQL: start-server-prod.bat mysql start^|stop^|restart^|status
echo Manage tunnel: start-server-prod.bat tunnel start^|stop^|restart^|status
goto :finished

:stop
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" stop
if errorlevel 1 goto :failed
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\mysql.ps1" stop
set "server_exit_code=%errorlevel%"
goto :finished

:status
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\share.ps1" status
if errorlevel 1 goto :failed
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\tunnel.ps1" status
if errorlevel 1 goto :failed
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\mysql.ps1" status
set "server_exit_code=%errorlevel%"
goto :finished

:dependency
set "service_action=status"
if /i "%~2"=="start" set "service_action=start"
if /i "%~2"=="stop" set "service_action=stop"
if /i "%~2"=="restart" set "service_action=restart"
if /i "%~2"=="status" set "service_action=status"
if not "%~2"=="" if /i not "%~2"=="%service_action%" (
    echo [ERROR] Service action must be start, stop, restart or status.
    goto :failed
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "backend\scripts\%service_script%" %service_action%
set "server_exit_code=%errorlevel%"
goto :finished

:failed
set "server_exit_code=1"

:finished
popd
pause
exit /b %server_exit_code%
