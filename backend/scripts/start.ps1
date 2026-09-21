param([switch]$Reload)
. "$PSScriptRoot\common.ps1"
Assert-Environment
$serverArguments = @((Join-Path $BackendRoot 'server.py'))
if ($Reload) { $serverArguments += '--reload' }
Invoke-Checked $VenvPython $serverArguments
