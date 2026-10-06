$ErrorActionPreference = 'Stop'
$developmentScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\server.py'))

function Test-DevelopmentServer($process) {
    if (!$process -or $process.Name -notmatch '^python(?:w)?\.exe$' -or !$process.ExecutablePath) {
        return $false
    }
    # Match the script argument, not a port or a path mentioned inside Python code.
    $arguments = [regex]::Match($process.CommandLine,
        '^\s*(?:"[^"]+"|\S+)\s+(?:"(?<script>[^"]+)"|(?<script>\S+))(?:\s|$)')
    return $arguments.Success -and
        [string]::Equals($arguments.Groups['script'].Value, $developmentScript,
            [StringComparison]::OrdinalIgnoreCase)
}

function Get-DevelopmentServers {
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" |
        Where-Object { Test-DevelopmentServer $_ }
}

$servers = @(Get-DevelopmentServers)
$serverIds = @($servers | ForEach-Object { $_.ProcessId })
# Windows virtualenv Python has a child Python process. Stop its tree just once.
$roots = @($servers | Where-Object { $_.ParentProcessId -notin $serverIds })
foreach ($server in $roots) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($server.ProcessId)"
    if (!$current) { continue }
    if (!(Test-DevelopmentServer $current) -or
        $current.CreationDate -ne $server.CreationDate -or
        $current.ExecutablePath -ne $server.ExecutablePath) {
        throw "Development server identity changed; refusing to stop PID $($server.ProcessId)."
    }
    & taskkill.exe /PID $server.ProcessId /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not stop development API PID $($server.ProcessId). Production startup cancelled."
    }
    Write-Output "Development API stopped (PID $($server.ProcessId))."
}
if (@(Get-DevelopmentServers).Count) {
    throw 'A development API is still running. Production startup cancelled.'
}
if (!$servers.Count) { Write-Output 'No project development API is running.' }
