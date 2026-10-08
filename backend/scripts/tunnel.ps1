param(
    [ValidateSet('start', 'stop', 'restart', 'status')][string]$Action = 'status',
    [string]$PublicUrl = 'https://bokji.commitnaru.com',
    [string]$TunnelTokenFile = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$runtime = Join-Path $repoRoot 'backend\data\tunnel-demo\runtime'
$statePath = Join-Path $runtime 'processes.json'
$cloudflared = Join-Path $repoRoot 'tmp\tunnel-tools\cloudflared-windows-amd64.exe'
$utf8 = [System.Text.UTF8Encoding]::new($false)
if (!$TunnelTokenFile) { $TunnelTokenFile = Join-Path $runtime '..\tunnel-token.txt' }
$TunnelTokenFile = [IO.Path]::GetFullPath($TunnelTokenFile)

function Read-State {
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        return @{ processes = @($saved.processes); url = $saved.url }
    }
    return @{ processes = @(); url = $null }
}
function Save-State($saved) {
    [IO.File]::WriteAllText($statePath, ($saved | ConvertTo-Json -Depth 5), $utf8)
}
function Get-OwnedTunnel($saved) {
    $entries = @($saved.processes | Where-Object name -eq 'tunnel')
    if ($entries.Count -gt 1) { throw 'process_identity_changed' }
    if (!$entries.Count) { return $null }
    $entry = $entries[0]
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if (!$process) { return $null }
    if ($entry.path -ne $cloudflared -or $process.Path -ne $entry.path -or
        $process.StartTime.ToUniversalTime().Ticks.ToString() -ne $entry.started) {
        throw 'process_identity_changed'
    }
    return $process
}
function Get-TunnelStatus($saved) {
    $process = Get-OwnedTunnel $saved
    $connected = $false
    if ($process) {
        # Discover only this verified process's loopback metrics listener.
        $listeners = @(Get-NetTCPConnection -State Listen -OwningProcess $process.Id -ErrorAction SilentlyContinue |
            Where-Object LocalAddress -eq '127.0.0.1')
        foreach ($listener in $listeners) {
            try {
                $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$($listener.LocalPort)/ready" -TimeoutSec 1
                if ($response.StatusCode -eq 200) { $connected = $true; break }
            } catch { }
        }
    }
    return @{ running = [bool]$process; connected = $connected; url = $saved.url;
        controllable = ((Test-Path -LiteralPath $cloudflared -PathType Leaf) -and
            (Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf) -and
            (!$saved.url -or $saved.url -notmatch '\.trycloudflare\.com')) }
}
function Stop-Tunnel($saved) {
    $process = Get-OwnedTunnel $saved
    if ($process) { Stop-Process -Id $process.Id -ErrorAction Stop; $process.WaitForExit(5000) | Out-Null }
    $saved.processes = @($saved.processes | Where-Object name -ne 'tunnel')
    Save-State $saved
}
function Assert-TunnelPrerequisites {
    if ($env:TUNNEL_TOKEN) { throw 'configuration_invalid' }
    if (!(Test-Path -LiteralPath $cloudflared -PathType Leaf) -or
        !(Test-Path -LiteralPath $TunnelTokenFile -PathType Leaf)) { throw 'runtime_missing' }
    $publicUri = $null
    if (![Uri]::TryCreate($PublicUrl, [UriKind]::Absolute, [ref]$publicUri) -or
        $publicUri.Scheme -ne 'https' -or $publicUri.HostNameType -ne [UriHostNameType]::Dns -or
        $publicUri.IsLoopback -or !$publicUri.IsDefaultPort -or $publicUri.UserInfo -or
        $publicUri.AbsolutePath -ne '/' -or $publicUri.Query -or $publicUri.Fragment -or
        $publicUri.Host -notmatch '\.' -or $publicUri.Host -match '\.trycloudflare\.com$') {
        throw 'configuration_invalid'
    }
    $tokenInput = [IO.File]::ReadAllText($TunnelTokenFile).Trim()
    $tokenMatch = [regex]::Match($tokenInput, '^(?:cloudflared(?:\.exe)?\s+service install\s+)?([A-Za-z0-9+/_=-]{80,})$')
    if (!$tokenMatch.Success) { throw 'configuration_invalid' }
    [IO.File]::WriteAllText($TunnelTokenFile, $tokenMatch.Groups[1].Value + [Environment]::NewLine, $utf8)
    $tokenInput = $null; $tokenMatch = $null
    # A tunnel is useful only after its local origin is responding.
    try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/' -TimeoutSec 3 | Out-Null }
    catch { throw 'origin_unavailable' }
    return $publicUri
}
function Start-Tunnel($saved, $publicUri = $null) {
    $existing = Get-OwnedTunnel $saved
    if ($existing -and (Get-TunnelStatus $saved).connected) { return }
    if (!$publicUri) { $publicUri = Assert-TunnelPrerequisites }
    if ($existing) { Stop-Tunnel $saved }
    $runId = [guid]::NewGuid().ToString('N')
    $process = Start-Process -FilePath $cloudflared -WindowStyle Hidden -PassThru -WorkingDirectory $repoRoot `
        -ArgumentList ('tunnel --no-autoupdate --no-prechecks --protocol auto --edge-ip-version 4 run --token-file "' + $TunnelTokenFile + '"') `
        -RedirectStandardOutput (Join-Path $runtime "$runId.tunnel.stdout.log") `
        -RedirectStandardError (Join-Path $runtime "$runId.tunnel.stderr.log")
    $saved.processes = @($saved.processes | Where-Object name -ne 'tunnel') + @(@{
        name = 'tunnel'; id = $process.Id; path = $cloudflared;
        started = $process.StartTime.ToUniversalTime().Ticks.ToString() })
    $saved.url = $publicUri.GetLeftPart([UriPartial]::Authority)
    Save-State $saved
    try {
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if ($process.HasExited) { throw 'startup_failed' }
            if ((Get-TunnelStatus $saved).connected) { return }
            Start-Sleep -Milliseconds 500
        }
        throw 'startup_failed'
    } catch { Stop-Tunnel $saved; throw }
}

$saved = Read-State
if ($Action -eq 'status') { Get-TunnelStatus $saved | ConvertTo-Json -Compress; exit 0 }
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$lockPath = Join-Path $runtime 'tunnel-control.lock'
$lockStream = $null
try {
    $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $saved = Read-State
    if ($saved.url) { $PublicUrl = $saved.url }
    $publicUri = $null
    if ($Action -eq 'restart') { $publicUri = Assert-TunnelPrerequisites }
    if ($Action -in @('stop', 'restart')) { Stop-Tunnel $saved }
    if ($Action -in @('start', 'restart')) { Start-Tunnel $saved $publicUri }
    Get-TunnelStatus $saved | ConvertTo-Json -Compress
} finally {
    if ($lockStream) { $lockStream.Dispose(); Remove-Item -LiteralPath $lockPath }
}
