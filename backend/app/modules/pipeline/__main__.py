"""Cross-platform command-line entry point for raw policy parsing."""

import argparse
import json

from app.core.config import BACKEND_ROOT
from app.modules.pipeline.public import parse_raw_files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", nargs="+", required=True, help="JSON/XML file paths")
    parser.add_argument("--prepare-only", action="store_true", help="No LLM/network call")
    args = parser.parse_args()
    try:
        # Relative paths always resolve against backend, even from another cwd.
        paths = [BACKEND_ROOT / value for value in args.input]
        output, manifest = parse_raw_files(paths, prepare_only=args.prepare_only)
    except (ValueError, OSError, RuntimeError) as error:
        print(json.dumps({"status": "failed", "error_type": type(error).__name__,
                          "message": "Check input format, file paths and backend/.env settings"}))
        return 1
    print(json.dumps({"status": manifest["status"], "records": len(manifest["records"]),
                      "output": str(output)}, ensure_ascii=True))
    return int(manifest["status"] == "failed")


if __name__ == "__main__":
    raise SystemExit(main())
