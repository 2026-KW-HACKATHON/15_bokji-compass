"""Isolated tunnel ownership, real readiness semantics, and fixed command arguments."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe")
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell required")


def run_tunnel(tmp_path, *, action="status", connected=True, wrong_owner=False, origin=True):
    root = tmp_path / "isolated project"
    scripts = root / "backend/scripts"
    scripts.mkdir(parents=True)
    script = scripts / "tunnel.ps1"
    script.write_text((BACKEND / "scripts/tunnel.ps1").read_text(encoding="utf-8"),
                      encoding="utf-8-sig")
    executable = root / "tmp/tunnel-tools/cloudflared-windows-amd64.exe"
    executable.parent.mkdir(parents=True)
    executable.touch()
    runtime = root / "backend/data/tunnel-demo/runtime"
    runtime.mkdir(parents=True)
    (runtime.parent / "tunnel-token.txt").write_text("a" * 80, encoding="utf-8")
    state_path = runtime / "processes.json"
    original = {"url": "https://example.invalid", "processes": [
        {"name": "backend", "id": 100, "path": "python.exe", "started": "0"},
        {"name": "tunnel", "id": 600, "path": str(executable),
         "started": "639268416000000000"}]}
    state_path.write_text(json.dumps(original), encoding="utf-8")
    wrapper = tmp_path / "tunnel-check.ps1"
    wrapper.write_text(rf'''
$env:TUNNEL_TOKEN = $null
$global:tunnelTest_running = $true
$global:tunnelTest_connected = ${str(connected).lower()}
$global:tunnelTest_id = 600
$global:tunnelTest_starts = @()
$global:tunnelTest_stops = @()
function Get-Process {{
    param($Id,$ErrorAction)
    if ($global:tunnelTest_running -and $Id -eq $global:tunnelTest_id) {{
        $path = '{str(executable)}'
        if (${str(wrong_owner).lower()}) {{ $path = 'another-project.exe' }}
        $record = [pscustomobject]@{{ Id=$Id;Path=$path;
            StartTime=[datetime]'2026-10-06T00:00:00Z';HasExited=$false }}
        $record | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {{
            param($Timeout) return $true
        }}
        return $record
    }}
}}
function Get-NetTCPConnection {{
    param($State,$OwningProcess,$ErrorAction)
    return [pscustomobject]@{{LocalAddress='127.0.0.1';LocalPort=20241}}
}}
function Invoke-WebRequest {{
    param($Uri,[switch]$UseBasicParsing,$TimeoutSec)
    if ($Uri -match '/ready$' -and !$global:tunnelTest_connected) {{ throw 'disconnected' }}
    if ($Uri -match ':8080/' -and !${str(origin).lower()}) {{ throw 'origin_down' }}
    return @{{StatusCode=200}}
}}
function Stop-Process {{
    param($Id,$ErrorAction)
    $global:tunnelTest_stops += $Id; $global:tunnelTest_running = $false
}}
function Start-Process {{
    param($FilePath,$ArgumentList,$WindowStyle,$WorkingDirectory,[switch]$PassThru,
        $RedirectStandardOutput,$RedirectStandardError)
    $global:tunnelTest_starts += @{{path=$FilePath;arguments=$ArgumentList;window=$WindowStyle}}
    $global:tunnelTest_running = $true; $global:tunnelTest_connected = $true
    $global:tunnelTest_id = 900
    return [pscustomobject]@{{Id=900;StartTime=[datetime]'2026-10-06T00:00:00Z';HasExited=$false}}
}}
function Start-Sleep {{ param($Seconds,$Milliseconds) }}
$failure=$null; $response=$null
try {{ $response = & '{str(script)}' -Action {action} }}
catch {{ $failure=$_.Exception.Message }}
Write-Output ('RESULT:' + (@{{response=$response;error=$failure;
    starts=@($global:tunnelTest_starts);stops=@($global:tunnelTest_stops)}} |
    ConvertTo-Json -Compress -Depth 8))
''', encoding="utf-8-sig")
    completed = subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass",
                                "-File", str(wrapper)], capture_output=True, text=True,
                               timeout=20, check=True)
    line = next(line for line in completed.stdout.splitlines() if line.startswith("RESULT:"))
    result = json.loads(line.removeprefix("RESULT:"))
    result["saved"] = json.loads(state_path.read_text(encoding="utf-8-sig"))
    result["locked"] = (runtime / "tunnel-control.lock").exists()
    return result


def test_running_process_is_not_reported_as_connected_without_ready_response(tmp_path):
    result = run_tunnel(tmp_path, connected=False)
    status = json.loads(result["response"])
    assert status["running"] is True and status["connected"] is False
    assert result["starts"] == result["stops"] == []
    assert not result["locked"]


def test_reused_process_identity_is_never_stopped(tmp_path):
    result = run_tunnel(tmp_path, action="stop", wrong_owner=True)
    assert result["error"] == "process_identity_changed"
    assert result["starts"] == result["stops"] == []
    assert [entry["id"] for entry in result["saved"]["processes"]] == [100, 600]
    assert not result["locked"]


def test_tunnel_restart_preserves_api_and_hides_token_value(tmp_path):
    result = run_tunnel(tmp_path, action="restart")
    assert result["stops"] == [600]
    assert len(result["starts"]) == 1
    assert result["starts"][0]["window"] == "Hidden"
    assert "--protocol auto" in result["starts"][0]["arguments"]
    assert "--token-file" in result["starts"][0]["arguments"]
    assert "a" * 80 not in json.dumps(result)
    assert [entry["id"] for entry in result["saved"]["processes"]] == [100, 900]
    assert not result["locked"]


def test_start_reuses_a_connected_tunnel(tmp_path):
    result = run_tunnel(tmp_path, action="start")
    assert result["error"] is None
    assert result["starts"] == result["stops"] == []


def test_restart_checks_local_web_before_stopping_the_existing_tunnel(tmp_path):
    result = run_tunnel(tmp_path, action="restart", origin=False)
    assert result["error"] == "origin_unavailable"
    assert result["starts"] == result["stops"] == []
    assert [entry["id"] for entry in result["saved"]["processes"]] == [100, 600]


def test_start_recovers_a_disconnected_process_instead_of_reusing_it(tmp_path):
    result = run_tunnel(tmp_path, action="start", connected=False)
    assert result["error"] is None
    assert result["stops"] == [600]
    assert json.loads(result["response"])["connected"] is True
