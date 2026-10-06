"""Process ownership checks use Windows command mocks; no real processes are killed."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe")
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell required")


def process(pid, script, parent=1):
    executable = str(BACKEND / ".venv/Scripts/python.exe")
    return {
        "ProcessId": pid,
        "ParentProcessId": parent,
        "Name": "python.exe",
        "ExecutablePath": executable,
        "CommandLine": f'"{executable}" "{script}" --reload',
        "CreationDate": "2026-10-06T00:00:00Z",
    }


def run_stop(tmp_path, processes, *, reuse=False, kill_failure=False, query_failure=False):
    mock_json = json.dumps(processes).replace("'", "''")
    stop_script = str(BACKEND / "scripts/stop-dev.ps1").replace("'", "''")
    wrapper = tmp_path / "stop-dev-check.ps1"
    wrapper.write_text(
        rf"""$global:stopDevTest_processes = ConvertFrom-Json -InputObject '{mock_json}'
$global:stopDevTest_killed = @()
$global:stopDevTest_reuse = ${str(reuse).lower()}
$global:stopDevTest_killFailure = ${str(kill_failure).lower()}
$global:stopDevTest_queryFailure = ${str(query_failure).lower()}
function Get-CimInstance {{
    param($ClassName, $Filter)
    if ($global:stopDevTest_queryFailure) {{ throw 'Access denied' }}
    if ($Filter -match '^ProcessId = (\d+)$') {{
        $targetId = [int]$Matches[1]
        $found = $global:stopDevTest_processes | Where-Object {{ $_.ProcessId -eq $targetId }} |
            ForEach-Object {{ $_.PSObject.Copy() }}
        if ($global:stopDevTest_reuse -and $found) {{
            $found.CreationDate = '2026-10-06T00:00:01Z'
        }}
        return $found
    }}
    return $global:stopDevTest_processes
}}
function taskkill.exe {{
    param([Parameter(ValueFromRemainingArguments=$true)]$Arguments)
    $targetId = [int]$Arguments[1]
    $global:stopDevTest_killed += $targetId
    if ($global:stopDevTest_killFailure) {{ $global:LASTEXITCODE = 5; return }}
    $global:stopDevTest_processes = @($global:stopDevTest_processes | Where-Object {{
        $_.ProcessId -ne $targetId -and $_.ParentProcessId -ne $targetId
    }})
    $global:LASTEXITCODE = 0
}}
$failure = $null
try {{ & '{stop_script}' }} catch {{ $failure = $_.Exception.Message }}
Write-Output ('RESULT:' + (@{{killed=@($global:stopDevTest_killed);error=$failure;
    remaining=@($global:stopDevTest_processes | ForEach-Object {{ $_.ProcessId }})
    }} | ConvertTo-Json -Compress))
""",
        encoding="utf-8",
    )
    completed = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(wrapper)],
        capture_output=True, text=True, check=True, timeout=20,
    )
    assert not completed.stderr, completed.stderr
    line = next(line for line in completed.stdout.splitlines() if line.startswith("RESULT:"))
    return json.loads(line.removeprefix("RESULT:"))


def test_stops_development_tree_and_preserves_other_servers(tmp_path):
    development = str(BACKEND / "server.py")
    rows = [process(101, development), process(102, development, parent=101),
            process(201, str(BACKEND / "scripts/share-server.py")),
            process(301, r"C:\other-project\server.py")]
    result = run_stop(tmp_path, rows)
    assert result == {"killed": [101], "error": None, "remaining": [201, 301]}


def test_path_mentioned_in_python_code_is_not_a_server(tmp_path):
    unrelated = process(201, str(BACKEND / "server.py"))
    unrelated["CommandLine"] = f'python.exe -c "print(\'{BACKEND / "server.py"}\')"'
    result = run_stop(tmp_path, [unrelated])
    assert result == {"killed": [], "error": None, "remaining": [201]}


def test_no_development_server_is_successful(tmp_path):
    assert run_stop(tmp_path, []) == {"killed": [], "error": None, "remaining": []}


def test_reused_pid_is_not_terminated(tmp_path):
    result = run_stop(tmp_path, [process(101, str(BACKEND / "server.py"))], reuse=True)
    assert result["killed"] == []
    assert "identity changed" in result["error"]


def test_failed_termination_blocks_startup(tmp_path):
    result = run_stop(tmp_path, [process(101, str(BACKEND / "server.py"))], kill_failure=True)
    assert result["remaining"] == [101]
    assert "Production startup cancelled" in result["error"]


def test_process_inspection_failure_is_not_ignored(tmp_path):
    result = run_stop(tmp_path, [], query_failure=True)
    assert result["killed"] == []
    assert "Access denied" in result["error"]
