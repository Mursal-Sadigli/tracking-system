from __future__ import annotations

from typing import Any, Dict, List, Optional

from ml.anomaly import compute_isolation_score, ml_anomalies, rule_anomalies
from ml.baseline import MIN_POINTS_DEFAULT, baseline_status, update_baseline_from_history, z_score
from ml.explain import build_explanations
from ml.features import build_feature_matrix, extract_point_features, features_to_vector
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

    speed_kmh = float(current_features.get("speed_kmh") or 0)
    rule_list = rule_anomalies(history, speed_kmh, context)

    if_score = compute_isolation_score(matrix, current_vector) if len(matrix) >= 30 else None
    ml_list, z_scores = ml_anomalies(current_features, baseline, if_score, MIN_POINTS_DEFAULT)

    merged: List[Dict[str, Any]] = list(rule_list)
    seen_types = {a["type"] for a in merged}
    for a in ml_list:
        if a["type"] not in seen_types:
            merged.append(a)
            seen_types.add(a["type"])

    risk_score = compute_risk_score(merged, current_features, context)
    risk_level = risk_level_from_score(risk_score)
    explanations = build_explanations(current_features, baseline, z_scores, context)

    return {
        "model_version": MODEL_VERSION,
        "device_id": device_id,
        "case_id": payload.get("case_id"),
        "risk_score": risk_score,
        "risk_level": risk_level,
        "anomalies": merged,
        "explanations": explanations,
        "baseline": baseline_status(baseline),
        "isolation_score": if_score,
    }
