"""Zona üzrə real mənbələri birləşdirir: subyekt, trafik, foot-traffic."""

from __future__ import annotations

from typing import Any, Dict, List


def _point_in_polygon(lat: float, lon: float, polygon: List[Dict[str, float]]) -> bool:
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi = polygon[i].get("lon", polygon[i].get("lng", 0))
        xi = polygon[i].get("lat", 0)
        yj = polygon[j].get("lon", polygon[j].get("lng", 0))
        xj = polygon[j].get("lat", 0)
        if ((yi > lon) != (yj > lon)) and (
            lat < (xj - xi) * (lon - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _filter_in_polygon(items: List[Dict[str, Any]], polygon: List[Dict[str, float]]) -> List[Dict[str, Any]]:
    out = []
    for it in items:
        lat = it.get("lat")
        lon = it.get("lon")
        if lat is None or lon is None:
            continue
        if _point_in_polygon(float(lat), float(lon), polygon):
            out.append(it)
    return out


def _segment_in_zone(segment: Dict[str, Any], polygon: List[Dict[str, float]]) -> bool:
    coords = segment.get("coordinates") or []
    for c in coords:
        if len(c) >= 2 and _point_in_polygon(float(c[0]), float(c[1]), polygon):
            return True
    return False


def fuse_area_zone(payload: Dict[str, Any]) -> Dict[str, Any]:
    polygon = payload.get("polygon") or []
    subjects = payload.get("subjects") or []
    traffic = payload.get("traffic_segments") or []
    foot = payload.get("foot_points") or []
    external = payload.get("external_devices") or []

    traffic_in = [s for s in traffic if _segment_in_zone(s, polygon)]
    foot_in = _filter_in_polygon(foot, polygon)
    ext_in = _filter_in_polygon(external, polygon)

    entities = list(subjects) + list(ext_in) + list(foot_in)
    for seg in traffic_in[:40]:
        coords = seg.get("coordinates") or []
        if coords:
            mid = coords[len(coords) // 2]
            entities.append(
                {
                    "id": seg.get("id"),
                    "lat": mid[0],
                    "lon": mid[1],
                    "source": "traffic",
                    "kind": "traffic",
                    "label": seg.get("label", "Trafik"),
                    "jam_factor": seg.get("jam_factor"),
                }
            )

    briefing = generate_zone_briefing(
        payload.get("zone_name") or payload.get("zone_id"),
        subjects,
        traffic_in,
        foot_in,
        ext_in,
        payload.get("providers") or {},
    )

    return {
        **payload,
        "subjects": subjects,
        "traffic_segments": traffic_in,
        "foot_points": foot_in,
        "external_devices": ext_in,
        "entities": entities,
        "briefing": briefing,
    }


def generate_zone_briefing(
    zone_name: str,
    subjects: List[Dict],
    traffic: List[Dict],
    foot: List[Dict],
    external: List[Dict],
    providers: Dict[str, Any],
) -> Dict[str, Any]:
    name = zone_name or "Zona"
    n_subj = len(subjects)
    n_tr = len(traffic)
    n_ft = len(foot)
    n_ext = len(external)

    parts = [
        f"«{name}» izləmə zonası üzrə real məlumat xülasəsi.",
        f"Subyekt (GPS, icazəli): {n_subj} aktiv.",
    ]

    tr_cfg = (providers.get("traffic") or {}).get("configured")
    ft_cfg = (providers.get("foot_traffic") or {}).get("configured")
    if tr_cfg:
        parts.append(f"Trafik API segmentləri zonada: {n_tr}.")
    else:
        parts.append("Trafik API konfiqurasiya edilməyib (TRAFFIC_API_KEY).")
    if ft_cfg:
        parts.append(f"Foot-traffic (anonim kütlə) nöqtələri: {n_ft}.")
    else:
        parts.append("Foot-traffic API konfiqurasiya edilməyib (FOOT_TRAFFIC_API_KEY).")
    if n_ext:
        parts.append(f"Xarici/partnyor məlumat: {n_ext} obyekt.")

    parts.append(
        "Qeyd: Trafik və foot-traffic fərdi telefon izləməsi deyil; yalnız subyekt GPS real şəxs bağlantısıdır."
    )

    bullets = [
        f"Subyekt: {n_subj}",
        f"Trafik segment: {n_tr}",
        f"Foot-traffic: {n_ft}",
        f"Xarici: {n_ext}",
    ]

    return {"text": " ".join(parts), "bullets": bullets}
