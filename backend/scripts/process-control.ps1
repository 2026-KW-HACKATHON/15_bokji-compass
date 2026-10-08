param(
    [ValidateSet('Status', 'Stop', 'Restart')][string]$Action = 'Status',
    [ValidateSet('backend', 'frontend', 'all')][string]$Target = 'backend',
    [int]$ServerProcessId,
    [ValidatePattern('^[a-f0-9-]{36}$')][string]$JobId = ''
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backendRoot = Join-Path $repoRoot 'backend'
$webRoot = Join-Path $repoRoot 'frontend\web'
$runtime = Join-Path $backendRoot 'data\tunnel-demo\runtime'
$statePath = Join-Path $runtime 'processes.json'
$controlRoot = Join-Path $backendRoot 'data\server-control'
$python = Join-Path $backendRoot '.venv\Scripts\python.exe'
$devScript = Join-Path $backendRoot 'server.py'
$shareScript = Join-Path $PSScriptRoot 'share-server.py'
$viteScript = Join-Path $webRoot 'node_modules\vite\bin\vite.js'
$qrScript = Join-Path $webRoot 'tools\exhibition\server.mjs'
$caddy = Join-Path $repoRoot 'tmp\tunnel-tools\caddy\caddy.exe'
$caddyConfig = Join-Path $runtime 'Caddyfile'
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Test-ScriptProcess($process, $script, $kind) {
    if (!$process -or !$process.ExecutablePath -or $process.Name -notmatch $kind) { return $false }
    $match = [regex]::Match($process.CommandLine,
        '^\s*(?:"[^"]+"|\S+)\s+(?:"(?<script>[^"]+)"|(?<script>\S+))(?:\s|$)')
    if (!$match.Success -or ![IO.Path]::IsPathRooted($match.Groups['script'].Value)) { return $false }
    try { $argument = [IO.Path]::GetFullPath($match.Groups['script'].Value) }
    catch { return $false }
    return [string]::Equals($argument, $script, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ScriptProcesses($script, $kind) {
    @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe' OR Name = 'node.exe'" |
        Where-Object { Test-ScriptProcess $_ $script $kind })
}

function Read-ShareState {
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        return @{ processes = @($saved.processes); url = $saved.url }
    }
    return @{ processes = @(); url = $null }
}

function Get-OwnedProcess($entry) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.started -and
        $process.Path -eq $entry.path) { return $process }
    return $null
}

function Get-Profile {
    $development = @(Get-ScriptProcesses $devScript '^python(?:w)?\.exe$')
    if ($ServerProcessId -in @($development | ForEach-Object { $_.ProcessId })) {
        return @{ mode = 'development'; backend = $development;
            frontend = @(Get-ScriptProcesses $viteScript '^node\.exe$') }
    }
    $shared = @(Get-ScriptProcesses $shareScript '^python(?:w)?\.exe$')
    $source = $shared | Where-Object { $_.ProcessId -eq $ServerProcessId } | Select-Object -First 1
    $saved = Read-ShareState
    $entry = $saved.processes | Where-Object { $_.name -eq 'backend' } | Select-Object -First 1
    if ($source -and $entry -and (Get-OwnedProcess $entry) -and
        ($source.ProcessId -eq $entry.id -or $source.ParentProcessId -eq $entry.id)) {
        return @{ mode = 'shared'; backend = @($shared | Where-Object {
            $_.ProcessId -eq $entry.id -or $_.ParentProcessId -eq $entry.id }); saved = $saved }
    }
    return @{ mode = 'unmanaged'; backend = @() }
}

