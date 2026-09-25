"""Convert MOIS KIKcd_B/KIKcd_H fixed-width CP949 files without Excel dependencies."""

import csv
import hashlib
import io
import json
import re
from datetime import date
from pathlib import Path
from zipfile import ZipFile

FIELDS = ["system", "code", "name", "valid_from", "valid_to"]


def _date(raw: bytes) -> str:
    value = raw.decode("ascii").strip()
    if not value:
        return ""
    if not re.fullmatch(r"\d{8}", value):
        raise ValueError("Unexpected MOIS date format")
    return date.fromisoformat(value).isoformat()


def import_snapshot(archive: Path, destination: Path, *, effective_date: str,
                    source_url: str, download_url: str) -> dict:
    """Validate the complete archive before writing. Never extract ZIP paths to disk."""
    effective_date = date.fromisoformat(effective_date).isoformat()
    rows = []
    anomalies = []
    with ZipFile(archive) as bundle:
        for suffix, system, count in [("B", "LEGAL", 4), ("H", "ADMIN", 3)]:
            names = [n for n in bundle.namelist()
                     if re.fullmatch(rf"KIKcd_{suffix}\.\d{{8}}[^/\\]*", n, re.I)
                     and not n.lower().endswith((".xlsx", ".xls"))]
            if len(names) != 1 or bundle.getinfo(names[0]).file_size > 32_000_000:
                raise ValueError("Expected one bounded KIKcd file per code system")
            if date.fromisoformat(names[0].split(".")[1][:8]).isoformat() != effective_date:
                raise ValueError("Archive effective date does not match the requested snapshot")
            raw = bundle.read(names[0])
            lines = raw.splitlines()
            expected = "법정동코드" if system == "LEGAL" else "행정동코드"
            if not lines or not lines[0].decode("cp949").startswith(expected):
                raise ValueError("Unexpected MOIS header")
            seen = set()
            for line in lines[1:]:
                offset = 11 + 31 * count
                code = line[:10].decode("ascii")
                if not re.fullmatch(r"[0-9]{10}", code) or code in seen:
                    raise ValueError("Invalid or duplicate official code")
                seen.add(code)
                parts = [line[11 + 31*i:11 + 31*(i+1)].decode("cp949").strip()
                         for i in range(count)]
                start, end = _date(line[offset:offset+8]), _date(line[offset+9:offset+17])
                if not parts[0] or not start:
                    raise ValueError("Missing region name or creation date")
                if end and end < start:
                    anomalies.append({"system": system, "code": code,
                                      "reason": "source_end_before_start"})
                rows.append(dict(zip(FIELDS, [system, code, " ".join(filter(None, parts)),
                                             start, end], strict=True)))
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(sorted(rows, key=lambda r: (r["system"], r["code"])))
    data = buffer.getvalue().encode("utf-8")
    metadata = {"version": "mois-" + effective_date, "effective_date": effective_date,
                "source_url": source_url, "download_url": download_url,
                "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                "csv_sha256": hashlib.sha256(data).hexdigest(), "row_count": len(rows),
                "systems": ["ADMIN", "LEGAL"], "includes_abolished": True,
                "source_anomalies": anomalies}
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "regions.csv").write_bytes(data)
    (destination / "manifest.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metadata
