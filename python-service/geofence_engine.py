from typing import List, Dict, Any


def point_in_polygon(lat: float, lon: float, polygon: List[Dict[str, float]]) -> bool:
    if not polygon or len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi, xi = polygon[i].get("lon", polygon[i].get("lng", 0)), polygon[i].get("lat", 0)
        yj, xj = polygon[j].get("lon", polygon[j].get("lng", 0)), polygon[j].get("lat", 0)
        if ((yi > lon) != (yj > lon)) and (
            lat < (xj - xi) * (lon - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def batch_check(point: Dict[str, float], polygons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    lat, lon = point.get("lat"), point.get("lon")
    results = []
    for poly in polygons:
        pid = poly.get("id", "unknown")
        inside = point_in_polygon(lat, lon, poly.get("polygon", []))
        results.append({"id": pid, "inside": inside, "name": poly.get("name")})
    return results
