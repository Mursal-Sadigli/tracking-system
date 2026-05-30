#!/usr/bin/env python3
"""FastAPI: resolve, analytics, briefing, geofence, intel."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analytics_engine import build_score
from briefing_generator import generate_briefing
from geofence_engine import batch_check
from intel_engine import build_profile, build_routine_clusters
from location_resolver import resolve_location
from area_fusion import fuse_area_zone
from ml.engine import score_tracking
from ml.baseline import reset_baseline
from ml.model_store import health_info as ml_health_info

app = FastAPI(title="Tracking Python API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResolveBody(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    client_ip: Optional[str] = None
    hint_region: Optional[str] = None
    trust_browser_gps: bool = False


class AnalyticsBody(BaseModel):
    history: List[Dict[str, Any]] = []
    speed_limit_kmh: Optional[float] = None


class BriefingBody(BaseModel):
    case_id: Optional[str] = None
    title: Optional[str] = None
    history: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []
    deviation: Dict[str, Any] = {}
    route: Optional[Dict[str, Any]] = None


class GeofenceBody(BaseModel):
    point: Dict[str, float]
    polygons: List[Dict[str, Any]]


class IntelBody(BaseModel):
    history: List[Dict[str, Any]] = []


class AreaFuseBody(BaseModel):
    zone_id: Optional[str] = None
    zone_name: Optional[str] = None
    polygon: List[Dict[str, float]] = []
    subjects: List[Dict[str, Any]] = []
    traffic_segments: List[Dict[str, Any]] = []
    foot_points: List[Dict[str, Any]] = []
    external_devices: List[Dict[str, Any]] = []
    providers: Dict[str, Any] = {}


class MlScoreBody(BaseModel):
    device_id: Optional[str] = None
    case_id: Optional[str] = None
    history: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    context: Dict[str, Any] = {}


class MlBaselineResetBody(BaseModel):
    device_id: str


@app.get("/health")
@app.get("/")
def health():
    return {"status": "ok", "service": "tracking-python-api"}


@app.post("/resolve")
def post_resolve(body: ResolveBody):
    return resolve_location(
        latitude=body.latitude,
        longitude=body.longitude,
        accuracy=body.accuracy,
        client_ip=body.client_ip,
        hint_region=body.hint_region,
        trust_browser_gps=body.trust_browser_gps,
    )


@app.post("/analytics/batch")
def post_analytics_batch(body: AnalyticsBody):
    result = build_score(body.history)
    if body.speed_limit_kmh:
        for a in result.get("anomalies", []):
            if a.get("type") == "speed" and a.get("value", 0) > body.speed_limit_kmh:
                a["severity"] = "high"
    return result


@app.post("/briefing/generate")
def post_briefing(body: BriefingBody):
    return generate_briefing(body.model_dump())


@app.post("/geofence/batch-check")
def post_geofence(body: GeofenceBody):
    return {"results": batch_check(body.point, body.polygons)}


@app.post("/intel/profile")
def post_intel_profile(body: IntelBody):
    return build_profile(body.history)


@app.post("/intel/routine-zones")
def post_routine_zones(body: IntelBody):
    return build_routine_clusters(body.history)


@app.post("/area/fuse")
def post_area_fuse(body: AreaFuseBody):
    return fuse_area_zone(body.model_dump())


@app.post("/area/briefing")
def post_area_briefing(body: AreaFuseBody):
    from area_fusion import generate_zone_briefing

    return {
        "briefing": generate_zone_briefing(
            body.zone_name or body.zone_id,
            body.subjects,
            body.traffic_segments,
            body.foot_points,
            body.external_devices,
            body.providers,
        )
    }


@app.post("/ml/score")
def post_ml_score(body: MlScoreBody):
    return score_tracking(body.model_dump())


@app.get("/ml/health")
def get_ml_health():
    return {"status": "ok", **ml_health_info()}


@app.post("/ml/baseline/reset")
def post_ml_baseline_reset(body: MlBaselineResetBody):
    reset_baseline(body.device_id)
    return {"ok": True, "device_id": body.device_id}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "5001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
