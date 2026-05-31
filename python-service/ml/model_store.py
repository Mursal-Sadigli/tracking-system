from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

MODEL_VERSION = "v2"


def _data_dir() -> Path:
    base = os.environ.get("ML_DATA_DIR", "./data/ml")
    return Path(base)


def _models_dir() -> Path:
    return _data_dir() / "models"


def _safe_device_id(device_id: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in device_id)


def model_path(name: str = "anomaly_v1.joblib") -> Path:
    return _models_dir() / name


def fusion_model_path() -> Path:
    return _models_dir() / "fusion_xgb.json"


def ensemble_if_path(device_id: str) -> Path:
    return _models_dir() / f"{_safe_device_id(device_id)}_if.joblib"


def ensemble_ae_path(device_id: str) -> Path:
    return _models_dir() / f"{_safe_device_id(device_id)}_ae.joblib"


def ensemble_meta_path(device_id: str) -> Path:
    return _models_dir() / f"{_safe_device_id(device_id)}_ensemble_meta.json"


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


def save_ensemble_models(device_id: str, if_model, ae_model, scaler, points_at_fit: int) -> None:
    import joblib

    _models_dir().mkdir(parents=True, exist_ok=True)
    if if_model is not None:
        joblib.dump(if_model, ensemble_if_path(device_id))
    bundle = {"ae": ae_model, "scaler": scaler}
    joblib.dump(bundle, ensemble_ae_path(device_id))
    meta = {"device_id": device_id, "points_at_fit": points_at_fit, "model_version": MODEL_VERSION}
    ensemble_meta_path(device_id).write_text(
        __import__("json").dumps(meta, ensure_ascii=False),
        encoding="utf-8",
    )


def load_ensemble_models(device_id: str) -> Tuple[Optional[Any], Optional[Dict[str, Any]]]:
    import joblib

    if_model = None
    ae_bundle = None
    if_path = ensemble_if_path(device_id)
    ae_path = ensemble_ae_path(device_id)
    if if_path.exists():
        try:
            if_model = joblib.load(if_path)
        except Exception:
            if_model = None
    if ae_path.exists():
        try:
            ae_bundle = joblib.load(ae_path)
        except Exception:
            ae_bundle = None
    return if_model, ae_bundle


def load_ensemble_meta(device_id: str) -> Optional[Dict[str, Any]]:
    path = ensemble_meta_path(device_id)
    if not path.exists():
        return None
    try:
        import json

        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def health_info() -> dict:
    fusion_path = fusion_model_path()
    return {
        "model_version": MODEL_VERSION,
        "model_file_exists": model_path().exists(),
        "model_path": str(model_path()),
        "fusion_model_exists": fusion_path.exists(),
        "fusion_model_path": str(fusion_path),
    }
