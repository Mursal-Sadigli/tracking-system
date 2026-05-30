from __future__ import annotations

import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

GRID_SIZE = 0.002
MIN_POINTS_DEFAULT = int(os.environ.get("ML_BASELINE_MIN_POINTS", "50"))


def _data_dir() -> Path:
    base = os.environ.get("ML_DATA_DIR", "./data/ml")
    return Path(base)


def _baseline_path(device_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in device_id)
    return _data_dir() / "baselines" / f"{safe}.json"


def load_baseline(device_id: str) -> Dict[str, Any]:
    path = _baseline_path(device_id)
    if not path.exists():
        return _empty_baseline(device_id)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("device_id", device_id)
        return data
    except Exception:
        return _empty_baseline(device_id)


def _empty_baseline(device_id: str) -> Dict[str, Any]:
    return {
        "device_id": device_id,
        "points_seen": 0,
        "primary_zone": None,
        "feature_stats": {},
        "grid_counts": {},
    }


def save_baseline(baseline: Dict[str, Any]) -> None:
    device_id = baseline.get("device_id") or "unknown"
    path = _baseline_path(device_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(baseline, f, ensure_ascii=False)


def reset_baseline(device_id: str) -> None:
    path = _baseline_path(device_id)
    if path.exists():
        path.unlink()


def _grid_key(lat: float, lon: float) -> str:
    return f"{round(lat / GRID_SIZE)}_{round(lon / GRID_SIZE)}"


def _update_primary_zone(baseline: Dict[str, Any]) -> None:
    grid = baseline.get("grid_counts") or {}
    if not grid:
        baseline["primary_zone"] = None
        return
    top_key = max(grid.items(), key=lambda x: x[1])[0]
    parts = top_key.split("_")
    lat = float(parts[0]) * GRID_SIZE
    lon = float(parts[1]) * GRID_SIZE
    baseline["primary_zone"] = {"lat": lat, "lon": lon, "grid_key": top_key, "count": grid[top_key]}


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2.0


def _mad(values: List[float], med: float) -> float:
    if not values:
        return 1.0
    devs = [abs(v - med) for v in values]
    mad = _median(devs)
    return mad if mad > 1e-6 else 1.0


def update_baseline_from_history(
    device_id: str,
    history: List[Dict[str, Any]],
    feature_rows: List[Dict[str, float]],
    min_points: int = MIN_POINTS_DEFAULT,
) -> Dict[str, Any]:
    baseline = load_baseline(device_id)
    baseline["device_id"] = device_id
    baseline["points_seen"] = max(baseline.get("points_seen", 0), len(history))

    grid: Dict[str, int] = defaultdict(int, baseline.get("grid_counts") or {})
    for p in history[-100:]:
        lat = p.get("lat") or p.get("latitude")
        lon = p.get("lon") or p.get("longitude")
        if lat is None or lon is None:
            continue
        grid[_grid_key(float(lat), float(lon))] += 1
    baseline["grid_counts"] = dict(grid)
    _update_primary_zone(baseline)

    stats: Dict[str, Dict[str, float]] = baseline.get("feature_stats") or {}
    from ml.features import FEATURE_NAMES

    for name in FEATURE_NAMES:
        vals = [float(row.get(name, 0)) for row in feature_rows if name in row]
        if not vals:
            continue
        med = _median(vals)
        mad = _mad(vals, med)
        stats[name] = {"median": med, "mad": mad, "n": len(vals)}
    baseline["feature_stats"] = stats
    baseline["ready"] = baseline["points_seen"] >= min_points
    save_baseline(baseline)
    return baseline


def z_score(feature: str, value: float, baseline: Dict[str, Any]) -> float:
    stats = (baseline.get("feature_stats") or {}).get(feature)
    if not stats:
        return 0.0
    med = float(stats.get("median", 0))
    mad = float(stats.get("mad", 1))
    return abs(value - med) / (1.4826 * mad)


def baseline_status(baseline: Dict[str, Any], min_points: int = MIN_POINTS_DEFAULT) -> Dict[str, Any]:
    return {
        "ready": baseline.get("points_seen", 0) >= min_points,
        "points_seen": baseline.get("points_seen", 0),
        "min_points": min_points,
        "primary_zone": baseline.get("primary_zone"),
    }
