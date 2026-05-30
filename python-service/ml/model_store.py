from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

MODEL_VERSION = "v1"


def _models_dir() -> Path:
    base = os.environ.get("ML_DATA_DIR", "./data/ml")
    return Path(base) / "models"


def model_path(name: str = "anomaly_v1.joblib") -> Path:
    return _models_dir() / name


def save_model(obj: Any, name: str = "anomaly_v1.joblib") -> Path:
    import joblib

    path = model_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(obj, path)
    return path


def load_model(name: str = "anomaly_v1.joblib") -> Optional[Any]:
    import joblib

    path = model_path(name)
    if not path.exists():
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


def health_info() -> dict:
    path = model_path()
    return {
        "model_version": MODEL_VERSION,
        "model_file_exists": path.exists(),
        "model_path": str(path),
    }
