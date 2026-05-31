"""ML v2 smoke tests."""

from __future__ import annotations

import math

import pytest

from ml.engine import score_tracking
from ml.forecast import build_forecast, forecast_anomalies
from ml.geo_context import point_in_polygon, point_to_polygon_min_distance_m, summarize_geofences
from ml.model_store import MODEL_VERSION, health_info


SQUARE = [
    {"lat": 40.41, "lon": 49.86},
    {"lat": 40.41, "lon": 49.87},
    {"lat": 40.42, "lon": 49.87},
    {"lat": 40.42, "lon": 49.86},
]


def test_point_in_polygon():
    assert point_in_polygon(40.415, 49.865, SQUARE)
    assert not point_in_polygon(40.40, 49.86, SQUARE)


def test_polygon_distance_outside():
    d = point_to_polygon_min_distance_m(40.40, 49.85, SQUARE)
    assert d > 0
    assert point_to_polygon_min_distance_m(40.415, 49.865, SQUARE) == 0.0


def test_summarize_geofences():
    fences = [
        {"zone_type": "forbidden", "name": "A", "polygon": SQUARE},
        {"zone_type": "restricted", "name": "B", "polygon": SQUARE},
    ]
    s = summarize_geofences(40.415, 49.865, fences)
    assert s["inside_forbidden"] == 1.0
    assert s["dist_forbidden_m"] == 0.0


def _history(n=55, lat=40.415, lon=49.865):
    rows = []
    for i in range(n):
        rows.append(
            {
                "lat": lat + i * 0.00001,
                "lon": lon + i * 0.00001,
                "speed_kmh": 30 + (i % 5),
                "timestamp": f"2026-06-01T10:{i % 60:02d}:00",
                "accuracy": 20,
                "is_moving": True,
            }
        )
    return rows


def test_score_tracking_v2_schema():
    out = score_tracking(
        {
            "device_id": "test_device",
            "case_id": "case_1",
            "history": _history(),
            "context": {
                "geofences": [{"zone_type": "forbidden", "name": "Z", "polygon": SQUARE}],
                "in_corridor": True,
                "deviation_score": 0,
                "corridor_distance_m": 10,
                "co_location_recent": 1,
            },
        }
    )
    assert out["model_version"] == MODEL_VERSION
    assert out["model_version"] == "v2"
    assert "risk_score" in out
    assert "forecast" in out
    assert "ensemble" in out
    assert "fusion" in out
    assert isinstance(out["explanations"], list)


def test_forecast_geofence_eta():
    history = _history(25)
    fences = [{"zone_type": "forbidden", "name": "Forbidden", "polygon": SQUARE}]
    fc = build_forecast(history, fences)
    assert fc.get("forecast_15m") is not None
    anomalies = forecast_anomalies(fc, fences)
    assert isinstance(anomalies, list)


def test_health_info_v2():
    info = health_info()
    assert info["model_version"] == "v2"
