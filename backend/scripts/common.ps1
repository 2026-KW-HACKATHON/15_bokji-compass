$ErrorActionPreference = 'Stop'
$BackendRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $BackendRoot '.venv\Scripts\python.exe'

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed (exit $LASTEXITCODE): $Executable"
    }
}

function Assert-Environment {
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        throw 'Run scripts/setup.ps1 first.'
    }
    Invoke-Checked $VenvPython @('-c', 'import sys; assert sys.version_info[:2] == (3, 13), "Python 3.13 required"')
}
