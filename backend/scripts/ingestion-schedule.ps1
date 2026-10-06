<#
.SYNOPSIS
Install, inspect, or remove the project's Windows ingestion task.
.DESCRIPTION
Install registers a disabled task unless EnableLiveCollection is supplied. No job is started
immediately. Requires the execution user's Codex login and independently running MySQL.
Uses AC-power defaults, interactive logon, IgnoreNew, catch-up, and an 11-minute execution limit.
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Remove', 'Status')]
    [string]$Action = 'Status',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')]
    [string]$TaskName = 'BokjiCompass-Ingestion',
    [string]$PythonExecutable = '',
    [switch]$EnableLiveCollection,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
if ($Json) { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) }
function Write-TaskResult {
    param($Value)
    if ($Json) { ConvertTo-Json -InputObject $Value -Compress -Depth 4 }
    else { Write-Output $Value }
}
$backendPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskDescription = "BokjiCompass managed ingestion task; workspace=$backendPath"
$task = Get-ScheduledTask -TaskName $TaskName -TaskPath '\' -ErrorAction SilentlyContinue

if ($Action -eq 'Status') {
    if ($null -eq $task) {
        Write-TaskResult ([pscustomobject]@{ TaskName = $TaskName; State = 'NotInstalled' })
        exit 0
    }
    if ($task.Description -ne $taskDescription) {
        throw 'The task name belongs to a different workspace. Choose another TaskName.'
    }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath '\'
    Write-TaskResult ([pscustomobject]@{
        TaskName = $TaskName
        State = $task.State
        LiveCollectionEnabled = [bool]$task.Settings.Enabled
        LastRunTime = $info.LastRunTime
        LastTaskResult = $info.LastTaskResult
        NextRunTime = $info.NextRunTime
        ExecutionUser = $task.Principal.UserId
        WorkingDirectory = $task.Actions.WorkingDirectory
    })
    exit 0
}

if ($Action -eq 'Remove') {
    if ($null -eq $task) {
        Write-TaskResult ([pscustomobject]@{ State = 'NotInstalled'; LiveCollectionEnabled = $false })
        exit 0
    }
    if ($task.Description -ne $taskDescription) {
        throw 'The task name belongs to a different workspace; no task was removed.'
    }
    Unregister-ScheduledTask -TaskName $TaskName -TaskPath '\' -Confirm:$false
    Write-TaskResult ([pscustomobject]@{ State = 'NotInstalled'; LiveCollectionEnabled = $false })
    exit 0
}

if ($null -ne $task) {
    throw 'Task already exists. Inspect Status and use Remove before installing changed settings.'
}
if (-not $PythonExecutable) {
    $PythonExecutable = Join-Path $backendPath '.venv\Scripts\python.exe'
}
$pythonPath = (Resolve-Path -LiteralPath $PythonExecutable).Path
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw 'A Python executable is required.'
}

$executionUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$workerArguments = '-m app.modules.ingestion tick'
if ($EnableLiveCollection) {
    $workerArguments += ' --live'
}
$taskAction = New-ScheduledTaskAction -Execute $pythonPath `
    -Argument $workerArguments -WorkingDirectory $backendPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId $executionUser `
    -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 11)
# Defaults intentionally prohibit starting on battery and stop on battery transition.
# Set Enabled before registration to avoid a first-run window for the default disabled install.
$settings.Enabled = [bool]$EnableLiveCollection
$definition = New-ScheduledTask -Action $taskAction -Trigger $trigger -Principal $principal `
    -Settings $settings -Description $taskDescription
Register-ScheduledTask -TaskName $TaskName -TaskPath '\' -InputObject $definition | Out-Null
Write-TaskResult ([pscustomobject]@{
    TaskName = $TaskName
    LiveCollectionEnabled = [bool]$EnableLiveCollection
    ExecutionUser = $executionUser
    IntervalMinutes = 10
    ExecutionLimitMinutes = 11
    Requires = 'Running MySQL, project DB configuration, and Codex login for this user'
})
