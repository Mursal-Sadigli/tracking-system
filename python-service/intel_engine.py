from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from analytics_engine import build_score, detect_anomalies, generate_heatmap


def build_profile(history: List[Dict]) -> Dict[str, Any]:
    score = build_score(history)
    grid: Dict[str, int] = defaultdict(int)
    grid_size = 0.002
    for p in history:
        key = f"{round(p['lat'] / grid_size)}_{round(p['lon'] / grid_size)}"
        grid[key] += 1

    dwell_zones = sorted(
        [
            {
                "lat": float(k.split("_")[0]) * grid_size,
                "lon": float(k.split("_")[1]) * grid_size,
                "dwell_count": v,
                "label": f"Zone_{k}",
            }
            for k, v in grid.items()
        ],
        key=lambda x: -x["dwell_count"],
    )[:10]

    hours = defaultdict(int)
    for p in history:
        ts = p.get("timestamp")
        if ts:
            try:
                h = str(ts)[11:13]
                hours[h] = hours.get(h, 0) + 1
            except Exception:
                pass

    routine_score = max(hours.values()) / max(1, len(history)) if hours else 0

    return {
        "dwell_zones": dwell_zones,
        "routine_score": round(routine_score, 2),
        "mobility_hubs": dwell_zones[:3],
        "anomalies": detect_anomalies(history),
        "heatmap": generate_heatmap(history),
        "score": score.get("score"),
        "risk_level": score.get("risk_level"),
        "summary_az": _summary_az(dwell_zones, score.get("risk_level", "unknown")),
    }


def _summary_az(dwell_zones: List[Dict], risk: str) -> str:
    if not dwell_zones:
        return "Kifayət qədər tarix yoxdur — davranış profili sonra formalaşacaq."
    top = dwell_zones[0]
    return (
        f"Əsas dayanma zonası təxminən {top['lat']:.4f}, {top['lon']:.4f} ətrafındadır. "
        f"Risk səviyyəsi: {risk}."
    )
