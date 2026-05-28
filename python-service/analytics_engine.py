import argparse
import json
import math
from typing import List, Dict


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_route_profile(history: List[Dict]) -> Dict:
    if not history:
        return {"short": "No route history yet", "safe": "No route history yet", "efficient": "No route history yet"}

    recent = history[-12:]
    distance = 0.0
    for prev, curr in zip(recent, recent[1:]):
        distance += haversine_meters(prev['lat'], prev['lon'], curr['lat'], curr['lon'])

    avg_speed = sum(item.get('speed', 0) for item in recent) / max(1, len(recent))
    max_speed = max((item.get('speed', 0) for item in recent), default=0)
    sharp_turns = 0
    for prev, curr in zip(recent, recent[1:]):
        if abs((curr.get('heading', 0) or 0) - (prev.get('heading', 0) or 0)) > 35:
            sharp_turns += 1

    return {
        "distance_km": round(distance / 1000, 2),
        "avg_speed_kmh": round(avg_speed * 3.6, 1),
        "max_speed_kmh": round(max_speed * 3.6, 1),
        "sharp_turns": sharp_turns,
        "short": "Choose the shortest corridor and reduce stop frequency." if distance > 500 else "Current route is compact enough for the trip.",
        "safe": "Keep speed below 50 km/h in dense zones and avoid sharp turns." if sharp_turns else "Current route is stable and safe.",
        "efficient": "Maintain a steady speed to improve fuel efficiency." if avg_speed > 8 else "This profile is already efficient."
    }


def detect_anomalies(history: List[Dict]) -> List[Dict]:
    anomalies = []
    recent = history[-30:]
    for i, point in enumerate(recent):
        speed_kmh = point.get('speed', 0) * 3.6
        if speed_kmh > 50:
            anomalies.append({
                "type": "speed",
                "value": round(speed_kmh, 1),
                "lat": point['lat'],
                "lon": point['lon'],
                "severity": "high" if speed_kmh > 80 else "medium",
                "explanation_az": f"Sürət limiti aşılıb: {speed_kmh:.0f} km/saat",
            })
        if (point.get('battery_level', 100) or 100) < 20:
            anomalies.append({
                "type": "battery",
                "value": point.get('battery_level', 100),
                "lat": point['lat'],
                "lon": point['lon'],
                "severity": "medium",
                "explanation_az": "Aşağı batareya",
            })
        acc = point.get('accuracy')
        if acc is not None and acc > 200:
            anomalies.append({
                "type": "accuracy",
                "value": acc,
                "lat": point['lat'],
                "lon": point['lon'],
                "severity": "low",
                "explanation_az": "Zəif GPS dəqiqliyi",
            })
        if i > 0:
            prev = recent[i - 1]
            dist = haversine_meters(prev['lat'], prev['lon'], point['lat'], point['lon'])
            if dist > 5000:
                anomalies.append({
                    "type": "teleport",
                    "value": round(dist / 1000, 1),
                    "lat": point['lat'],
                    "lon": point['lon'],
                    "severity": "high",
                    "explanation_az": "GPS sıçrayışı (teleport) aşkarlandı",
                })
    return anomalies


def generate_heatmap(history: List[Dict]) -> List[Dict]:
    heat = []
    for point in history[-40:]:
        if (point.get('speed', 0) or 0) > 10:
            heat.append({"lat": point['lat'], "lon": point['lon'], "weight": min(5, round((point['speed'] * 3.6) / 10, 0))})
    return heat


def build_score(history: List[Dict]) -> Dict:
    route_profile = compute_route_profile(history)
    anomalies = detect_anomalies(history)
    heatmap = generate_heatmap(history)
    score = 100
    score -= min(30, len(anomalies) * 6)
    score -= min(15, route_profile.get('sharp_turns', 0) * 2)
    score = max(0, score)

    return {
        "score": score,
        "route_profile": route_profile,
        "anomalies": anomalies,
        "heatmap": heatmap,
        "risk_level": 'high' if score < 45 else 'medium' if score < 75 else 'low'
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Fleet analytics scoring')
    parser.add_argument('--history', default='[]', help='JSON history array')
    args = parser.parse_args()

    try:
        history = json.loads(args.history)
    except Exception:
        history = []

    print(json.dumps(build_score(history), ensure_ascii=False))


if __name__ == '__main__':
    main()
