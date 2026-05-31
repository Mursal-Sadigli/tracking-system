from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from ml.features import FEATURE_NAMES
from ml.model_store import load_ensemble_meta, load_ensemble_models, save_ensemble_models

ENSEMBLE_THRESHOLD = float(os.environ.get("ML_ANOMALY_THRESHOLD", "0.65"))
REFIT_EVERY = int(os.environ.get("ML_ENSEMBLE_REFIT_EVERY", "20"))


def _normalize_if(raw: float) -> float:
    return float(1.0 / (1.0 + np.exp(-raw)))


def _fit_isolation_forest(matrix: List[List[float]]):
    from sklearn.ensemble import IsolationForest

    X = np.array(matrix[-200:], dtype=float)
    clf = IsolationForest(contamination=0.08, random_state=42, n_estimators=64)
    clf.fit(X)
    return clf


def _fit_autoencoder(matrix: List[List[float]]):
    from sklearn.neural_network import MLPRegressor
    from sklearn.preprocessing import StandardScaler

    X = np.array(matrix[-200:], dtype=float)
    if len(X) < 30:
        return None, None
    scaler = StandardScaler()
    Xs = scaler.fit_transform(X)
    dim = Xs.shape[1]
    hidden = max(4, dim // 2)
    ae = MLPRegressor(
        hidden_layer_sizes=(hidden, max(2, hidden // 2), hidden),
        activation="relu",
        max_iter=300,
        random_state=42,
        early_stopping=True,
        validation_fraction=0.1,
    )
    ae.fit(Xs, Xs)
    return ae, scaler


def _ae_error(ae, scaler, vector: List[float]) -> Optional[float]:
    if ae is None or scaler is None:
        return None
    try:
        x = np.array([vector], dtype=float)
        xs = scaler.transform(x)
        recon = ae.predict(xs)
        mse = float(np.mean((xs - recon) ** 2))
        return min(1.0, mse / 2.0)
    except Exception:
        return None


def score_ensemble(
    device_id: str,
    feature_matrix: List[List[float]],
    current_vector: List[float],
    points_seen: int,
) -> Dict[str, Any]:
    if len(feature_matrix) < 30:
        return {"if_score": None, "ae_score": None, "ensemble_score": None, "anomaly": None}

    meta = load_ensemble_meta(device_id) or {}
    if_model, ae_bundle = load_ensemble_models(device_id)
    last_fit = int(meta.get("points_at_fit") or 0)
    needs_refit = if_model is None or (points_seen - last_fit) >= REFIT_EVERY

    if needs_refit:
        if_model = _fit_isolation_forest(feature_matrix)
        ae, scaler = _fit_autoencoder(feature_matrix)
        save_ensemble_models(device_id, if_model, ae, scaler, points_seen)

    ae = ae_bundle.get("ae") if ae_bundle else None
    scaler = ae_bundle.get("scaler") if ae_bundle else None

    if if_model is None:
        if_score = None
    else:
        try:
            raw = -if_model.decision_function(np.array([current_vector], dtype=float))[0]
            if_score = _normalize_if(raw)
        except Exception:
            if_score = None

    ae_score = _ae_error(ae, scaler, current_vector)

    parts = [s for s in (if_score, ae_score) if s is not None]
    ensemble_score = float(sum(parts) / len(parts)) if parts else None

    anomaly = None
    if ensemble_score is not None and ensemble_score >= ENSEMBLE_THRESHOLD:
        anomaly = {
            "type": "ml_ensemble",
            "severity": "high" if ensemble_score >= 0.85 else "medium",
            "score": ensemble_score,
            "explanation_az": f"Ensemble anomaliya (IF+AE skor: {ensemble_score:.2f})",
            "value": ensemble_score,
        }

    return {
        "if_score": if_score,
        "ae_score": ae_score,
        "ensemble_score": ensemble_score,
        "anomaly": anomaly,
    }


def compute_isolation_score(
    feature_matrix: List[List[float]],
    current_vector: List[float],
) -> Optional[float]:
    """Legacy fallback — per-request IF without persist."""
    if len(feature_matrix) < 30:
        return None
    try:
        clf = _fit_isolation_forest(feature_matrix)
        raw = -clf.decision_function(np.array([current_vector], dtype=float))[0]
        return _normalize_if(raw)
    except Exception:
        return None
