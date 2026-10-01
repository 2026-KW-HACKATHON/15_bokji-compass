param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runtime = Join-Path $repoRoot 'backend\data\tunnel-demo\runtime'
$statePath = Join-Path $runtime 'processes.json'
$python = Join-Path $repoRoot 'backend\.venv\Scripts\python.exe'
$caddy = Join-Path $repoRoot 'tmp\tunnel-tools\caddy\caddy.exe'
$cloudflared = Join-Path $repoRoot 'tmp\tunnel-tools\cloudflared-windows-amd64.exe'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$state = @{ processes = @(); url = $null }
if (Test-Path -LiteralPath $statePath) {
    $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $state.processes = @($saved.processes)
    $state.url = $saved.url
}

function Save-State {
    [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 5), $utf8)
}

function Get-OwnedProcess($entry) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.started -and
        $process.Path -eq $entry.path) { return $process }
    return $null
}

function Stop-OwnedProcesses {
    $owned = @($state.processes)
    [array]::Reverse($owned)
    foreach ($entry in $owned) {
        if (Get-OwnedProcess $entry) {
            & taskkill.exe /PID $entry.id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not stop $($entry.name)" }
        }
    }
    $state.processes = @()
    $state.url = $null
    Save-State
}

function Start-OwnedProcess($name, $executable, $arguments) {
    $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden `
        -WorkingDirectory $repoRoot -PassThru `
        -RedirectStandardOutput (Join-Path $runtime "$runId.$name.stdout.log") `
        -RedirectStandardError (Join-Path $runtime "$runId.$name.stderr.log")
    $state.processes += @{
        name = $name; id = $process.Id; path = [IO.Path]::GetFullPath($executable)
        started = $process.StartTime.ToUniversalTime().Ticks.ToString()
    }
    Save-State
}

function Wait-Local($url) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Startup check failed: $url"
}

if ($Action -eq 'status') {
    foreach ($entry in $state.processes) {
        Write-Output "$($entry.name): $(if (Get-OwnedProcess $entry) { 'running' } else { 'stopped' })"
    }
    if ($state.url) { Write-Output $state.url }
    if (!$state.processes.Count) { Write-Output 'Tunnel is stopped.' }
    exit 0
}
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
if ($Action -eq 'stop') {
    Stop-OwnedProcesses
    Write-Output 'Tunnel, demo web server and demo API stopped. Demo database preserved.'
    exit 0
}
if (@($state.processes | Where-Object { Get-OwnedProcess $_ }).Count) {
    throw 'Share processes already exist. Use status or stop first.'
}
foreach ($file in @($python, $caddy, $cloudflared, (Join-Path $repoRoot 'frontend\web\dist\index.html'))) {
    if (!(Test-Path -LiteralPath $file)) { throw "Missing prerequisite: $file" }
}
foreach ($port in @(8001, 8080)) {
    $socket = New-Object Net.Sockets.TcpClient
    try { $socket.Connect('127.0.0.1', $port); throw "Port $port is already in use" }
    catch [Net.Sockets.SocketException] { }
    finally { $socket.Dispose() }
}
$state = @{ processes = @(); url = $null }
$runId = [guid]::NewGuid().ToString('N')
$config = Join-Path $runtime 'Caddyfile'
$template = Get-Content -LiteralPath (Join-Path $repoRoot 'frontend\web\deploy\Caddyfile.tunnel') -Raw
$dist = (Join-Path $repoRoot 'frontend\web\dist').Replace('\', '/')
[IO.File]::WriteAllText($config, $template.Replace('__DIST_ROOT__', $dist), $utf8)
try {
    & $caddy validate --config $config --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration is invalid' }
    Start-OwnedProcess 'backend' $python ('"' + (Join-Path $PSScriptRoot 'share-server.py') + '"')
    Wait-Local 'http://127.0.0.1:8001/health'
    Start-OwnedProcess 'web' $caddy ('run --config "' + $config + '" --adapter caddyfile')
    Wait-Local 'http://127.0.0.1:8080/api/health'
    Start-OwnedProcess 'tunnel' $cloudflared 'tunnel --no-autoupdate --url http://127.0.0.1:8080 --protocol http2'
    $tunnelLog = Join-Path $runtime "$runId.tunnel.stderr.log"
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (Test-Path -LiteralPath $tunnelLog) {
            $text = Get-Content -LiteralPath $tunnelLog -Raw
            $match = [regex]::Match("$text", 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($match.Success) {
                $state.url = $match.Value
                Save-State
                Write-Output "Demo URL: $($state.url)"
                exit 0
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Tunnel did not produce an address. Check local runtime logs.'
} catch {
    Stop-OwnedProcesses
    throw
}
