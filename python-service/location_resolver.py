#!/usr/bin/env python3
"""
Brauzerin səhv şəbəkə koordinatlarını (tez-tez Bakı/Absheron) IP + region
yoxlaması ilə düzəldir. Azərbaycan şəhərləri üçün bbox məlumatı.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from functools import lru_cache
from typing import Any, Dict, Optional, Tuple

import requests

# Azərbaycan regionları (lat_min, lon_min, lat_max, lon_max)
REGION_ALIASES = {"baku": "absheron", "baki": "absheron", "gence": "ganja"}

REGIONS: Dict[str, Dict[str, Any]] = {
    "absheron": {
        "bbox": (40.25, 49.55, 40.65, 50.15),
        "center": (40.4093, 49.8671),
        "labels": ("baku", "bakı", "baki", "sumqayit", "sumgayit", "xırdalan", "xirdalan", "absheron"),
    },
    "lankaran": {
        "bbox": (38.65, 48.70, 38.90, 49.05),
        "center": (38.7540, 48.8506),
        "labels": ("lankaran", "lənkəran", "lenkaran", "lerik", "astara", "masallı", "masalli"),
    },
    "ganja": {
        "bbox": (40.55, 46.25, 40.85, 46.60),
        "center": (40.6828, 46.3606),
        "labels": ("ganja", "gəncə", "gence"),
    },
    "shaki": {
        "bbox": (41.55, 47.05, 41.75, 47.30),
        "center": (41.1917, 47.1706),
        "labels": ("shaki", "şəki", "sheki"),
    },
    "quba": {
        "bbox": (41.30, 48.30, 41.50, 48.55),
        "center": (41.3611, 48.5136),
        "labels": ("quba", "guba"),
    },
}

# Brauzer Absheron göstərir, IP başqa region — bu məsafədən çoxdursa IP-yə etibar et
MISMATCH_CORRECT_METERS = 35_000
# Şəbəkə təxmini hesab olunur
NETWORK_ACCURACY_THRESHOLD = 400


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlam / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def in_bbox(lat: float, lon: float, bbox: Tuple[float, float, float, float]) -> bool:
    lat_min, lon_min, lat_max, lon_max = bbox
    return lat_min <= lat <= lat_max and lon_min <= lon <= lon_max


def region_for_coords(lat: float, lon: float) -> str:
    for region_id, meta in REGIONS.items():
        if in_bbox(lat, lon, meta["bbox"]):
            return region_id
    return "unknown"


def normalize_city(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


def city_matches_region(city_name: str, region_id: str) -> bool:
    if not city_name or region_id == "unknown":
        return False
    norm = normalize_city(city_name)
    labels = REGIONS.get(region_id, {}).get("labels", ())
    return any(label in norm or norm in label for label in labels)


@lru_cache(maxsize=512)
def reverse_geocode(lat: float, lon: float) -> Dict[str, str]:
    """Nominatim ilə şəhər adı."""
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "format": "json",
                "zoom": 12,
                "addressdetails": 1,
            },
            timeout=4,
            headers={"User-Agent": "TrackingSystem-Python/1.0"},
        )
        if resp.status_code != 200:
            return {"city": "", "country": ""}
        data = resp.json()
        addr = data.get("address", {})
        city = (
            addr.get("city")
            or addr.get("town")
            or addr.get("village")
            or addr.get("municipality")
            or addr.get("county")
            or addr.get("state")
            or ""
        )
        return {"city": city, "country": addr.get("country", "")}
    except Exception:
        return {"city": "", "country": ""}


def get_public_ip() -> Optional[str]:
    try:
        resp = requests.get("https://api.ipify.org?format=json", timeout=2)
        if resp.status_code == 200:
            return resp.json().get("ip")
    except Exception:
        pass
    return None


def is_private_ip(ip: str) -> bool:
    raw = (ip or "").strip().lower().replace("::ffff:", "")
    if not raw or raw in ("127.0.0.1", "::1", "localhost", "0.0.0.0"):
        return True
    parts = raw.split(".")
    if len(parts) != 4:
        return False
    try:
        a, b = int(parts[0]), int(parts[1])
    except ValueError:
        return False
    if a == 10:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    return False


def get_ip_location(client_ip: Optional[str]) -> Optional[Dict[str, Any]]:
    ip = (client_ip or "").strip()
    if not ip or ip in ("127.0.0.1", "::1", "localhost", "0.0.0.0"):
        ip = get_public_ip()
    elif is_private_ip(ip):
        return None
    if not ip:
        return None

    try:
        resp = requests.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,message,lat,lon,city,regionName,country,query"},
            timeout=4,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if data.get("status") != "success":
            return None
        lat, lon = data.get("lat"), data.get("lon")
        if lat is None or lon is None:
            return None
        return {
            "latitude": float(lat),
            "longitude": float(lon),
            "city": data.get("city") or data.get("regionName") or "",
            "country": data.get("country") or "",
            "region": region_for_coords(float(lat), float(lon)),
            "source": "ip-api",
            "ip": data.get("query", ip),
        }
    except Exception:
        return None


def resolve_location(
    latitude: float,
    longitude: float,
    accuracy: Optional[float] = None,
    client_ip: Optional[str] = None,
    hint_region: Optional[str] = None,
    trust_browser_gps: bool = False,
) -> Dict[str, Any]:
    """
    Brauzer koordinatlarını yoxlayır; Absheron/Bakı təxmini ilə IP regionu
    uyğun gəlmirsə, Python IP + region mərkəzini tətbiq edir.
    trust_browser_gps=True: subyekt GPS-i saxlanır, şəhər yalnız koordinatdan (IP ayrıca).
    """
    browser_lat, browser_lon = float(latitude), float(longitude)
    browser_region = region_for_coords(browser_lat, browser_lon)
    geo_browser = reverse_geocode(browser_lat, browser_lon)
    browser_city = geo_browser.get("city", "")

    ip_loc = get_ip_location(client_ip)
    ip_region = ip_loc["region"] if ip_loc else "unknown"
    ip_city = ip_loc.get("city", "") if ip_loc else ""

    if trust_browser_gps:
        return {
            "latitude": browser_lat,
            "longitude": browser_lon,
            "accuracy": accuracy,
            "city": browser_city,
            "country": geo_browser.get("country") or (ip_loc or {}).get("country", ""),
            "region": browser_region,
            "corrected": False,
            "source": "browser_gps",
            "reason": "trust_browser_gps",
            "browser_latitude": browser_lat,
            "browser_longitude": browser_lon,
            "browser_region": browser_region,
            "browser_city": browser_city,
            "ip_region": ip_region,
            "ip_city": ip_city,
            "distance_browser_ip_m": round(
                haversine_meters(browser_lat, browser_lon, ip_loc["latitude"], ip_loc["longitude"])
                if ip_loc
                else 0
            ),
            "location_quality": "gps"
            if (accuracy or 9999) <= 100
            else "approximate"
            if (accuracy or 9999) <= 500
            else "network",
        }

    out_lat, out_lon = browser_lat, browser_lon
    corrected = False
    source = "browser_gps"
    reason = "accepted"
    out_accuracy = accuracy

    hint = (hint_region or "").strip().lower()
    hint = REGION_ALIASES.get(hint, hint)
    if hint and hint in REGIONS:
        hint_meta = REGIONS[hint]
        hint_center = hint_meta["center"]
        dist_to_hint = haversine_meters(browser_lat, browser_lon, hint_center[0], hint_center[1])

        in_hint_bbox = in_bbox(browser_lat, browser_lon, hint_meta["bbox"])

        if not in_hint_bbox and (
            browser_region == "absheron"
            or (browser_region != hint and dist_to_hint >= 15_000)
        ):
            if ip_loc and ip_region == hint:
                out_lat = ip_loc["latitude"]
                out_lon = ip_loc["longitude"]
            else:
                out_lat, out_lon = hint_center[0], hint_center[1]
            corrected = True
            source = "python_hint_region"
            reason = f"user_hint_{hint}"
            out_accuracy = max(accuracy or 600, 600)

    suspicious_absheron = browser_region == "absheron"
    ip_differs = ip_loc and ip_region != "unknown" and ip_region != browser_region
    low_trust = accuracy is None or accuracy > NETWORK_ACCURACY_THRESHOLD

    if ip_loc:
        dist_browser_ip = haversine_meters(
            browser_lat, browser_lon, ip_loc["latitude"], ip_loc["longitude"]
        )
    else:
        dist_browser_ip = 0

    # 1) Əsas düzəliş: Bakı/Absheron göstərilir, IP isə Lənkəran (və s.)
    if not corrected and suspicious_absheron and ip_differs and dist_browser_ip >= MISMATCH_CORRECT_METERS:
        out_lat = ip_loc["latitude"]
        out_lon = ip_loc["longitude"]
        corrected = True
        source = "python_ip_region"
        reason = f"browser_absheron_vs_ip_{ip_region}"
        out_accuracy = max(accuracy or 800, 800)

    # 2) Şəbəkə təxmini + IP başqa regionda
    elif not corrected and suspicious_absheron and low_trust and ip_differs and dist_browser_ip >= 15_000:
        out_lat = ip_loc["latitude"]
        out_lon = ip_loc["longitude"]
        corrected = True
        source = "python_ip_low_accuracy"
        reason = "network_estimate_overridden"
        out_accuracy = 900

    # 3) Şəhər adı uyğun gəlmir (məs. koordinat Bakı, IP şəhəri Lankaran)
    elif not corrected and (
        suspicious_absheron
        and ip_loc
        and ip_city
        and not city_matches_region(browser_city, "absheron")
        and city_matches_region(ip_city, ip_region)
        and dist_browser_ip >= 20_000
    ):
        out_lat = ip_loc["latitude"]
        out_lon = ip_loc["longitude"]
        corrected = True
        source = "python_city_mismatch"
        reason = "reverse_geocode_vs_ip_city"
        out_accuracy = max(accuracy or 700, 700)

    final_region = region_for_coords(out_lat, out_lon)
    final_geo = reverse_geocode(out_lat, out_lon) if corrected else geo_browser
    final_city = final_geo.get("city") or (ip_city if corrected else browser_city)

    return {
        "latitude": out_lat,
        "longitude": out_lon,
        "accuracy": out_accuracy,
        "city": final_city,
        "country": final_geo.get("country") or (ip_loc or {}).get("country", ""),
        "region": final_region,
        "corrected": corrected,
        "source": source,
        "reason": reason,
        "browser_latitude": browser_lat,
        "browser_longitude": browser_lon,
        "browser_region": browser_region,
        "browser_city": browser_city,
        "ip_region": ip_region,
        "ip_city": ip_city,
        "distance_browser_ip_m": round(dist_browser_ip),
        "location_quality": "gps" if (out_accuracy or 9999) <= 100 else "corrected" if corrected else "approximate",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="GPS koordinat düzəldici")
    parser.add_argument("--payload", default="{}", help="JSON: lat, lon, accuracy, client_ip")
    args = parser.parse_args()
    try:
        payload = json.loads(args.payload)
    except json.JSONDecodeError:
        payload = {}

    result = resolve_location(
        latitude=payload.get("latitude", 0),
        longitude=payload.get("longitude", 0),
        accuracy=payload.get("accuracy"),
        client_ip=payload.get("client_ip"),
        hint_region=payload.get("hint_region"),
        trust_browser_gps=bool(payload.get("trust_browser_gps")),
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
