#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
assert_environment
cd -- "$BACKEND_ROOT"
exec "$VENV_PYTHON" server.py "$@"
