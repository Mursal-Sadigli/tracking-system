from __future__ import annotations

from typing import Any, Dict, List, Optional

from ml.anomaly import ml_anomalies, rule_anomalies
from ml.baseline import MIN_POINTS_DEFAULT, baseline_status, update_baseline_from_history
from ml.ensemble import score_ensemble
from ml.explain import build_explanations, build_shap_explanations, merge_explanations
from ml.features import build_feature_matrix, extract_point_features, features_to_vector
from ml.forecast import build_forecast, forecast_anomalies
from ml.fusion import _ensure_fusion_model, fuse_risk_score
from ml.model_store import MODEL_VERSION
from ml.risk import compute_risk_score, risk_level_from_score


def score_tracking(payload: Dict[str, Any]) -> Dict[str, Any]:
    device_id = payload.get("device_id") or "unknown"
    history: List[Dict[str, Any]] = list(payload.get("history") or [])
    context: Dict[str, Any] = dict(payload.get("context") or {})
    current_raw = payload.get("current") or (history[-1] if history else {})

    if not history and current_raw:
        history = [current_raw]

    if not history:
        return {
            "model_version": MODEL_VERSION,
            "risk_score": 50,
            "risk_level": "medium",
            "anomalies": [],
            "explanations": [],
            "baseline": {"ready": False, "points_seen": 0, "min_points": MIN_POINTS_DEFAULT},
            "forecast": {},
            "ensemble": {},
            "fusion": {},
            "isolation_score": None,
        }

    prev = history[-2] if len(history) >= 2 else None
    from ml.baseline import load_baseline

    pre_baseline = load_baseline(device_id)
    primary_zone = pre_baseline.get("primary_zone")

    matrix, feature_meta = build_feature_matrix(history, primary_zone, context)
    baseline = update_baseline_from_history(device_id, history, feature_meta, MIN_POINTS_DEFAULT)
    primary_zone = baseline.get("primary_zone")

    current_features = extract_point_features(history[-1], prev, primary_zone, context)
    current_vector = features_to_vector(current_features)

    geofences = context.get("geofences") or []
    context["inside_forbidden"] = current_features.get("inside_forbidden", 0) > 0.5

    speed_kmh = float(current_features.get("speed_kmh") or 0)
    rule_list = rule_anomalies(history, speed_kmh, context)

    forecast = build_forecast(history, geofences)
    forecast_list = forecast_anomalies(forecast, geofences)

    ensemble = score_ensemble(device_id, matrix, current_vector, baseline.get("points_seen", 0))
    if ensemble.get("anomaly"):
        rule_list.append(ensemble["anomaly"])

    ensemble_score = ensemble.get("ensemble_score")
    ml_list, z_scores = ml_anomalies(current_features, baseline, ensemble_score, MIN_POINTS_DEFAULT)

    merged: List[Dict[str, Any]] = list(rule_list)
    seen_types = {a["type"] for a in merged}
    for a in ml_list:
        if a["type"] not in seen_types:
            merged.append(a)
            seen_types.add(a["type"])
    for a in forecast_list:
        if a["type"] not in seen_types:
            merged.append(a)
            seen_types.add(a["type"])

    fusion = fuse_risk_score(
        merged,
        current_features,
        context,
        ensemble,
        forecast,
        ensemble.get("if_score"),
    )

    risk_score = compute_risk_score(merged, current_features, context, fusion)
    risk_level = risk_level_from_score(risk_score)

    baseline_ex = build_explanations(current_features, baseline, z_scores, context)
    fusion_model = _ensure_fusion_model()
    shap_ex = build_shap_explanations(fusion.get("features") or {}, fusion_model)
    explanations = merge_explanations(baseline_ex, shap_ex)

    return {
        "model_version": MODEL_VERSION,
        "device_id": device_id,
        "case_id": payload.get("case_id"),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "anomalies": merged,
        "explanations": explanations,
        "baseline": baseline_status(baseline),
        "isolation_score": ensemble.get("if_score"),
        "forecast": forecast,
        "ensemble": {
            "if_score": ensemble.get("if_score"),
            "ae_score": ensemble.get("ae_score"),
            "ensemble_score": ensemble.get("ensemble_score"),
        },
        "fusion": {
            "rule_score": fusion.get("rule_score"),
            "xgb_score": fusion.get("xgb_score"),
            "blended_score": fusion.get("blended_score"),
        },
    }
