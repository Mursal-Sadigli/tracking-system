from __future__ import annotations

import math

from ml.features import extract_point_features, haversine_meters


def test_haversine_zero_distance():
    assert haversine_meters(40.0, 49.0, 40.0, 49.0) == 0.0


def test_extract_point_features_basic():
    p1 = {"lat": 40.4093, "lon": 49.8671, "speed_kmh": 30, "heading": 90, "timestamp": "2026-01-01T10:00:00Z"}
    p2 = {"lat": 40.4100, "lon": 49.8680, "speed_kmh": 35, "heading": 95, "timestamp": "2026-01-01T10:01:00Z"}
    zone = {"lat": 40.4093, "lon": 49.8671}
    f = extract_point_features(p2, p1, zone, {"in_corridor": True})
    assert f["speed_kmh"] == 35
    assert f["heading_delta"] == 5
    assert f["dist_from_primary_zone_m"] >= 0
    assert f["in_corridor"] == 1.0


def test_hour_sin_cos_bounded():
    p = {"lat": 0, "lon": 0, "timestamp": "2026-01-01T06:00:00Z"}
    f = extract_point_features(p, None, None, {})
    assert -1 <= f["hour_sin"] <= 1
    assert -1 <= f["hour_cos"] <= 1
