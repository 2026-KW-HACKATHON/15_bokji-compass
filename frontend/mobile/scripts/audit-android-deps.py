"""Query OSV with public Maven coordinates from Gradle releaseRuntimeClasspath.

Generate input: gradlew :app:dependencies --configuration releaseRuntimeClasspath --console=plain
Usage: python audit-android-deps.py dependencies.txt report.json
Sends dependency names/versions only; no source, credentials or APK is uploaded.
Does not cover unpublished native/C++ components or prove exploitability.
"""
import json
from pathlib import Path
import re
import sys
import urllib.request


def main():
    content = Path(sys.argv[1]).read_text(encoding="utf-8-sig")
    if "BUILD SUCCESSFUL" not in content or "FAILED" in content or "releaseRuntimeClasspath" not in content:
        raise ValueError("Incomplete Gradle dependency report")
    packages = set()
    for line in content.splitlines():
        match = re.search(r"(?:\+---|\\---) ([\w.-]+):([\w.-]+)(?::([^\s]+))?(?: -> ([^\s]+))?", line)
        if match and not (match[3] or "").startswith("{"):
            name = match[1] + ":" + match[2]
            version = match[4] or match[3] or ""
            if version.count(":") == 2:
                group, artifact, version = version.split(":")
                name = group + ":" + artifact
            if ":" in version or not re.match(r"\d", version):
                raise ValueError("Unsupported dependency substitution; inspect manually")
            packages.add((name, version))
    if not packages:
        raise ValueError("No resolved Maven packages found")
    results = []
    for name, version in sorted(packages):
        results.append({"name": name, "version": version, "vulnerabilities": []})
    pending = list(range(len(results)))
    tokens = {}
    while pending:
        next_pending = []
        for start in range(0, len(pending), 100):
            indexes = pending[start:start + 100]
            queries = [{"package": {"ecosystem": "Maven", "name": results[i]["name"]}, "version": results[i]["version"], **({"page_token": tokens[i]} if i in tokens else {})} for i in indexes]
            request = urllib.request.Request("https://api.osv.dev/v1/querybatch", data=json.dumps({"queries": queries}).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=45) as response:
                batch = json.load(response)["results"]
            if len(batch) != len(indexes):
                raise ValueError("Incomplete OSV response")
            for i, entry in zip(indexes, batch):
                results[i]["vulnerabilities"].extend(v["id"] for v in entry.get("vulns", []))
                if entry.get("next_page_token"):
                    tokens[i] = entry["next_page_token"]
                    next_pending.append(i)
        pending = next_pending
    findings = [entry for entry in results if entry["vulnerabilities"]]
    report = {"database": "https://osv.dev", "scope": "Resolved public Maven packages only; not all native binaries or exploitability", "packages_checked": len(results), "result": "FINDINGS" if findings else "NO_KNOWN_FINDINGS", "findings": findings, "inventory": results}
    Path(sys.argv[2]).write_text(json.dumps(report, indent=2) + "\n", encoding="utf8")
    print(json.dumps({k: v for k, v in report.items() if k != "inventory"}, indent=2))
    return 1 if findings else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"result": "INCOMPLETE", "reason": type(error).__name__, "detail": str(error)}))
        sys.exit(2)
