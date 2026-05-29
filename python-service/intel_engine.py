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


def _hour_bucket(ts: Any) -> str:
    if not ts:
        return "day"
    try:
        h = int(str(ts)[11:13])
        if 22 <= h or h < 6:
            return "night"
        if 9 <= h < 18:
            return "work"
        return "day"
    except Exception:
        return "day"


def build_routine_clusters(history: List[Dict]) -> Dict[str, Any]:
    """Pattern-of-life: grid klasterlər + gün/gecə/iş etiketi."""
    if len(history) < 5:
        return {"zones": [], "summary_az": "Rutin zona üçün daha çox GPS nöqtəsi lazımdır."}

    grid_size = 0.002
    buckets: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "night": 0, "work": 0, "day": 0, "lat_sum": 0.0, "lon_sum": 0.0}
    )

    for p in history:
        key = f"{round(p['lat'] / grid_size)}_{round(p['lon'] / grid_size)}"
        cell = buckets[key]
        cell["count"] += 1
        cell["lat_sum"] += p["lat"]
        cell["lon_sum"] += p["lon"]
        hb = _hour_bucket(p.get("timestamp"))
        cell[hb] += 1

    ranked = sorted(buckets.items(), key=lambda x: -x[1]["count"])[:8]
    zones = []
    labels_az = {"night": "Gecə nöqtəsi", "work": "İş zonası", "day": "Gündüz rutini", "primary": "Əsas zona"}

    for i, (key, cell) in enumerate(ranked):
        dominant = max(("night", "work", "day"), key=lambda k: cell[k])
        if i == 0:
            zone_type = "primary"
            label = labels_az["primary"]
        else:
            zone_type = dominant
            label = labels_az.get(dominant, "Zona")

        lat = cell["lat_sum"] / cell["count"]
        lon = cell["lon_sum"] / cell["count"]
        zones.append(
            {
                "id": f"rz_{key}",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "radius_m": min(250, 80 + cell["count"] * 5),
                "dwell_count": cell["count"],
                "label": label,
                "type": zone_type,
                "night_visits": cell["night"],
                "work_visits": cell["work"],
                "day_visits": cell["day"],
            }
        )

    summary = (
        f"{len(zones)} rutin zona aşkarlandı. Əsas: {zones[0]['label']} "
        f"({zones[0]['lat']:.4f}, {zones[0]['lon']:.4f})."
        if zones
        else "Rutin zona tapılmadı."
    )
    return {"zones": zones, "summary_az": summary}
