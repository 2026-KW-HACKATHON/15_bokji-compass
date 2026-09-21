param(
    [string]$PythonExecutable = 'python',
    [switch]$RuntimeOnly
)
. "$PSScriptRoot\common.ps1"

$bootstrapRoot = Join-Path $BackendRoot '.bootstrap'
$bootstrapPython = Join-Path $bootstrapRoot 'Scripts\python.exe'
$uvExecutable = Join-Path $bootstrapRoot 'Scripts\uv.exe'
$savedCache = $env:UV_CACHE_DIR
$savedPythonDirectory = $env:UV_PYTHON_INSTALL_DIR
try {
    $env:UV_CACHE_DIR = Join-Path $BackendRoot '.cache\uv'
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $BackendRoot '.python'
    if (-not (Test-Path -LiteralPath $bootstrapPython)) {
        Invoke-Checked $PythonExecutable @('-c', 'import sys; assert sys.version_info >= (3, 10), "Bootstrap requires Python 3.10+"')
        Invoke-Checked $PythonExecutable @('-m', 'venv', $bootstrapRoot)
    }
    Invoke-Checked $bootstrapPython @('-m', 'pip', 'install', '--disable-pip-version-check', '--cache-dir', (Join-Path $BackendRoot '.cache\pip'), 'uv==0.12.16')
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        Invoke-Checked $uvExecutable @('venv', (Join-Path $BackendRoot '.venv'), '--python', '3.13', '--seed')
    }
    Assert-Environment
    $requirementsName = if ($RuntimeOnly) { 'requirements.txt' } else { 'requirements-dev.txt' }
    Invoke-Checked $uvExecutable @('pip', 'sync', (Join-Path $BackendRoot $requirementsName), '--python', $VenvPython, '--require-hashes')
    Invoke-Checked $VenvPython @('-m', 'pip', 'check')
    $envPath = Join-Path $BackendRoot '.env'
    if (-not (Test-Path -LiteralPath $envPath)) {
        Copy-Item -LiteralPath (Join-Path $BackendRoot '.env.example') -Destination $envPath
    }
    Write-Host 'Setup complete. Existing .env was preserved.'
    Write-Host 'Start: powershell -ExecutionPolicy Bypass -File backend/scripts/start.ps1'
} finally {
    $env:UV_CACHE_DIR = $savedCache
    $env:UV_PYTHON_INSTALL_DIR = $savedPythonDirectory
}
