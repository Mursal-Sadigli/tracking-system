from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

FEATURE_NAMES = [
    "speed_kmh",
    "heading_delta",
    "accuracy",
    "battery",
    "hour_sin",
    "hour_cos",
    "dist_from_primary_zone_m",
    "dist_from_last_point_m",
    "dt_seconds",
    "in_corridor",
    "is_moving",
]


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_hour(ts: Any) -> float:
    if not ts:
        return 12.0
    try:
        if isinstance(ts, str):
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = ts
        return float(dt.hour) + dt.minute / 60.0
    except Exception:
        try:
            return float(str(ts)[11:13])
        except Exception:
            return 12.0


def _point_speed_kmh(point: Dict[str, Any]) -> float:
    if point.get("speed_kmh") is not None:
        return float(point["speed_kmh"])
    return float(point.get("speed") or 0) * 3.6


def extract_point_features(
    point: Dict[str, Any],
    prev: Optional[Dict[str, Any]],
    primary_zone: Optional[Dict[str, float]],
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, float]:
    ctx = context or {}
    speed_kmh = _point_speed_kmh(point)
    heading = float(point.get("heading") or 0)
    prev_heading = float(prev.get("heading") or 0) if prev else heading
    heading_delta = abs(heading - prev_heading)
    if heading_delta > 180:
        heading_delta = 360 - heading_delta

    lat = float(point.get("lat") or point.get("latitude") or 0)
    lon = float(point.get("lon") or point.get("longitude") or 0)

    dist_zone = 0.0
    if primary_zone and primary_zone.get("lat") is not None:
        dist_zone = haversine_meters(lat, lon, primary_zone["lat"], primary_zone["lon"])

    dist_last = 0.0
    dt_seconds = 0.0
    if prev:
        plat = float(prev.get("lat") or prev.get("latitude") or 0)
        plon = float(prev.get("lon") or prev.get("longitude") or 0)
        dist_last = haversine_meters(plat, plon, lat, lon)
        try:
            t1 = prev.get("timestamp")
            t2 = point.get("timestamp")
            if t1 and t2:
                d1 = datetime.fromisoformat(str(t1).replace("Z", "+00:00"))
                d2 = datetime.fromisoformat(str(t2).replace("Z", "+00:00"))
                dt_seconds = max(0.0, (d2 - d1).total_seconds())
        except Exception:
            dt_seconds = 0.0

    hour = _parse_hour(point.get("timestamp"))
    hour_rad = hour / 24.0 * 2 * math.pi

    return {
        "speed_kmh": speed_kmh,
        "heading_delta": heading_delta,
        "accuracy": float(point.get("accuracy") or 50.0),
        "battery": float(point.get("battery_level") or 100.0),
        "hour_sin": math.sin(hour_rad),
        "hour_cos": math.cos(hour_rad),
        "dist_from_primary_zone_m": dist_zone,
        "dist_from_last_point_m": dist_last,
        "dt_seconds": dt_seconds,
        "in_corridor": 1.0 if ctx.get("in_corridor", True) else 0.0,
        "is_moving": 1.0 if point.get("is_moving") else 0.0,
    }


def features_to_vector(features: Dict[str, float]) -> List[float]:
    return [float(features.get(name, 0.0)) for name in FEATURE_NAMES]


def build_feature_matrix(
    history: List[Dict[str, Any]],
    primary_zone: Optional[Dict[str, float]],
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[List[List[float]], List[Dict[str, float]]]:
    rows: List[List[float]] = []
    meta: List[Dict[str, float]] = []
    for i, point in enumerate(history):
        prev = history[i - 1] if i > 0 else None
        feat = extract_point_features(point, prev, primary_zone, context if i == len(history) - 1 else None)
        rows.append(features_to_vector(feat))
        meta.append(feat)
    return rows, meta
