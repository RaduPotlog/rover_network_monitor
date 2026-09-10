#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${PROJECT_DIR}/webserver"
NODE_BIN="${NODE_BIN:-node}"
MIN_NODE_MAJOR=20

if ! command -v "${NODE_BIN}" >/dev/null 2>&1; then
    echo "Error: ${NODE_BIN} was not found. Install Node.js ${MIN_NODE_MAJOR}+ and try again." >&2
    exit 1
fi

NODE_MAJOR="$("${NODE_BIN}" -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < MIN_NODE_MAJOR )); then
    echo "Error: Node.js ${MIN_NODE_MAJOR}+ is required (found $("${NODE_BIN}" --version))." >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "Error: npm was not found. Install npm and try again." >&2
    exit 1
fi

echo "Installing web server dependencies..."
cd "${WEB_DIR}"
if [[ -f package-lock.json ]]; then
    npm ci --omit=dev --no-audit --no-fund
else
    npm install --omit=dev --no-audit --no-fund
fi

if ! command -v ping >/dev/null 2>&1; then
    echo "Warning: the ping command is unavailable; device probes will be reported as offline." >&2
fi

echo "Starting Rover Network Monitor on port ${ROVER_WEB_PORT:-8080}..."
exec "${NODE_BIN}" src/server.js
