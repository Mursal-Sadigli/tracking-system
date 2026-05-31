from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ml.model_store import fusion_model_path
from ml.risk import compute_rule_risk_score

FUSION_BLEND = float(os.environ.get("ML_FUSION_BLEND", "0.6"))

FUSION_FEATURE_NAMES = [
    "anomaly_count",
    "max_severity_score",
    "isolation_score",
    "ensemble_score",
    "ae_score",
    "dist_forbidden_m",
    "inside_forbidden",
    "corridor_deviation_pct",
    "in_corridor",
    "co_location_recent",
    "forecast_geofence_eta_minutes",
    "dist_from_primary_zone_m",
    "speed_kmh",
]

SEVERITY_WEIGHT = {"high": 1.0, "critical": 1.0, "medium": 0.6, "low": 0.3}


def build_fusion_features(
    anomalies: List[Dict[str, Any]],
    current_features: Dict[str, float],
    context: Dict[str, Any],
    ensemble: Dict[str, Any],
    forecast: Dict[str, Any],
    isolation_score: Optional[float],
) -> Dict[str, float]:
    max_sev = 0.0
    for a in anomalies:
        max_sev = max(max_sev, SEVERITY_WEIGHT.get(a.get("severity", "medium"), 0.5) * float(a.get("score") or 0.5))

    eta = forecast.get("geofence_eta_minutes")
    eta_val = float(eta) if eta is not None else 999.0

    return {
        "anomaly_count": float(len(anomalies)),
        "max_severity_score": max_sev,
        "isolation_score": float(isolation_score or ensemble.get("if_score") or 0),
        "ensemble_score": float(ensemble.get("ensemble_score") or 0),
        "ae_score": float(ensemble.get("ae_score") or 0),
        "dist_forbidden_m": float(current_features.get("dist_forbidden_m") or 99999),
        "inside_forbidden": float(current_features.get("inside_forbidden") or 0),
        "corridor_deviation_pct": float(current_features.get("corridor_deviation_pct") or 0),
        "in_corridor": float(current_features.get("in_corridor") or 1),
        "co_location_recent": float(context.get("co_location_recent") or 0),
        "forecast_geofence_eta_minutes": eta_val,
        "dist_from_primary_zone_m": float(current_features.get("dist_from_primary_zone_m") or 0),
        "speed_kmh": float(current_features.get("speed_kmh") or 0),
    }


def _features_to_row(feat: Dict[str, float]) -> List[float]:
    return [float(feat.get(n, 0.0)) for n in FUSION_FEATURE_NAMES]


def _load_xgb_model():
    path = fusion_model_path()
    if not path.exists():
        return None
    try:
        import xgboost as xgb

        model = xgb.XGBRegressor()
        model.load_model(str(path))
        return model
    except Exception:
        return None


def _ensure_fusion_model():
    model = _load_xgb_model()
    if model is not None:
        return model

    try:
        import xgboost as xgb

        rng = np.random.default_rng(42)
        X = []
        y = []
        for _ in range(120):
            feat = {
                "anomaly_count": float(rng.integers(0, 4)),
                "max_severity_score": float(rng.random()),
                "isolation_score": float(rng.random()),
                "ensemble_score": float(rng.random()),
                "ae_score": float(rng.random()),
                "dist_forbidden_m": float(rng.uniform(0, 5000)),
                "inside_forbidden": float(rng.integers(0, 2)),
                "corridor_deviation_pct": float(rng.uniform(0, 100)),
                "in_corridor": float(rng.integers(0, 2)),
                "co_location_recent": float(rng.integers(0, 5)),
                "forecast_geofence_eta_minutes": float(rng.uniform(0, 120)),
                "dist_from_primary_zone_m": float(rng.uniform(0, 5000)),
                "speed_kmh": float(rng.uniform(0, 120)),
            }
            pseudo_anomalies = [{"severity": "medium", "score": feat["max_severity_score"]}] if feat["anomaly_count"] else []
            rule = compute_rule_risk_score(pseudo_anomalies, feat, {})
            X.append(_features_to_row(feat))
            y.append(100 - rule)

        model = xgb.XGBRegressor(
            n_estimators=64,
            max_depth=4,
            learning_rate=0.1,
            random_state=42,
        )
        model.fit(np.array(X), np.array(y))
        path = fusion_model_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        model.save_model(str(path))
        return model
    except Exception:
        return None


def fuse_risk_score(
    anomalies: List[Dict[str, Any]],
    current_features: Dict[str, float],
    context: Dict[str, Any],
    ensemble: Dict[str, Any],
    forecast: Dict[str, Any],
    isolation_score: Optional[float],
) -> Dict[str, Any]:
    rule_score = compute_rule_risk_score(anomalies, current_features, context)
    fusion_features = build_fusion_features(
        anomalies, current_features, context, ensemble, forecast, isolation_score
    )

    model = _ensure_fusion_model()
    xgb_score = rule_score
    if model is not None:
        try:
            row = np.array([_features_to_row(fusion_features)])
            penalty = float(model.predict(row)[0])
            xgb_score = int(max(0, min(100, round(100 - penalty))))
        except Exception:
            xgb_score = rule_score

    blend = max(0.0, min(1.0, FUSION_BLEND))
    blended = int(max(0, min(100, round(blend * xgb_score + (1 - blend) * rule_score))))

    return {
        "rule_score": rule_score,
        "xgb_score": xgb_score,
        "blended_score": blended,
        "features": fusion_features,
        "model_loaded": model is not None,
    }