function Get-Status($profile) {
    $frontRunning = $false
    if ($profile.mode -eq 'development') { $frontRunning = [bool]$profile.frontend.Count }
    if ($profile.mode -eq 'shared') {
        $frontRunning = [bool]@($profile.saved.processes | Where-Object {
            $_.name -eq 'web' -and (Get-OwnedProcess $_) }).Count
    }
    return @{ supported = $true; mode = $profile.mode; current_pid = $ServerProcessId;
        backend = @{ running = $true; controllable = ($profile.mode -ne 'unmanaged') };
        frontend = @{ running = $frontRunning; controllable = ($profile.mode -ne 'unmanaged') } }
}

function Stop-ScriptProcesses($processes, $script, $kind) {
    foreach ($process in $processes) {
        $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ProcessId)"
        if (!$current) { continue }
        if (!(Test-ScriptProcess $current $script $kind) -or
            $current.CreationDate -ne $process.CreationDate -or
            $current.ExecutablePath -ne $process.ExecutablePath) { throw 'process_identity_changed' }
        # Do not kill the tree: the independent management helper must survive API shutdown.
        & taskkill.exe /PID $process.ProcessId /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'process_stop_failed' }
    }
}

function Save-ShareState($saved) {
    [IO.File]::WriteAllText($statePath, ($saved | ConvertTo-Json -Depth 5), $utf8)
}

function Stop-Shared($saved, $names) {
    foreach ($entry in @($saved.processes | Where-Object { $_.name -in $names })) {
        if (Get-OwnedProcess $entry) {
            # Stop the known root and its validated API child individually, keeping this helper alive.
            if ($entry.name -eq 'backend') {
                $children = @(Get-ScriptProcesses $shareScript '^python(?:w)?\.exe$' |
                    Where-Object { $_.ProcessId -eq $entry.id -or $_.ParentProcessId -eq $entry.id })
                Stop-ScriptProcesses $children $shareScript '^python(?:w)?\.exe$'
            } else {
                & taskkill.exe /PID $entry.id /T /F | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'process_stop_failed' }
            }
        } elseif (Get-Process -Id $entry.id -ErrorAction SilentlyContinue) {
            throw 'process_identity_changed'
        }
    }
    $saved.processes = @($saved.processes | Where-Object { $_.name -notin $names })
    Save-ShareState $saved
}

