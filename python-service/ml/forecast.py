from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from ml.geo_utils import haversine_meters
from ml.geo_context import point_in_polygon, point_to_polygon_min_distance_m


def _parse_ts(ts: Any) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def _point_lat_lon(point: Dict[str, Any]) -> Tuple[float, float]:
    return (
        float(point.get("lat") or point.get("latitude") or 0),
        float(point.get("lon") or point.get("longitude") or 0),
    )


def extrapolate_position(history: List[Dict[str, Any]], minutes_ahead: float) -> Optional[Dict[str, float]]:
    if len(history) < 3:
        return None

    recent = history[-20:]
    times: List[float] = []
    lats: List[float] = []
    lons: List[float] = []
    t0 = _parse_ts(recent[0].get("timestamp"))
    if not t0:
        return None

    for p in recent:
        ts = _parse_ts(p.get("timestamp"))
        if not ts:
            continue
        lat, lon = _point_lat_lon(p)
        times.append((ts - t0).total_seconds())
        lats.append(lat)
        lons.append(lon)

    if len(times) < 3:
        return None

    def linreg(xs: List[float], ys: List[float]) -> Tuple[float, float]:
        n = len(xs)
        sx = sum(xs)
        sy = sum(ys)
        sxx = sum(x * x for x in xs)
        sxy = sum(x * y for x, y in zip(xs, ys))
        denom = n * sxx - sx * sx
        if abs(denom) < 1e-9:
            return 0.0, ys[-1]
        slope = (n * sxy - sx * sy) / denom
        intercept = (sy - slope * sx) / n
        return slope, intercept

    lat_slope, lat_intercept = linreg(times, lats)
    lon_slope, lon_intercept = linreg(times, lons)
    target_t = times[-1] + minutes_ahead * 60.0
    return {
        "lat": lat_slope * target_t + lat_intercept,
        "lon": lon_slope * target_t + lon_intercept,
        "minutes_ahead": minutes_ahead,
    }


def _speed_mps(history: List[Dict[str, Any]]) -> float:
    if len(history) < 2:
        return 0.0
    a, b = history[-2], history[-1]
    lat1, lon1 = _point_lat_lon(a)
    lat2, lon2 = _point_lat_lon(b)
    dist = haversine_meters(lat1, lon1, lat2, lon2)
    t1 = _parse_ts(a.get("timestamp"))
    t2 = _parse_ts(b.get("timestamp"))
    if not t1 or not t2:
        return 0.0
    dt = max(0.1, (t2 - t1).total_seconds())
    return dist / dt


def estimate_geofence_eta_minutes(
    lat: float,
    lon: float,
    speed_mps: float,
    geofences: List[Dict[str, Any]],
    zone_types: Tuple[str, ...] = ("forbidden", "restricted"),
) -> Tuple[Optional[float], Optional[str], Optional[str]]:
    if speed_mps < 0.3:
        return None, None, None

    best_eta = None
    best_type = None
    best_name = None

    for fence in geofences:
        zt = fence.get("zone_type") or "restricted"
        if zt not in zone_types:
            continue
        polygon = fence.get("polygon") or []
        if len(polygon) < 3:
            continue
        if point_in_polygon(lat, lon, polygon):
            return 0.0, zt, fence.get("name")

        dist = point_to_polygon_min_distance_m(lat, lon, polygon)
        eta_min = (dist / speed_mps) / 60.0
        if best_eta is None or eta_min < best_eta:
            best_eta = eta_min
            best_type = zt
            best_name = fence.get("name")

    return best_eta, best_type, best_name


def build_forecast(
    history: List[Dict[str, Any]],
    geofences: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    geofences = geofences or []
    if len(history) < 3:
        return {
            "forecast_15m": None,
            "forecast_30m": None,
            "geofence_eta_minutes": None,
            "approaching_zone_type": None,
            "approaching_zone_name": None,
        }

    lat, lon = _point_lat_lon(history[-1])
    f15 = extrapolate_position(history, 15.0)
    f30 = extrapolate_position(history, 30.0)
    speed_mps = _speed_mps(history)
    eta, zone_type, zone_name = estimate_geofence_eta_minutes(lat, lon, speed_mps, geofences)

    return {
        "forecast_15m": f15,
        "forecast_30m": f30,
        "geofence_eta_minutes": round(eta, 1) if eta is not None else None,
        "approaching_zone_type": zone_type,
        "approaching_zone_name": zone_name,
        "speed_mps": round(speed_mps, 2),
    }


def forecast_anomalies(
    forecast: Dict[str, Any],
    geofences: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    geofences = geofences or []
    anomalies: List[Dict[str, Any]] = []
    eta = forecast.get("geofence_eta_minutes")
    zone_type = forecast.get("approaching_zone_type")
    zone_name = forecast.get("approaching_zone_name") or "Zona"

    if eta is not None and eta <= 30 and zone_type in ("forbidden", "restricted"):
        atype = f"approaching_{zone_type}"
        severity = "critical" if zone_type == "forbidden" and eta <= 10 else "high"
        anomalies.append(
            {
                "type": atype,
                "severity": severity,
                "score": min(1.0, max(0.3, 1.0 - eta / 30.0)),
                "explanation_az": f"Proqnoz: {zone_name} zonasına ~{int(max(1, eta))} dəq (təxmini)",
                "value": eta,
                "zone_type": zone_type,
                "zone_name": zone_name,
            }
        )

    for label, pos in (("15m", forecast.get("forecast_15m")), ("30m", forecast.get("forecast_30m"))):
        if not pos:
            continue
        for fence in geofences:
            if (fence.get("zone_type") or "restricted") != "forbidden":
                continue
            polygon = fence.get("polygon") or []
            if len(polygon) >= 3 and point_in_polygon(pos["lat"], pos["lon"], polygon):
                anomalies.append(
                    {
                        "type": "forecast_forbidden_entry",
                        "severity": "high",
                        "score": 0.85 if label == "15m" else 0.65,
                        "explanation_az": f"Proqnoz ({label}): qadağan zonaya daxil olacaq — {fence.get('name', 'Zona')}",
                        "value": pos.get("minutes_ahead"),
                        "zone_name": fence.get("name"),
                    }
                )
                break

    return anomalies
