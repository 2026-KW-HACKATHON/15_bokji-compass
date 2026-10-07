param(
    [ValidateSet('start', 'stop', 'status', 'reload')][string]$Action = 'status',
    [ValidateSet('auto', 'quick', 'fixed')][string]$TunnelMode = 'auto',
    [string]$PublicUrl = 'https://bokji.commitnaru.com',
    [string]$TunnelTokenFile = '',
    [switch]$ReloadIfRunning
)
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

function Start-QR {
    $env:EXHIBITION_AUTH_API_URL = 'http://127.0.0.1:8001'
    Start-OwnedProcess 'qr' $node ('"' + (Join-Path $repoRoot 'frontend\web\tools\exhibition\server.mjs') + '"')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5181/api/status' -TimeoutSec 2 | Out-Null }
        catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return }
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'QR gateway did not enforce its unauthenticated 401 boundary'
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
$node = (Get-Command node -ErrorAction Stop).Source
if ($Action -eq 'start') {
    if (!$TunnelTokenFile) {
        $TunnelTokenFile = Join-Path $repoRoot 'backend\data\tunnel-demo\tunnel-token.txt'
    }
    $TunnelTokenFile = [IO.Path]::GetFullPath($TunnelTokenFile)
    if ($TunnelMode -eq 'auto') {
        $TunnelMode = if (Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf) { 'fixed' } else { 'quick' }
    }
    if ($TunnelMode -eq 'fixed') {
        $publicUri = $null
        if (![Uri]::TryCreate($PublicUrl, [UriKind]::Absolute, [ref]$publicUri) -or
            $publicUri.Scheme -ne 'https' -or $publicUri.HostNameType -ne [UriHostNameType]::Dns -or
            $publicUri.IsLoopback -or !$publicUri.IsDefaultPort -or $publicUri.UserInfo -or
            $publicUri.AbsolutePath -ne '/' -or $publicUri.Query -or $publicUri.Fragment -or
            $publicUri.Host -notmatch '\.' -or $publicUri.Host -match '\.trycloudflare\.com$') {
            throw 'PublicUrl must be a fixed public HTTPS origin, without credentials, port or path.'
        }
        $PublicUrl = $publicUri.GetLeftPart([UriPartial]::Authority)
    }
    if ($ReloadIfRunning) {
        $tunnel = @($state.processes | Where-Object { $_.name -eq 'tunnel' })
        if ($tunnel.Count -eq 1 -and (Get-OwnedProcess $tunnel[0])) {
            $sameTarget = if ($TunnelMode -eq 'fixed') {
                ([string]$state.url).TrimEnd('/') -eq $PublicUrl
            } else {
                $state.url -match '^https://[a-z0-9-]+\.trycloudflare\.com/?$'
            }
            if (!$sameTarget) {
                throw 'The running tunnel uses a different URL or mode. Run start-server-prod.bat status or stop first.'
            }
            Write-Output "Reusing the running tunnel and restarting API, QR and web: $($state.url)"
            $Action = 'reload'
        }
    }
    if ($Action -eq 'start' -and @($state.processes | Where-Object { Get-OwnedProcess $_ }).Count) {
        throw 'Share processes already exist. Run start-server-prod.bat status or start-server-prod.bat stop first.'
    }
}
# Check reload prerequisites before stopping any running API or web process.
$requiredFiles = @($python, $node, $caddy, (Join-Path $repoRoot 'frontend\web\dist\index.html'))
if ($Action -eq 'start') { $requiredFiles += $cloudflared }
foreach ($file in $requiredFiles) {
    if (!(Test-Path -LiteralPath $file)) { throw "Missing prerequisite: $file" }
}
if ($Action -eq 'reload') {
    $tunnel = @($state.processes | Where-Object { $_.name -eq 'tunnel' })
    if ($tunnel.Count -ne 1 -or !(Get-OwnedProcess $tunnel[0])) { throw 'A running owned tunnel is required for reload' }
    $runId = [guid]::NewGuid().ToString('N')
    $config = Join-Path $runtime 'Caddyfile'
    $template = Get-Content -LiteralPath (Join-Path $repoRoot 'frontend\web\deploy\Caddyfile.tunnel') -Raw
    $dist = (Join-Path $repoRoot 'frontend\web\dist').Replace('\', '/')
    [IO.File]::WriteAllText($config, $template.Replace('__DIST_ROOT__', $dist), $utf8)
    & $caddy validate --config $config --adapter caddyfile
    if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration is invalid' }
    & (Join-Path $PSScriptRoot 'stop-dev.ps1')
    foreach ($entry in @($state.processes | Where-Object { $_.name -in @('web', 'qr', 'backend') })) {
        if (Get-OwnedProcess $entry) {
            & taskkill.exe /PID $entry.id /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not reload $($entry.name)" }
        }
    }
    $state.processes = @($state.processes | Where-Object { $_.name -notin @('web', 'qr', 'backend') })
    Save-State
    Start-OwnedProcess 'backend' $python ('"' + (Join-Path $PSScriptRoot 'share-server.py') + '"')
    Wait-Local 'http://127.0.0.1:8001/health'
    Start-QR
    Start-OwnedProcess 'web' $caddy ('run --config "' + $config + '" --adapter caddyfile')
    Wait-Local 'http://127.0.0.1:8080/api/health'
    Write-Output "Website and authenticated admin gateway updated; tunnel URL unchanged: $($state.url)"
    exit 0
}
if ($TunnelMode -eq 'fixed') {
    if (!(Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf)) {
        throw 'Fixed tunnel token file is missing. See backend/docs/fixed-domain.md.'
    }
    $tokenInput = [IO.File]::ReadAllText($TunnelTokenFile).Trim()
    if (!$tokenInput) {
        throw 'Fixed tunnel token file is empty.'
    }
    # Accept the copied install command as data; never execute its contents.
    $tokenMatch = [regex]::Match($tokenInput, '^(?:cloudflared(?:\.exe)?\s+service install\s+)?([A-Za-z0-9+/_=-]{80,})$')
    if (!$tokenMatch.Success) {
        throw 'Fixed tunnel token file must contain the token or the copied cloudflared install command.'
    }
    [IO.File]::WriteAllText($TunnelTokenFile, $tokenMatch.Groups[1].Value + [Environment]::NewLine, $utf8)
    $tokenInput = $null
    $tokenMatch = $null
    if ($env:TUNNEL_TOKEN) {
        throw 'TUNNEL_TOKEN overrides token-file. Unset it before starting the fixed tunnel.'
    }
}
foreach ($port in @(8001, 8080, 5181)) {
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
    & (Join-Path $PSScriptRoot 'stop-dev.ps1')
    Start-OwnedProcess 'backend' $python ('"' + (Join-Path $PSScriptRoot 'share-server.py') + '"')
    Wait-Local 'http://127.0.0.1:8001/health'
    Start-QR
    Start-OwnedProcess 'web' $caddy ('run --config "' + $config + '" --adapter caddyfile')
    Wait-Local 'http://127.0.0.1:8080/api/health'
    if ($TunnelMode -eq 'fixed') {
        # Only the ignored token-file path appears in the process command line.
        Start-OwnedProcess 'tunnel' $cloudflared ('tunnel --no-autoupdate --protocol http2 run --token-file "' + $TunnelTokenFile + '"')
    } else {
        Start-OwnedProcess 'tunnel' $cloudflared 'tunnel --no-autoupdate --url http://127.0.0.1:8080 --protocol http2'
    }
    $tunnelLog = Join-Path $runtime "$runId.tunnel.stderr.log"
    for ($attempt = 0; $attempt -lt 90; $attempt++) {
        if (Test-Path -LiteralPath $tunnelLog) {
            $text = Get-Content -LiteralPath $tunnelLog -Raw
            if ($TunnelMode -eq 'fixed' -and $text -match 'Registered tunnel connection') {
                $state.url = $PublicUrl
                Save-State
                Write-Output "Fixed tunnel connected: $($state.url)"
                Write-Output 'External DNS, HTTPS and API checks are still required.'
                exit 0
            }
            $match = [regex]::Match("$text", 'https://[a-z0-9-]+\.trycloudflare\.com')
            if ($TunnelMode -eq 'quick' -and $match.Success) {
                $state.url = $match.Value
                Save-State
                Write-Output "Demo URL: $($state.url)"
                exit 0
            }
        }
        Start-Sleep -Milliseconds 500
    }
    throw 'Tunnel did not connect. Check local runtime logs.'
} catch {
    Stop-OwnedProcesses
    throw
}