function Start-Managed($name, $executable, $arguments, $workingDirectory, $saved = $null) {
    if (!(Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'runtime_missing' }
    $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden `
        -WorkingDirectory $workingDirectory -PassThru `
        -RedirectStandardOutput (Join-Path $controlRoot "$JobId.$name.stdout.log") `
        -RedirectStandardError (Join-Path $controlRoot "$JobId.$name.stderr.log")
    if ($saved) {
        $saved.processes += @{ name = $name; id = $process.Id;
            path = [IO.Path]::GetFullPath($executable);
            started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
        Save-ShareState $saved
    }
    return $process
}

function Wait-Local($url, $process) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($process.HasExited) { throw 'startup_failed' }
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
            if ($response.StatusCode -eq 200) { return }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    throw 'startup_failed'
}

function Wait-QR($process) {
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($process.HasExited) { throw 'startup_failed' }
        try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5181/api/status' -TimeoutSec 1 | Out-Null }
        catch {
            if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { return }
        }
        Start-Sleep -Milliseconds 250
    }
    throw 'startup_failed'
}

if ($Action -eq 'Status') { Get-Status (Get-Profile) | ConvertTo-Json -Compress -Depth 5; exit 0 }
if (!$JobId) { throw 'job_required' }
$jobPath = Join-Path $controlRoot "$JobId.json"
$lockPath = Join-Path $controlRoot 'active.lock'
$job = Get-Content -LiteralPath $jobPath -Raw | ConvertFrom-Json
if ($job.id -ne $JobId -or $job.action -ne $Action.ToLowerInvariant() -or $job.target -ne $Target -or
    $job.source_pid -ne $ServerProcessId -or (Get-Content -LiteralPath $lockPath -Raw) -ne $JobId) {
    throw 'job_mismatch'
}

function Save-Job {
    $temporary = Join-Path $controlRoot "$JobId.tmp"
    [IO.File]::WriteAllText($temporary, ($job | ConvertTo-Json -Compress -Depth 5), $utf8)
    Move-Item -LiteralPath $temporary -Destination $jobPath -Force
}

try {
    $profile = Get-Profile
    if ($profile.mode -eq 'unmanaged') { throw 'unmanaged_runtime' }
    $job.status = 'running'; Save-Job
    # Allow the initiating HTTP response to arrive before its API process is stopped.
    Start-Sleep -Seconds 2
    $node = $null
    if ($Action -eq 'Restart') {
        if (!(Test-Path -LiteralPath $python)) { throw 'runtime_missing' }
        if ($Target -in @('frontend', 'all')) {
            $node = (Get-Command node.exe -ErrorAction Stop).Source
            if ($profile.mode -eq 'development' -and !(Test-Path -LiteralPath $viteScript)) {
                throw 'runtime_missing'
            }
            if ($profile.mode -eq 'shared') {
                & $caddy validate --config $caddyConfig --adapter caddyfile | Out-Null
                if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $qrScript)) {
                    throw 'configuration_invalid'
                }
            }
        }
    }
    if ($profile.mode -eq 'development') {
        if ($Target -in @('frontend', 'all')) {
            Stop-ScriptProcesses $profile.frontend $viteScript '^node\.exe$'
        }
        if ($Target -in @('backend', 'all')) {
            Stop-ScriptProcesses $profile.backend $devScript '^python(?:w)?\.exe$'
        }
        if ($Action -eq 'Restart') {
            if ($Target -in @('backend', 'all')) {
                $env:SERVER_HOST = [string]$job.host
                $env:SERVER_PORT = [string]$job.port
                $process = Start-Managed 'backend' $python ('"' + $devScript + '"') $backendRoot
                $expectedPort = [int]$job.port
                Wait-Local "http://127.0.0.1:$expectedPort/health" $process
            }
            if ($Target -in @('frontend', 'all')) {
                $process = Start-Managed 'frontend' $node ('"' + $viteScript + '" --host 127.0.0.1') $webRoot
                Wait-Local 'http://127.0.0.1:5173/' $process
            }
        }
    } else {
        $names = @()
        if ($Target -in @('frontend', 'all')) { $names += @('web', 'qr') }
        if ($Target -in @('backend', 'all')) { $names += 'backend' }
        Stop-Shared $profile.saved $names
        if ($Action -eq 'Restart') {
            if ($Target -in @('backend', 'all')) {
                $process = Start-Managed 'backend' $python ('"' + $shareScript + '"') $repoRoot $profile.saved
                Wait-Local 'http://127.0.0.1:8001/health' $process
            }
            if ($Target -in @('frontend', 'all')) {
                $env:EXHIBITION_AUTH_API_URL = 'http://127.0.0.1:8001'
                $qrProcess = Start-Managed 'qr' $node ('"' + $qrScript + '"') $repoRoot $profile.saved
                Wait-QR $qrProcess
                $process = Start-Managed 'web' $caddy ('run --config "' + $caddyConfig + '" --adapter caddyfile') $repoRoot $profile.saved
                Wait-Local 'http://127.0.0.1:8080/' $process
            }
        }
    }
    $job.status = 'completed'; $job.error_code = $null
} catch {
    $job.status = 'failed'
    $known = @('process_identity_changed', 'process_stop_failed', 'runtime_missing',
        'configuration_invalid', 'startup_failed', 'unmanaged_runtime')
    $job.error_code = if ($_.Exception.Message -in $known) { $_.Exception.Message } else { 'control_failed' }
} finally {
    $job.finished_at = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    Save-Job
    if ((Test-Path -LiteralPath $lockPath) -and (Get-Content -LiteralPath $lockPath -Raw) -eq $JobId) {
        Remove-Item -LiteralPath $lockPath
    }
}
