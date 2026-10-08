"""Validate reviewed source summaries before publishing a catalog update."""

import argparse
import json
import sys
from pathlib import Path

from .public import CatalogError, catalog_coverage, load_catalog


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["validate"])
    parser.add_argument("--directory", type=Path, help="Catalog JSON directory")
    args = parser.parse_args()
    try:
        services = load_catalog(args.directory)
    except CatalogError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(catalog_coverage(services), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
