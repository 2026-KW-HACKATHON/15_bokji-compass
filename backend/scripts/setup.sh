#!/usr/bin/env bash
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"

requirements_name=requirements-dev.txt
if [[ "${1:-}" == --runtime-only ]]; then
    requirements_name=requirements.txt
    shift
fi
if [[ $# != 0 ]]; then
    echo 'Usage: bash backend/scripts/setup.sh [--runtime-only]' >&2
    exit 2
fi
bootstrap_python="$BACKEND_ROOT/.bootstrap/bin/python"
uv_executable="$BACKEND_ROOT/.bootstrap/bin/uv"
export UV_CACHE_DIR="$BACKEND_ROOT/.cache/uv"
export UV_PYTHON_INSTALL_DIR="$BACKEND_ROOT/.python"
if [[ ! -x "$bootstrap_python" ]]; then
    if [[ -e "$BACKEND_ROOT/.bootstrap" ]]; then
        echo 'Existing .bootstrap is incompatible or incomplete; preserved for inspection.' >&2
        exit 1
    fi
    "${PYTHON_EXECUTABLE:-python3}" -c 'import sys; assert sys.version_info >= (3, 10), "Bootstrap requires Python 3.10+"'
    "${PYTHON_EXECUTABLE:-python3}" -m venv "$BACKEND_ROOT/.bootstrap"
fi
"$bootstrap_python" -m pip install --disable-pip-version-check --cache-dir "$BACKEND_ROOT/.cache/pip" 'uv==0.12.16'
if [[ ! -e "$BACKEND_ROOT/.venv" ]]; then
    "$uv_executable" venv "$BACKEND_ROOT/.venv" --python 3.13 --seed
fi
assert_environment
"$uv_executable" pip sync "$BACKEND_ROOT/$requirements_name" --python "$VENV_PYTHON" --require-hashes
"$VENV_PYTHON" -m pip check
if [[ ! -e "$BACKEND_ROOT/.env" ]]; then
    (umask 077; cp -n "$BACKEND_ROOT/.env.example" "$BACKEND_ROOT/.env")
fi
echo 'Setup complete. Existing .env preserved. Start: bash backend/scripts/start.sh --reload'
