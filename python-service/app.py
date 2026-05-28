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
from intel_engine import build_profile
from location_resolver import resolve_location

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


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "5001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
