from __future__ import annotations

from typing import Any, Dict, List


def _distance_km(history: List[Dict]) -> float:
    if len(history) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(history)):
        a, b = history[i - 1], history[i]
        dlat = (b["lat"] - a["lat"]) * 111.32
        dlon = (b["lon"] - a["lon"]) * 111.32 * max(0.3, abs(__import__("math").cos(a["lat"] * 3.14159 / 180)))
        total += (dlat**2 + dlon**2) ** 0.5
    return round(total, 2)


def generate_briefing(payload: Dict[str, Any]) -> Dict[str, Any]:
    title = payload.get("title") or payload.get("case_id") or "Tapşırıq"
    history = payload.get("history") or []
    events = payload.get("events") or []
    deviation = payload.get("deviation") or {}

    distance_km = _distance_km(history)
    max_speed = 0.0
    for p in history:
        max_speed = max(max_speed, (p.get("speed") or 0) * 3.6)

    in_corridor = deviation.get("in_corridor", True)
    dev_score = deviation.get("deviation_score", 0)

    event_types = {}
    for e in events:
        t = e.get("type", "other")
        event_types[t] = event_types.get(t, 0) + 1

    text_parts = [
        f"«{title}» üzrə əməliyyat xülasəsi.",
        f"Toplanmış GPS nöqtələri: {len(history)}. Təxmini məsafə: {distance_km} km.",
        f"Maksimum qeydə alınmış sürət: {max_speed:.1f} km/saat.",
    ]
    if not in_corridor:
        text_parts.append(
            f"Subyekt planlaşdırılmış koridordan kənarda hərəkət edir (sapma skoru: {dev_score}%). Operator diqqət yetirməlidir."
        )
    else:
        text_parts.append("Subyekt hazırda plan koridoru daxilindədir.")

    if event_types:
        summary = ", ".join(f"{k}: {v}" for k, v in list(event_types.items())[:5])
        text_parts.append(f"Hadisələr: {summary}.")

    bullets = [
        f"Nöqtə sayı: {len(history)}",
        f"Məsafə: {distance_km} km",
        f"Max sürət: {max_speed:.1f} km/s",
        f"Koridor: {'daxilində' if in_corridor else 'kənarda'}",
        f"Hadisə sayı: {len(events)}",
    ]

    return {
        "text": " ".join(text_parts),
        "bullets": bullets,
        "metrics": {
            "distance_km": distance_km,
            "max_speed_kmh": round(max_speed, 1),
            "points": len(history),
            "deviation_score": dev_score,
            "in_corridor": in_corridor,
        },
    }
