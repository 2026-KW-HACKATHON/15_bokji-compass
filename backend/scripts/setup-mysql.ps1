param([string]$MySqlExecutable, [int]$Port = 3307)
. "$PSScriptRoot\common.ps1"
Assert-Environment
$mysqlArguments = @((Join-Path $PSScriptRoot 'mysql_dev.py'), 'setup', '--port', "$Port")
if ($MySqlExecutable) { $mysqlArguments += @('--mysqld', $MySqlExecutable) }
Invoke-Checked $VenvPython $mysqlArguments
