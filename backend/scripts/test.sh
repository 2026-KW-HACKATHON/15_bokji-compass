#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
assert_environment
cd -- "$BACKEND_ROOT"
mkdir -p .cache/test-runs
test_parent="$(mktemp -d "$BACKEND_ROOT/.cache/test-runs/run.XXXXXXXX")"
"$VENV_PYTHON" -m pytest --basetemp "$test_parent/pytest" -p no:cacheprovider
"$VENV_PYTHON" -m ruff check . --no-cache
"$VENV_PYTHON" -m pip check
