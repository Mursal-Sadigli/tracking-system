from __future__ import annotations

from typing import Any, Dict, List

TEMPLATES = {
    "speed_kmh": "Sürət adətən {median:.0f} km/s ətrafındadır; indi {value:.0f} km/s.",
    "dist_from_primary_zone_m": "Əsas zona adətən {median:.0f} m radiusundadır; indi {value:.0f} m kənardadır.",
    "heading_delta": "Kəskin istiqamət dəyişikliyi: {value:.0f}° (normal ~{median:.0f}°).",
    "accuracy": "GPS dəqiqliyi zəifdir: ±{value:.0f} m.",
    "dist_from_last_point_m": "Son nöqtədən gözlənilmədən böyük məsafə: {value:.0f} m.",
    "in_corridor": "Subyekt planlaşdırılmış koridordan kənardadır.",
    "hour_sin": "Bu saatda adətən fərqli zonada olur.",
    "battery": "Batareya səviyyəsi aşağıdır: {value:.0f}%.",
}


def build_explanations(
    current_features: Dict[str, float],
    baseline: Dict[str, Any],
    z_scores: Dict[str, float],
    context: Dict[str, Any] | None = None,
    limit: int = 3,
) -> List[Dict[str, Any]]:
    ctx = context or {}
    stats = baseline.get("feature_stats") or {}
    ranked = sorted(z_scores.items(), key=lambda x: -x[1])
    out: List[Dict[str, Any]] = []

    if ctx.get("in_corridor") is False:
        out.append(
            {
                "feature": "in_corridor",
                "value": 0,
                "z_score": z_scores.get("in_corridor", 1.0),
                "explanation_az": TEMPLATES["in_corridor"],
            }
        )

    for feature, z in ranked:
        if len(out) >= limit:
            break
        if z < 2.0 and feature != "in_corridor":
            continue
        tpl = TEMPLATES.get(feature)
        if not tpl:
            continue
        st = stats.get(feature, {})
        median = float(st.get("median", 0))
        value = float(current_features.get(feature, 0))
        try:
            text = tpl.format(median=median, value=value)
        except Exception:
            text = f"{feature}: {value:.1f} (z={z:.1f})"
        out.append(
            {
                "feature": feature,
                "value": round(value, 2),
                "z_score": round(z, 2),
                "explanation_az": text,
            }
        )

    return out[:limit]
