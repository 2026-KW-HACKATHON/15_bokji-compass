param(
    [Parameter(Mandatory = $true)][string[]]$InputPath,
    [switch]$PrepareOnly,
    [ValidateSet('mysql', 'json')][string]$Storage = 'mysql'
)
. "$PSScriptRoot\common.ps1"
Assert-Environment
$parseArguments = @('-m', 'app.modules.pipeline', '--input') + $InputPath
if ($PrepareOnly) { $parseArguments += '--prepare-only' }
$parseArguments += @('--storage', $Storage)
Push-Location $BackendRoot
try {
    Invoke-Checked $VenvPython $parseArguments
} finally {
    Pop-Location
}
