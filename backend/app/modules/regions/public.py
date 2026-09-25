"""Resolve only unique, active official names. Keep ADMIN and LEGAL codes separate."""

import csv
import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

SNAPSHOT = Path(__file__).resolve().parents[3] / "reference/regions"


@dataclass(frozen=True)
class Region:
    system: str
    code: str
    name: str
    valid_from: str
    valid_to: str

    def active(self, as_of: str) -> bool:
        return self.valid_from <= as_of and (not self.valid_to or as_of < self.valid_to)


@dataclass(frozen=True)
class Resolution:
    status: str
    candidates: tuple[Region, ...]

    @property
    def region(self) -> Region | None:
        return self.candidates[0] if self.status == "resolved" else None


class RegionCatalog:
    def __init__(self, directory: Path = SNAPSHOT):
        self.metadata = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        data = (directory / "regions.csv").read_bytes()
        if hashlib.sha256(data).hexdigest() != self.metadata["csv_sha256"]:
            raise ValueError("Region snapshot checksum mismatch")
        self.version = self.metadata["version"]
        self.as_of = self.metadata["effective_date"]
        self.rows = tuple(Region(**r) for r in csv.DictReader(data.decode("utf-8").splitlines()))
        self.by_code = {(r.system, r.code): r for r in self.rows}
        if len(self.rows) != self.metadata["row_count"] or len(self.by_code) != len(self.rows):
            raise ValueError("Invalid region snapshot count/identity")
        self.names: dict[str, list[Region]] = defaultdict(list)
        for row in self.rows:
            parts = row.name.split()
            # Exact full names and suffixes only; ambiguous names remain ambiguous.
            for index in range(len(parts)):
                self.names[" ".join(parts[index:])].append(row)
        self.parents = {}
        names = defaultdict(list)
        for row in self.rows:
            names[row.system, row.name].append(row)
        for row in self.rows:
            parts = row.name.split()
            for end in range(len(parts) - 1, 0, -1):
                parents = [r for r in names[row.system, " ".join(parts[:end])]
                           if r.active(self.as_of)]
                if len(parents) == 1:
                    self.parents[row.system, row.code] = parents[0].code
                    break

    def resolve(self, name: str, *, system: str | None = None) -> Resolution:
        if system not in (None, "ADMIN", "LEGAL"):
            raise ValueError("Unknown region code system")
        candidates = [r for r in self.names.get(" ".join(name.split()), [])
                      if system is None or r.system == system]
        active = [r for r in candidates if r.active(self.as_of)]
        # Province/city/district identifiers shared by both official systems.
        if (len(active) == 2 and active[0].code == active[1].code
                and active[0].name == active[1].name and active[0].code.endswith("00000")):
            active = [r for r in active if r.system == "ADMIN"]
        status = "resolved" if len(active) == 1 else "ambiguous" if active else (
            "abolished" if candidates else "not_found")
        return Resolution(status, tuple(sorted(active or candidates,
                                                key=lambda r: (r.system, r.code))))

    def contains(self, system: str, ancestor: str, descendant: str) -> bool | None:
        """None for absent/abolished identifiers; hierarchy comes from official names."""
        for code in (ancestor, descendant):
            row = self.by_code.get((system, code))
            if row is None or not row.active(self.as_of):
                return None
        current = descendant
        while current:
            if current == ancestor:
                return True
            current = self.parents.get((system, current))
        return False

    def validate_code(self, system: str, code: str, version: str) -> Region:
        if version != self.version:
            raise ValueError("Region snapshot version mismatch")
        row = self.by_code.get((system, code))
        if row is None or not row.active(self.as_of):
            raise ValueError("Region code absent or abolished at snapshot date")
        return row


@lru_cache(maxsize=1)
def default_catalog() -> RegionCatalog:
    return RegionCatalog()
