from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from ml.baseline import MIN_POINTS_DEFAULT, z_score
from ml.features import _point_speed_kmh
from ml.geo_utils import haversine_meters

THRESHOLD = float(os.environ.get("ML_ANOMALY_THRESHOLD", "0.65"))
Z_THRESHOLD = 3.0


def rule_anomalies(
    history: List[Dict[str, Any]],
    speed_kmh: float,
    context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    ctx = context or {}
    speed_limit = float(ctx.get("speed_limit_kmh") or 80)
    teleport_dist = float(ctx.get("teleport_distance_m") or 3000)
    teleport_sec = float(ctx.get("teleport_max_seconds") or 90)
    accuracy_max = float(ctx.get("accuracy_max_m") or 250)

    anomalies: List[Dict[str, Any]] = []
    if speed_kmh > speed_limit:
        anomalies.append(
            {
                "type": "speed",
                "severity": "high" if speed_kmh > speed_limit * 1.3 else "medium",
                "score": min(1.0, speed_kmh / max(speed_limit, 1)),
                "explanation_az": f"Sürət limiti aşılıb: {speed_kmh:.0f} km/saat",
                "value": speed_kmh,
            }
        )

    recent = history[-5:]
    if len(recent) >= 2:
        a, b = recent[-2], recent[-1]
        dist = haversine_meters(float(a["lat"]), float(a["lon"]), float(b["lat"]), float(b["lon"]))
        try:
            from datetime import datetime

            t1 = datetime.fromisoformat(str(a["timestamp"]).replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(str(b["timestamp"]).replace("Z", "+00:00"))
            dt = max(0.0, (t2 - t1).total_seconds())
        except Exception:
            dt = 0.0
        if 0 < dt < teleport_sec and dist > teleport_dist:
            anomalies.append(
                {
                    "type": "teleport",
                    "severity": "high",
                    "score": min(1.0, dist / teleport_dist),
                    "explanation_az": f"GPS sıçrayışı: {(dist / 1000):.1f} km {int(dt)} saniyədə",
                    "value": dist,
                }
            )

    last = history[-1] if history else {}
    acc = last.get("accuracy")
    if acc is not None and float(acc) > accuracy_max:
        anomalies.append(
            {
                "type": "accuracy",
                "severity": "low",
                "score": min(1.0, float(acc) / accuracy_max),
                "explanation_az": f"Zəif GPS dəqiqliyi: ±{int(float(acc))} m",
                "value": float(acc),
            }
        )

    if ctx.get("in_corridor") is False:
        dev = float(ctx.get("deviation_score") or 0)
        anomalies.append(
            {
                "type": "corridor_exit",
                "severity": "high" if dev > 50 else "medium",
                "score": min(1.0, dev / 100.0),
                "explanation_az": f"Missiya koridorundan kənar (sapma: {dev:.0f}%)",
                "value": dev,
            }
        )

    if float(ctx.get("inside_forbidden") if "inside_forbidden" in ctx else 0) > 0:
        anomalies.append(
            {
                "type": "inside_forbidden",
                "severity": "critical",
                "score": 1.0,
                "explanation_az": "Subyekt qadağan zonada!",
                "value": 1,
            }
        )

    return anomalies


def ml_anomalies(
    current_features: Dict[str, float],
    baseline: Dict[str, Any],
    ensemble_score: Optional[float],
    min_points: int = MIN_POINTS_DEFAULT,
) -> Tuple[List[Dict[str, Any]], Dict[str, float]]:
    z_scores = {}
    for feat, val in current_features.items():
        z_scores[feat] = z_score(feat, float(val), baseline)

    anomalies: List[Dict[str, Any]] = []
    if baseline.get("points_seen", 0) < min_points:
        return anomalies, z_scores

    top_feat = max(z_scores.items(), key=lambda x: x[1]) if z_scores else ("", 0.0)
    if top_feat[1] >= Z_THRESHOLD:
        anomalies.append(
            {
                "type": "ml_deviation",
                "severity": "high" if top_feat[1] >= 4 else "medium",
                "score": min(1.0, top_feat[1] / 5.0),
                "explanation_az": f"Normal davranışdan kənar: {top_feat[0]} (z={top_feat[1]:.1f})",
                "value": top_feat[1],
                "feature": top_feat[0],
            }
        )

    score = ensemble_score
    if score is not None and score >= THRESHOLD:
        anomalies.append(
            {
                "type": "ml_isolation",
                "severity": "high" if score >= 0.85 else "medium",
                "score": score,
                "explanation_az": f"Trajektoriya profili adətənkindən fərqlidir (skor: {score:.2f})",
                "value": score,
            }
        )

    return anomalies, z_scores
