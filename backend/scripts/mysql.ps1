param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
. "$PSScriptRoot\common.ps1"
Assert-Environment
Invoke-Checked $VenvPython @((Join-Path $PSScriptRoot 'mysql_dev.py'), $Action)
