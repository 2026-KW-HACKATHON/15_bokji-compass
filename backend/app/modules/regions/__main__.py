"""Offline import of a manually downloaded official MOIS archive."""

import argparse
import json
from pathlib import Path

from app.modules.regions.importer import import_snapshot
from app.modules.regions.public import SNAPSHOT

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("--effective-date", required=True)
parser.add_argument("--source-url", required=True)
parser.add_argument("--download-url", required=True)
parser.add_argument("--output", type=Path, default=SNAPSHOT)
args = parser.parse_args()
print(json.dumps(import_snapshot(args.archive, args.output, effective_date=args.effective_date,
                                source_url=args.source_url, download_url=args.download_url),
                 ensure_ascii=False, indent=2))
