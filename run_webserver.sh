#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${PROJECT_DIR}/.venv"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
    echo "Error: ${PYTHON_BIN} was not found. Install Python 3 and try again." >&2
    exit 1
fi

if ! "${PYTHON_BIN}" -c "import ensurepip" >/dev/null 2>&1; then
    echo "Error: Python's venv support is not installed." >&2
    echo "On Debian/Ubuntu, install it with: sudo apt install python3-venv" >&2
    exit 1
fi

if [[ ! -x "${VENV_DIR}/bin/python" ]] || \
   ! "${VENV_DIR}/bin/python" -m pip --version >/dev/null 2>&1; then
    echo "Creating Python virtual environment..."
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

echo "Installing web server dependencies..."
"${VENV_DIR}/bin/python" -m pip install -r "${PROJECT_DIR}/webserver/requirements.txt"

if ! command -v ping >/dev/null 2>&1; then
    echo "Warning: the ping command is unavailable; device probes will be reported as offline." >&2
fi

echo "Starting Rover Network Monitor on port ${ROVER_WEB_PORT:-8080}..."
cd "${PROJECT_DIR}/webserver"
exec "${VENV_DIR}/bin/python" -m app
