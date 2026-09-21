. "$PSScriptRoot\common.ps1"
Assert-Environment
Push-Location $BackendRoot
try {
    $testTemp = Join-Path $BackendRoot ('.cache\test-runs\' + [guid]::NewGuid().ToString('N'))
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $testTemp)) | Out-Null
    Invoke-Checked $VenvPython @('-m', 'pytest', '--basetemp', $testTemp, '-p', 'no:cacheprovider')
    Invoke-Checked $VenvPython @('-m', 'ruff', 'check', '.', '--no-cache')
    Invoke-Checked $VenvPython @('-m', 'pip', 'check')
} finally {
    Pop-Location
}
