#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec python -m uvicorn app:app --host 0.0.0.0 --port "${PORT:-5001}"
