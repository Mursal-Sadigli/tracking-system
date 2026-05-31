from __future__ import annotations

from typing import Any, Dict, List, Optional

from ml.fusion import FUSION_FEATURE_NAMES

TEMPLATES = {
    "speed_kmh": "Sürət adətən {median:.0f} km/s ətrafındadır; indi {value:.0f} km/s.",
    "dist_from_primary_zone_m": "Əsas zona adətən {median:.0f} m radiusundadır; indi {value:.0f} m kənardadır.",
    "heading_delta": "Kəskin istiqamət dəyişikliyi: {value:.0f}° (normal ~{median:.0f}°).",
    "accuracy": "GPS dəqiqliyi zəifdir: ±{value:.0f} m.",
    "dist_from_last_point_m": "Son nöqtədən gözlənilmədən böyük məsafə: {value:.0f} m.",
    "in_corridor": "Subyekt planlaşdırılmış koridordan kənardadır.",
    "hour_sin": "Bu saatda adətən fərqli zonada olur.",
    "battery": "Batareya səviyyəsi aşağıdır: {value:.0f}%.",
    "dist_forbidden_m": "Qadağan zonadan {value:.0f} m məsafədədir.",
    "dist_restricted_m": "Məhdud zonadan {value:.0f} m məsafədədir.",
    "dist_secret_m": "Gizli obyekt zonasından {value:.0f} m məsafədədir.",
    "inside_forbidden": "Subyekt qadağan zonada!",
    "corridor_distance_m": "Koridor mərkəzindən {value:.0f} m uzaqlıqda.",
    "corridor_deviation_pct": "Koridor sapması: {value:.0f}%.",
}

FUSION_LABELS = {
    "anomaly_count": "Anomaliya sayı",
    "max_severity_score": "Anomaliya şiddəti",
    "isolation_score": "Isolation Forest skoru",
    "ensemble_score": "Ensemble skoru",
    "ae_score": "Autoencoder xətası",
    "dist_forbidden_m": "Qadağan zonaya məsafə",
    "inside_forbidden": "Qadağan zonada",
    "corridor_deviation_pct": "Koridor sapması",
    "in_corridor": "Koridor daxilində",
    "co_location_recent": "Son co-location",
    "forecast_geofence_eta_minutes": "Geozon ETA (dəq)",
    "dist_from_primary_zone_m": "Əsas zonadan məsafə",
    "speed_kmh": "Sürət",
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
                "contribution": None,
                "explanation_az": TEMPLATES["in_corridor"],
            }
        )

    if float(current_features.get("inside_forbidden") or 0) > 0.5:
        out.append(
            {
                "feature": "inside_forbidden",
                "value": 1,
                "z_score": z_scores.get("inside_forbidden", 0),
                "contribution": None,
                "explanation_az": TEMPLATES["inside_forbidden"],
            }
        )

    for feature, z in ranked:
        if len(out) >= limit:
            break
        if z < 2.0 and feature not in ("inside_forbidden", "in_corridor"):
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
                "contribution": None,
                "explanation_az": text,
            }
        )

    return out[:limit]


def build_shap_explanations(
    fusion_features: Dict[str, float],
    fusion_model: Any,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    if fusion_model is None or not fusion_features:
        return []

    try:
        import numpy as np
        import shap

        row = np.array([[float(fusion_features.get(n, 0.0)) for n in FUSION_FEATURE_NAMES]])
        explainer = shap.TreeExplainer(fusion_model)
        shap_values = explainer.shap_values(row)
        if isinstance(shap_values, list):
            shap_values = shap_values[0]
        vals = shap_values[0] if len(shap_values.shape) > 1 else shap_values

        ranked = sorted(
            zip(FUSION_FEATURE_NAMES, vals, row[0]),
            key=lambda x: abs(float(x[1])),
            reverse=True,
        )

        out: List[Dict[str, Any]] = []
        for name, contrib, val in ranked[:limit]:
            if abs(float(contrib)) < 0.01:
                continue
            label = FUSION_LABELS.get(name, name)
            direction = "risk artırır" if float(contrib) > 0 else "risk azaldır"
            out.append(
                {
                    "feature": name,
                    "value": round(float(val), 2),
                    "contribution": round(float(contrib), 3),
                    "z_score": None,
                    "explanation_az": f"{label}: {val:.1f} ({direction}, SHAP={contrib:+.2f})",
                }
            )
        return out
    except Exception:
        return []


def merge_explanations(
    baseline_explanations: List[Dict[str, Any]],
    shap_explanations: List[Dict[str, Any]],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    seen = set()
    merged: List[Dict[str, Any]] = []
    for ex in shap_explanations + baseline_explanations:
        key = ex.get("feature") or ex.get("explanation_az")
        if key in seen:
            continue
        seen.add(key)
        merged.append(ex)
        if len(merged) >= limit:
            break
    return merged
