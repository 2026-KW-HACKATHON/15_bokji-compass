. "$PSScriptRoot\common.ps1"
Assert-Environment
$uvExecutable = Join-Path $BackendRoot '.bootstrap\Scripts\uv.exe'
if (-not (Test-Path -LiteralPath $uvExecutable)) { throw 'Run setup.ps1 first.' }
$savedCache = $env:UV_CACHE_DIR
Push-Location $BackendRoot
try {
    $env:UV_CACHE_DIR = Join-Path $BackendRoot '.cache\uv'
    Invoke-Checked $uvExecutable @('pip', 'compile', 'requirements.in', '--python', '.venv/Scripts/python.exe', '--generate-hashes', '--output-file', 'requirements.txt', '--quiet')
    Invoke-Checked $uvExecutable @('pip', 'compile', 'requirements-dev.in', '--constraint', 'requirements.txt', '--python', '.venv/Scripts/python.exe', '--generate-hashes', '--output-file', 'requirements-dev.txt', '--quiet')
    Write-Host 'Generated requirements.txt and requirements-dev.txt.'
} finally {
    $env:UV_CACHE_DIR = $savedCache
    Pop-Location
}
