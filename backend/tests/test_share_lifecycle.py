"""Share startup/reload behavior with isolated state and no native server activity."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe")
pytestmark = pytest.mark.skipif(POWERSHELL is None, reason="Windows PowerShell required")
QUICK_URL = "https://owned-demo.trycloudflare.com"
FIXED_URL = "https://bokji.example.invalid"
STARTED_TICKS = "639268416000000000"


def ps_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def run_share(tmp_path, *, full_stack=True, action="start", reload_if_running=True,
              mode="quick", saved_url=QUICK_URL, public_url=FIXED_URL, token=False,
              missing=None, reused=(), analysis_alive=True, tunnel_count=1,
              validate_exit=0):
    root = tmp_path / "isolated project"
    scripts = root / "backend/scripts"
    scripts.mkdir(parents=True)
    script = scripts / "share.ps1"
    script.write_text((BACKEND / "scripts/share.ps1").read_text(encoding="utf-8"),
                      encoding="utf-8-sig")
    # The production script calls this helper before reload. This safe stand-in
    # records that boundary without inspecting or stopping any real process.
    (scripts / "stop-dev.ps1").write_text(
        "$global:shareTest_events += 'stop-dev'\n", encoding="utf-8-sig")
    paths = {
        "python": root / "backend/.venv/Scripts/python.exe",
        "node": root / "node.exe",
        "caddy": root / "tmp/tunnel-tools/caddy/caddy.exe",
        "cloudflared": root / "tmp/tunnel-tools/cloudflared-windows-amd64.exe",
        "dist": root / "frontend/web/dist/index.html",
    }
    for key, path in paths.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if key != missing:
            path.touch()
    template = root / "frontend/web/deploy/Caddyfile.tunnel"
    template.parent.mkdir(parents=True)
    template.write_text(":8080 {\n root * __DIST_ROOT__\n file_server\n}\n", encoding="utf-8")
    for path in (scripts / "share-server.py",
                 root / "frontend/web/tools/exhibition/server.mjs"):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
    runtime = root / "backend/data/tunnel-demo/runtime"
    runtime.mkdir(parents=True)
    if token:
        (runtime.parent / "tunnel-token.txt").write_text("A" * 90, encoding="utf-8")

    entries = []
    rows = []

    def add(name, pid, executable, *, alive=True):
        entries.append({"name": name, "id": pid, "path": str(executable),
                        "started": STARTED_TICKS})
        if alive:
            rows.append({"id": pid, "path": str(executable), "started":
                         "2026-10-06T00:00:01Z" if name in reused else
                         "2026-10-06T00:00:00Z"})

    if full_stack:
        add("backend", 100, paths["python"])
        add("qr", 200, paths["node"])
        add("web", 300, paths["caddy"])
    for index in range(tunnel_count):
        add("tunnel", 400 + index, paths["cloudflared"])
    add("analysis", 500, paths["python"], alive=analysis_alive)
    # An unrelated process must survive even when all managed components reload.
    rows.append({"id": 600, "path": str(root / "other-project/python.exe"),
                 "started": "2026-10-06T00:00:00Z"})
    initial = {"processes": entries, "url": saved_url}
    state_path = runtime / "processes.json"
    state_path.write_text(json.dumps(initial), encoding="utf-8")

    arguments = f"-Action {ps_quote(action)} -TunnelMode {ps_quote(mode)}"
    arguments += f" -PublicUrl {ps_quote(public_url)}"
    if reload_if_running:
        arguments += " -ReloadIfRunning"
    wrapper = tmp_path / "share-lifecycle-check.ps1"
    wrapper.write_text(rf"""
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$global:shareTest_rows = ConvertFrom-Json -InputObject {ps_quote(json.dumps(rows))}
$global:shareTest_killed = @()
$global:shareTest_starts = @()
$global:shareTest_events = @()
$global:shareTest_nextId = 900
$env:TUNNEL_TOKEN = $null
function Get-Process {{
    param($Id, $ErrorAction)
    $row = $global:shareTest_rows | Where-Object {{ $_.id -eq $Id }} | Select-Object -First 1
    if ($row) {{
        return [pscustomobject]@{{Id=$row.id; Path=$row.path;
            StartTime=[datetime]$row.started; HasExited=$false}}
    }}
}}
function taskkill.exe {{
    param([Parameter(ValueFromRemainingArguments=$true)]$Arguments)
    $targetId = [int]$Arguments[1]
    $global:shareTest_killed += $targetId
    $global:shareTest_events += "kill:$targetId"
    $global:shareTest_rows = @($global:shareTest_rows |
        Where-Object {{ $_.id -ne $targetId }})
    $global:LASTEXITCODE = 0
}}
function Stop-Process {{ throw 'Unexpected native Stop-Process call' }}
function Get-CimInstance {{ throw 'Unexpected native process lookup' }}
function Start-Process {{
    param($FilePath, $ArgumentList, $WindowStyle, $WorkingDirectory, [switch]$PassThru,
          $RedirectStandardOutput, $RedirectStandardError)
    $name = ([IO.Path]::GetFileName($RedirectStandardOutput) -split '\.')[1]
    $global:shareTest_nextId++
    $newId = $global:shareTest_nextId
    $global:shareTest_starts += @{{name=$name; id=$newId; path=$FilePath;
        arguments=$ArgumentList; window=$WindowStyle; cwd=$WorkingDirectory}}
    $global:shareTest_events += "start:$name"
    $global:shareTest_rows += [pscustomobject]@{{id=$newId; path=$FilePath;
        started='2026-10-06T00:00:00Z'}}
    return [pscustomobject]@{{Id=$newId; Path=$FilePath;
        StartTime=[datetime]'2026-10-06T00:00:00Z'; HasExited=$false}}
}}
function Get-Command {{
    param($Name, $ErrorAction)
    if ($Name -ne 'node') {{ throw "Unexpected command lookup: $Name" }}
    return [pscustomobject]@{{Source={ps_quote(paths['node'])}}}
}}
function New-Object {{
    param([string]$TypeName, [object[]]$ArgumentList)
    if ($TypeName -eq 'Net.Sockets.TcpClient') {{
        throw 'Unexpected network socket creation during guarded startup/reload'
    }}
    Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList
}}
function Invoke-WebRequest {{
    param($Uri, [switch]$UseBasicParsing, $TimeoutSec)
    $global:shareTest_events += "request:$Uri"
    if ($Uri -eq 'http://127.0.0.1:5181/api/status') {{
        $error401 = [System.Exception]::new('Unauthorized')
        Add-Member -InputObject $error401 -NotePropertyName Response `
            -NotePropertyValue ([pscustomobject]@{{StatusCode=401}})
        throw $error401
    }}
    return [pscustomobject]@{{StatusCode=200}}
}}
function Start-Sleep {{ param($Seconds, $Milliseconds) }}
# PowerShell resolves this absolute-path function before the inert executable
# fixture, so validation never launches an external executable.
Set-Item -Path ('Function:' + {ps_quote(paths['caddy'])}) -Value {{
    param([Parameter(ValueFromRemainingArguments=$true)]$Arguments)
    if ($Arguments[0] -ne 'validate') {{ throw 'Unexpected direct Caddy execution' }}
    $global:shareTest_events += 'validate'
    $global:LASTEXITCODE = {validate_exit}
}}
$failure = $null
$scriptOutput = @()
try {{ $scriptOutput = @(& {ps_quote(script)} {arguments}) }}
catch {{ $failure = $_.Exception.Message }}
Write-Output ('RESULT:' + (@{{killed=@($global:shareTest_killed);
    starts=@($global:shareTest_starts); events=@($global:shareTest_events);
    remaining=@($global:shareTest_rows | ForEach-Object {{ $_.id }});
    error=$failure; output=@($scriptOutput)}} | ConvertTo-Json -Compress -Depth 8))
""", encoding="utf-8-sig")
    completed = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(wrapper)],
        capture_output=True, text=True, encoding="utf-8", timeout=20, check=True)
    line = next((line for line in completed.stdout.splitlines()
                 if line.startswith("RESULT:")), None)
    assert line is not None, completed.stdout + completed.stderr
    result = json.loads(line.removeprefix("RESULT:"))
    result["saved"] = json.loads(state_path.read_text(encoding="utf-8-sig"))
    result["initial"] = initial
    return result


def assert_reloaded(result):
    assert result["error"] is None
    assert [entry["name"] for entry in result["starts"]] == ["backend", "qr", "web"]
    assert all(entry["window"] == "Hidden" for entry in result["starts"])
    assert result["saved"]["url"] == result["initial"]["url"]
    preserved = [entry for entry in result["initial"]["processes"]
                 if entry["name"] in {"tunnel", "analysis"}]
    assert result["saved"]["processes"][:len(preserved)] == preserved
    assert [entry["name"] for entry in result["saved"]["processes"][len(preserved):]] == [
        "backend", "qr", "web"]
    assert [entry["id"] for entry in result["saved"]["processes"][len(preserved):]] == [
        901, 902, 903]
    assert 400 in result["remaining"]
    assert 600 in result["remaining"]
    assert "request:http://127.0.0.1:5181/api/status" in result["events"]


def assert_untouched(result):
    assert result["killed"] == []
    assert result["starts"] == []
    assert result["saved"] == result["initial"]
    assert "stop-dev" not in result["events"]


def test_start_recovers_tunnel_only_with_stopped_analysis_entry(tmp_path):
    result = run_share(tmp_path, full_stack=False, analysis_alive=False)
    assert_reloaded(result)
    assert result["killed"] == []
    assert 500 not in result["remaining"]


def test_start_reloads_only_owned_components_and_preserves_tunnel_analysis(tmp_path):
    result = run_share(tmp_path)
    assert_reloaded(result)
    assert result["killed"] == [100, 200, 300]
    assert 500 in result["remaining"]
    assert result["events"].index("validate") < result["events"].index("stop-dev")
    assert result["events"].index("stop-dev") < result["events"].index("kill:100")
    assert all(pid not in result["remaining"] for pid in (100, 200, 300))


def test_plain_start_keeps_duplicate_process_guard(tmp_path):
    result = run_share(tmp_path, reload_if_running=False)
    assert "already exist" in result["error"]
    assert "status" in result["error"] and "stop" in result["error"]
    assert_untouched(result)


@pytest.mark.parametrize("mode,saved_url", [
    ("fixed", QUICK_URL),
    ("fixed", "https://other.example.invalid"),
    ("quick", FIXED_URL),
    ("quick", "https://owned-demo.trycloudflare.com/path"),
])
def test_start_rejects_tunnel_mode_or_url_mismatch_without_stopping(tmp_path, mode, saved_url):
    result = run_share(tmp_path, mode=mode, saved_url=saved_url)
    assert "different URL or mode" in result["error"]
    assert "status" in result["error"] and "stop" in result["error"]
    assert_untouched(result)


def test_fixed_origin_normalization_reuses_trailing_slash_url(tmp_path):
    result = run_share(tmp_path, mode="fixed", saved_url=FIXED_URL + "/",
                       public_url="https://BOKJI.example.invalid/")
    assert_reloaded(result)


def test_auto_mode_reuses_fixed_tunnel_when_token_file_exists(tmp_path):
    result = run_share(tmp_path, mode="auto", saved_url=FIXED_URL, token=True)
    assert_reloaded(result)


def test_auto_mode_reuses_quick_tunnel_when_token_file_is_absent(tmp_path):
    result = run_share(tmp_path, mode="auto")
    assert_reloaded(result)


def test_reload_does_not_terminate_component_whose_pid_was_reused(tmp_path):
    result = run_share(tmp_path, reused=("web",))
    assert_reloaded(result)
    assert result["killed"] == [100, 200]
    assert 300 in result["remaining"]


@pytest.mark.parametrize("tunnel_count,reused", [(2, ()), (1, ("tunnel",))])
def test_start_requires_exactly_one_owned_tunnel_before_reloading(tmp_path, tunnel_count, reused):
    result = run_share(tmp_path, tunnel_count=tunnel_count, reused=reused)
    assert "already exist" in result["error"]
    assert_untouched(result)


@pytest.mark.parametrize("missing", ["python", "node", "caddy", "dist"])
def test_missing_reload_prerequisite_leaves_running_stack_untouched(tmp_path, missing):
    result = run_share(tmp_path, missing=missing)
    assert "Missing prerequisite" in result["error"]
    assert_untouched(result)
    assert "validate" not in result["events"]


def test_caddy_validation_failure_leaves_running_stack_untouched(tmp_path):
    result = run_share(tmp_path, validate_exit=1)
    assert result["error"] == "Caddy configuration is invalid"
    assert_untouched(result)
    assert result["events"] == ["validate"]


def test_running_tunnel_reload_does_not_require_cloudflared_binary(tmp_path):
    result = run_share(tmp_path, missing="cloudflared")
    assert_reloaded(result)


def test_explicit_reload_checks_prerequisites_before_stopping(tmp_path):
    result = run_share(tmp_path, action="reload", missing="python")
    assert "Missing prerequisite" in result["error"]
    assert_untouched(result)
