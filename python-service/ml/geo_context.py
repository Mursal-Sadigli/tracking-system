from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from ml.geo_utils import haversine_meters


def point_in_polygon(lat: float, lon: float, polygon: List[Dict[str, float]]) -> bool:
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi = polygon[i]["lon"]
        yi = polygon[i]["lat"]
        xj = polygon[j]["lon"]
        yj = polygon[j]["lat"]
        intersect = (yi > lat) != (yj > lat) and lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi
        if intersect:
            inside = not inside
        j = i
    return inside


def _distance_point_to_segment_meters(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Planar equirectangular approximation — accurate enough for city-scale geofences."""
    r = 6371000.0
    lat_ref = math.radians(px)

    def to_xy(lat: float, lon: float) -> tuple[float, float]:
        return (
            math.radians(lon) * math.cos(lat_ref) * r,
            math.radians(lat) * r,
        )

    x, y = to_xy(px, py)
    x1, y1 = to_xy(ax, ay)
    x2, y2 = to_xy(bx, by)
    dx, dy = x2 - x1, y2 - y1
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-12:
        return math.hypot(x - x1, y - y1)

    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / seg_len_sq))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(x - proj_x, y - proj_y)


def point_to_polygon_min_distance_m(lat: float, lon: float, polygon: List[Dict[str, float]]) -> float:
    if not polygon or len(polygon) < 3:
        return float("inf")
    if point_in_polygon(lat, lon, polygon):
        return 0.0
    min_d = float("inf")
    j = len(polygon) - 1
    for i in range(len(polygon)):
        a = polygon[j]
        b = polygon[i]
        d = _distance_point_to_segment_meters(lat, lon, a["lat"], a["lon"], b["lat"], b["lon"])
        if d < min_d:
            min_d = d
        j = i
    return min_d


def summarize_geofences(
    lat: float,
    lon: float,
    geofences: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, float]:
    geofences = geofences or []
    by_type = {"forbidden": [], "restricted": [], "secret": []}
    inside_forbidden = 0.0

    for fence in geofences:
        polygon = fence.get("polygon") or []
        if len(polygon) < 3:
            continue
        zone_type = fence.get("zone_type") or "restricted"
        if zone_type not in by_type:
            zone_type = "restricted"
        dist = point_to_polygon_min_distance_m(lat, lon, polygon)
        by_type[zone_type].append(dist)
        if zone_type == "forbidden" and dist <= 0:
            inside_forbidden = 1.0

    def nearest(vals: List[float]) -> float:
        return min(vals) if vals else 99999.0

    return {
        "dist_forbidden_m": nearest(by_type["forbidden"]),
        "dist_restricted_m": nearest(by_type["restricted"]),
        "dist_secret_m": nearest(by_type["secret"]),
        "inside_forbidden": inside_forbidden,
    }
