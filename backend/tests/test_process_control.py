"""Native PowerShell ownership checks with mocked process commands and isolated state."""

import json
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest

BACKEND = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe")
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell required")


def run_control(tmp_path, *, action="Stop", target="backend", shared=False, reuse=False,
                code_only=False):
    root = tmp_path / "isolated project"
    script_dir = root / "backend/scripts"
    script_dir.mkdir(parents=True)
    script = script_dir / "process-control.ps1"
    script.write_text((BACKEND / "scripts/process-control.ps1").read_text(encoding="utf-8"),
                      encoding="utf-8-sig")
    python = root / "backend/.venv/Scripts/python.exe"
    node = root / "node.exe"
    for path in (python, node, root / "frontend/web/node_modules/vite/bin/vite.js",
                 root / "backend/server.py", script_dir / "share-server.py"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    entry_script = script_dir / "share-server.py" if shared else root / "backend/server.py"

    def row(pid, entry, executable=python, parent=1):
        return {"ProcessId": pid, "ParentProcessId": parent, "Name": executable.name,
                "ExecutablePath": str(executable), "CommandLine": f'"{executable}" "{entry}"',
                "CreationDate": "2026-10-06T00:00:00Z"}

    rows = [row(100, entry_script), row(101, entry_script, parent=100),
            row(201, root / "other-project/server.py"),
            row(300, root / "frontend/web/node_modules/vite/bin/vite.js", node)]
    if code_only:
        rows[1]["CommandLine"] = f'"{python}" -c "print(\'{entry_script}\')"'
    if shared:
        caddy = root / "tmp/tunnel-tools/caddy/caddy.exe"
        rows[3] = row(300, root / "frontend/web/tools/exhibition/server.mjs", node)
        rows.append(row(400, "run", caddy))
        state_dir = root / "backend/data/tunnel-demo/runtime"
        state_dir.mkdir(parents=True)
        # DateTime ticks for 2026-10-06 UTC, matching the Get-Process mock below.
        entries = [{"name": name, "id": pid, "path": str(executable),
                    "started": "639268416000000000"}
                   for name, pid, executable in [("backend", 100, python), ("qr", 300, node),
                                                 ("web", 400, caddy)]]
        entries.append({"name": "tunnel", "id": 600, "path": "tunnel.exe", "started": "0"})
        (state_dir / "processes.json").write_text(json.dumps({
            "processes": entries, "url": "https://example.invalid"}), encoding="utf-8")
    job_id = str(uuid4())
    control = root / "backend/data/server-control"
    control.mkdir(parents=True)
    job = {"id": job_id, "action": action.lower(), "target": target, "source_pid": 101,
           "status": "accepted", "started_at": 1, "finished_at": None, "error_code": None,
           "port": 18080, "host": "127.0.0.1"}
    (control / (job_id + ".json")).write_text(json.dumps(job), encoding="utf-8")
    (control / "active.lock").write_text(job_id, encoding="ascii")
    wrapper = tmp_path / "process-control-check.ps1"
    rows_json = json.dumps(rows).replace("'", "''")
    wrapper.write_text(rf"""
$global:controlTest_rows = ConvertFrom-Json -InputObject '{rows_json}'
$global:controlTest_killed = @()
$global:controlTest_commands = @()
$global:controlTest_starts = @()
function Get-CimInstance {{
    param($ClassName, $Filter)
    if ($Filter -match '^ProcessId = (\d+)$') {{
        $targetId = [int]$Matches[1]
        $found = $global:controlTest_rows | Where-Object {{ $_.ProcessId -eq $targetId }} |
            ForEach-Object {{ $_.PSObject.Copy() }}
        if (${str(reuse).lower()} -and $found) {{ $found.CreationDate = '2026-10-06T00:00:01Z' }}
        return $found
    }}
    return $global:controlTest_rows
}}
function Get-Process {{
    param($Id, $ErrorAction)
    $row = $global:controlTest_rows |
        Where-Object {{ $_.ProcessId -eq $Id }} | Select-Object -First 1
    if ($row) {{ return [pscustomobject]@{{ Id=$Id; Path=$row.ExecutablePath;
        StartTime=[datetime]'2026-10-06T00:00:00Z'; HasExited=$false }} }}
}}
function taskkill.exe {{
    param([Parameter(ValueFromRemainingArguments=$true)]$Arguments)
    $targetId = [int]$Arguments[1]
    $global:controlTest_killed += $targetId; $global:controlTest_commands += ($Arguments -join ' ')
    $global:controlTest_rows = @($global:controlTest_rows |
        Where-Object {{ $_.ProcessId -ne $targetId }})
    $global:LASTEXITCODE=0
}}
function Start-Process {{
    param($FilePath,$ArgumentList,$WindowStyle,$WorkingDirectory,[switch]$PassThru,
        $RedirectStandardOutput,$RedirectStandardError)
    $global:controlTest_starts += @{{path=$FilePath;arguments=$ArgumentList;window=$WindowStyle;
        cwd=$WorkingDirectory}}
    return [pscustomobject]@{{Id=900;StartTime=[datetime]'2026-10-06T00:00:00Z';HasExited=$false}}
}}
function Get-Command {{
    param($Name,$ErrorAction)
    return [pscustomobject]@{{Source='{str(node)}'}}
}}
function Invoke-WebRequest {{
    param($Uri,[switch]$UseBasicParsing,$TimeoutSec)
    return @{{StatusCode=200}}
}}
function Start-Sleep {{ param($Seconds,$Milliseconds) }}
$failure=$null
try {{ & '{str(script)}' -Action {action} -Target {target} -ServerProcessId 101 -JobId '{job_id}' }}
catch {{ $failure=$_.Exception.Message }}
$job = Get-Content -LiteralPath '{str(control / (job_id + '.json'))}' -Raw | ConvertFrom-Json
Write-Output ('RESULT:' + (@{{killed=@($global:controlTest_killed);
    commands=@($global:controlTest_commands);
    starts=@($global:controlTest_starts);error=$failure;job=$job;
    remaining=@($global:controlTest_rows | ForEach-Object {{$_.ProcessId}})}} |
    ConvertTo-Json -Compress -Depth 8))
""", encoding="utf-8-sig")
    result = subprocess.run([POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                             str(wrapper)], capture_output=True, text=True, timeout=20, check=True)
    line = next(line for line in result.stdout.splitlines() if line.startswith("RESULT:"))
    data = json.loads(line.removeprefix("RESULT:"))
    if shared:
        saved = root / "backend/data/tunnel-demo/runtime/processes.json"
        data["saved"] = json.loads(saved.read_text(encoding="utf-8-sig"))
    return data


def test_development_stop_preserves_frontend_and_other_projects(tmp_path):
    result = run_control(tmp_path)
    assert result["killed"] == [100, 101]
    assert result["remaining"] == [201, 300]
    assert all("/T" not in args for args in result["commands"])
    assert result["job"]["status"] == "completed"


def test_reused_pid_is_not_terminated(tmp_path):
    result = run_control(tmp_path, reuse=True)
    assert result["killed"] == []
    assert result["job"]["error_code"] == "process_identity_changed"


def test_python_code_mention_is_not_a_managed_server(tmp_path):
    result = run_control(tmp_path, code_only=True)
    assert result["killed"] == []
    assert result["job"]["error_code"] == "unmanaged_runtime"


def test_frontend_only_stop_preserves_backend(tmp_path):
    result = run_control(tmp_path, target="frontend")
    assert result["killed"] == [300]
    assert result["remaining"] == [100, 101, 201]


def test_development_restart_runs_fixed_script_in_hidden_window(tmp_path):
    result = run_control(tmp_path, action="Restart")
    assert result["job"]["status"] == "completed"
    assert len(result["starts"]) == 1
    assert result["starts"][0]["arguments"].endswith('backend\\server.py"')
    assert result["starts"][0]["window"] == "Hidden"


def test_shared_frontend_stop_preserves_api_and_tunnel_registry(tmp_path):
    result = run_control(tmp_path, target="frontend", shared=True)
    assert result["killed"] == [300, 400]
    assert result["remaining"] == [100, 101, 201]
    assert [entry["name"] for entry in result["saved"]["processes"]] == ["backend", "tunnel"]
    assert result["saved"]["url"] == "https://example.invalid"


def test_shared_all_stop_preserves_other_projects_and_tunnel_registry(tmp_path):
    result = run_control(tmp_path, target="all", shared=True)
    assert sorted(result["killed"]) == [100, 101, 300, 400]
    assert result["remaining"] == [201]
    assert [entry["name"] for entry in result["saved"]["processes"]] == ["tunnel"]
