from __future__ import annotations

from typing import Any, Dict, List


def risk_level_from_score(score: float) -> str:
    if score < 45:
        return "high"
    if score < 75:
        return "medium"
    return "low"


def compute_rule_risk_score(
    anomalies: List[Dict[str, Any]],
    current_features: Dict[str, float],
    context: Dict[str, Any] | None = None,
) -> int:
    ctx = context or {}
    score = 100.0

    for a in anomalies:
        sev = a.get("severity", "medium")
        penalty = {"critical": 22, "high": 18, "medium": 10, "low": 5}.get(sev, 8)
        score -= penalty * float(a.get("score") or 0.5)

    dev = float(ctx.get("deviation_score") or current_features.get("corridor_deviation_pct") or 0)
    if ctx.get("in_corridor") is False or current_features.get("in_corridor", 1) < 0.5:
        score -= min(25, dev * 0.25)

    if float(current_features.get("inside_forbidden") or 0) > 0.5:
        score -= 30

    dist_forbidden = float(current_features.get("dist_forbidden_m") or 99999)
    if dist_forbidden < 500:
        score -= min(20, (500 - dist_forbidden) / 25)

    dist_zone = float(current_features.get("dist_from_primary_zone_m") or 0)
    if dist_zone > 2000:
        score -= min(15, dist_zone / 500)

    acc = float(current_features.get("accuracy") or 0)
    if acc > 150:
        score -= min(10, (acc - 150) / 20)

    coloc = float(ctx.get("co_location_recent") or 0)
    if coloc > 0:
        score -= min(12, coloc * 3)

    return int(max(0, min(100, round(score))))


def compute_risk_score(
    anomalies: List[Dict[str, Any]],
    current_features: Dict[str, float],
    context: Dict[str, Any] | None = None,
    fusion_result: Dict[str, Any] | None = None,
) -> int:
    if fusion_result and fusion_result.get("blended_score") is not None:
        return int(fusion_result["blended_score"])
    return compute_rule_risk_score(anomalies, current_features, context)
