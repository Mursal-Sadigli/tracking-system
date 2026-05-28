#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python -m pip install --upgrade pip
python -m pip install "requests>=2.31.0" "fastapi>=0.115.0" "uvicorn[standard]>=0.32.0" "pydantic>=2.0.0"
python -c "import uvicorn, fastapi; print('ok', uvicorn.__version__, fastapi.__version__)"
