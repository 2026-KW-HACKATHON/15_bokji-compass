#!/usr/bin/env bash
set -euo pipefail

BACKEND_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="$BACKEND_ROOT/.venv/bin/python"

assert_environment() {
    if [[ ! -x "$VENV_PYTHON" ]]; then
        echo 'Run bash backend/scripts/setup.sh first. Do not copy a Windows .venv.' >&2
        exit 1
    fi
    "$VENV_PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 13), "Python 3.13 required; existing environment preserved"'
}
