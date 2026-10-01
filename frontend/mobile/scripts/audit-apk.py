"""Fail-closed APK release checks using Android SDK tools; not a penetration test.

Example: python scripts/audit-apk.py app.apk --signer-sha256 APPROVED_CERT_SHA256
Requires JAVA_HOME and ANDROID_HOME (or --sdk). Never prints matched secret values.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile


def tree(dump):
    root = {"tag": "root", "attrs": {}, "children": []}
    stack = [(-1, root)]
    for line in dump.splitlines():
        depth = len(line) - len(line.lstrip())
        element = re.match(r"\s*E: ([\w-]+)", line)
        if element:
            while stack[-1][0] >= depth:
                stack.pop()
            node = {"tag": element[1], "attrs": {}, "children": []}
            stack[-1][1]["children"].append(node)
            stack.append((depth, node))
        else:
            attr = re.match(r'\s*A: (?:http://schemas.android.com/apk/res/android:)?([\w]+)(?:\([^)]*\))?=(.*)', line)
            if attr:
                value = attr[2].split(" (Raw:")[0]
                stack[-1][1]["attrs"][attr[1]] = value.strip('"')
    return root


def nodes(node, tag):
    for child in node["children"]:
        if child["tag"] == tag:
            yield child
        yield from nodes(child, tag)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get("ANDROID_HOME", Path(os.environ.get("LOCALAPPDATA", "")) / "Android/Sdk")))
    parser.add_argument("--signer-sha256", default="")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--secrets-env", type=Path, help="Optional local backend env to check for accidental inclusion; values are never logged")
    args = parser.parse_args()
    findings = []
    def check(ok, code, detail):
        findings.append({"check": code, "pass": bool(ok), "detail": detail})
    versions = sorted((args.sdk / "build-tools").glob("*"), key=lambda p: tuple(int(x) for x in re.findall(r"\d+", p.name)))
    if not versions:
        raise RuntimeError("Android SDK build-tools missing")
    build_tools = versions[-1]
    def dump(file):
        return subprocess.check_output([str(build_tools / ("aapt2.exe" if os.name == "nt" else "aapt2")), "dump", "xmltree", str(args.apk), "--file", file], encoding="utf8", errors="replace")
    manifest = tree(dump("AndroidManifest.xml"))
    app = next(nodes(manifest, "application"))["attrs"]
    package = next(nodes(manifest, "manifest"))["attrs"].get("package", "")
    check(package == "com.bokjicompass.app", "package", package)
    check(app.get("debuggable", "false") == "false", "debuggable", "Must be false")
    check(app.get("testOnly", "false") == "false", "test_only", "Must be false")
    check(app.get("allowBackup") == "false", "backup", "Must explicitly disable backup")
    check(app.get("usesCleartextTraffic") == "false", "cleartext_manifest", "Must explicitly disable cleartext")
    allowed = {"android.permission.INTERNET", "android.permission.ACCESS_NETWORK_STATE", package + ".DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"}
    permissions = {n["attrs"].get("name", "") for n in nodes(manifest, "uses-permission")}
    check(not permissions - allowed, "permissions", ", ".join(sorted(permissions)))
    exported = []
    for tag in ("activity", "activity-alias", "service", "receiver", "provider"):
        for node in nodes(manifest, tag):
            attrs = node["attrs"]
            if attrs.get("exported") == "true" or (attrs.get("exported") is None and any(nodes(node, "intent-filter"))):
                name = attrs.get("name", "")
                approved = tag == "activity" and name in (".MainActivity", package + ".MainActivity")
                approved |= tag == "receiver" and name == "androidx.profileinstaller.ProfileInstallReceiver" and attrs.get("permission") == "android.permission.DUMP"
                if not approved:
                    exported.append(name)
    check(not exported, "exported_components", ", ".join(exported) or "Only launcher and permission-protected profile receiver")
    check(not re.search(r"expo\.modules\.devlauncher|expo-dev-launcher|DevSettingsActivity", dump("AndroidManifest.xml")), "dev_components", "No development launcher/components")
    with zipfile.ZipFile(args.apk) as archive:
        names = archive.namelist()
        check("assets/index.android.bundle" in names, "embedded_bundle", "Standalone JavaScript bundle required")
        unwanted = [n for n in names if re.search(r"(?:^|/)(?:\.env(?:\..*)?|credentials\.json)$|\.(?:map|jks|keystore|pem|p12|pfx)$", n, re.I)]
        check(not unwanted, "packaged_private_files", ", ".join(unwanted) or "No known private file types")
        resources = subprocess.check_output([str(build_tools / ("aapt2.exe" if os.name == "nt" else "aapt2")), "dump", "resources", str(args.apk)], encoding="utf8", errors="replace")
        for attr, resource in (("networkSecurityConfig", "bokji_network_security"), ("fullBackupContent", "bokji_backup_rules"), ("dataExtractionRules", "bokji_data_extraction_rules")):
            match = re.search(r"resource (0x[0-9a-f]+) (?:[^\s:]+:)?xml/" + resource + r"\b", resources)
            check(match and app.get(attr, "").lower() == "@" + match[1].lower(), attr + "_binding", "Manifest must reference audited resource")
        try:
            network = tree(dump("res/xml/bokji_network_security.xml"))
            bases = list(nodes(network, "base-config"))
            domains = list(nodes(network, "domain-config"))
            certs = list(nodes(network, "certificates"))
            check(len(bases) == 1 and bases[0]["attrs"].get("cleartextTrafficPermitted") == "false" and not domains and certs and all(n["attrs"].get("src") == "system" for n in certs), "network_policy", "Release: HTTPS only, system CAs only, no debug domain exceptions")
            for filename, tag in (("bokji_backup_rules", "full-backup-content"), ("bokji_data_extraction_rules", "cloud-backup"), ("bokji_data_extraction_rules", "device-transfer")):
                policy = tree(dump("res/xml/" + filename + ".xml"))
                sections = list(nodes(policy, tag))
                domains = {"root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"}
                check(len(sections) == 1 and domains <= {n["attrs"].get("domain") for n in nodes(sections[0], "exclude") if n["attrs"].get("path") == "."} and not list(nodes(policy, "include")), tag, "Exclude all app data from backup/transfer")
        except subprocess.CalledProcessError:
            check(False, "policy_resources", "Required security XML missing/unreadable")
        known = []
        if args.secrets_env:
            for line in args.secrets_env.read_text(encoding="utf-8-sig").splitlines():
                match = re.match(r"([A-Za-z_][\w]*)\s*=\s*(.*)", line)
                if match and re.search(r"PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY", match[1], re.I):
                    value = match[2].strip().strip("\"'")
                    if len(value) >= 8:
                        known.append((match[1], value.encode()))
        leaks = []
        private_key = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")
        for name in names:
            if name.endswith("/"):
                continue
            data = archive.read(name)
            if private_key.search(data):
                leaks.append({"file": name, "kind": "private-key"})
            for key, value in known:
                if value in data:
                    leaks.append({"file": name, "kind": "env:" + key})
        check(not leaks, "secret_scan", json.dumps(leaks) if leaks else f"No private key markers or matches for {len(known)} supplied local secret values; not exhaustive")
    signer = build_tools / ("apksigner.bat" if os.name == "nt" else "apksigner")
    verify = subprocess.run([str(signer), "verify", "--verbose", "--print-certs", str(args.apk)], capture_output=True, encoding="utf8", errors="replace")
    certs = set(re.findall(r"(?:Signer #\d+ |V\d+(?:\.\d+)? Signer: )certificate SHA-256 digest: ([a-fA-F0-9]+)", verify.stdout))
    cert = next(iter(certs)) if len(certs) == 1 else None
    check(verify.returncode == 0 and bool(re.search(r"Verified using v[23](?:\.1)? scheme.*: true", verify.stdout)), "signature_valid", "Valid v2/v3 signature required")
    check("Android Debug" not in verify.stdout and bool(cert), "not_debug_signed", "Debug signing certificate forbidden")
    expected = args.signer_sha256.replace(":", "").lower()
    check(bool(re.fullmatch(r"[a-f0-9]{64}", expected)) and cert and cert.lower() == expected, "approved_signer", "Must match explicitly approved certificate SHA-256")
    report = {"apk": str(args.apk.resolve()), "sha256": hashlib.sha256(args.apk.read_bytes()).hexdigest(), "certificate_sha256": cert, "result": "PASS" if all(f["pass"] for f in findings) else "BLOCKED", "scope": "Static APK release gate only; production API, runtime testing, native dependency vulnerabilities and penetration testing are separate requirements", "checks": findings}
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(rendered + "\n", encoding="utf8")
    print(rendered)
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"result": "BLOCKED", "reason": type(error).__name__, "detail": "Audit could not complete; verify SDK, JAVA_HOME, APK and input file paths."}))
        sys.exit(2)
