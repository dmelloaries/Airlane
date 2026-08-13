"""
NOAA Aviation Weather METAR Client.

Fetches current surface wind speed, direction, and gust metrics for the nearest METAR station
to evaluate small-drone aerodynamic constraints.
"""

import math
import requests
from typing import Dict, Any, List
from db import get_cached_response, set_cached_response

NOAA_API_BASE = "https://aviationweather.gov/api/data/metar"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon points."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _parse_wind_direction(dir_val: Any) -> int:
    """Safely parse wind direction, defaulting to 0 for variable ('VRB') or missing values."""
    if dir_val is None or str(dir_val).strip().upper() == "VRB":
        return 0
    try:
        return int(float(dir_val))
    except (ValueError, TypeError):
        return 0


def _parse_wind_speed(spd_val: Any, default: float = 8.0) -> float:
    """Safely parse wind speed in knots."""
    if spd_val is None:
        return default
    try:
        return float(spd_val)
    except (ValueError, TypeError):
        return default


def fetch_wind(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch wind reading at nearest METAR aviation weather station to (lat, lng).
    
    Returns dict:
      - wind_speed_kt: float (wind speed in knots)
      - wind_direction_deg: int (wind direction in degrees, 0-360)
      - wind_gust_kt: float or None (wind gust speed in knots)
      - station_id: str (ICAO station code, e.g. 'KAUS')
      - station_name: str (descriptive station name)
      - distance_to_station_km: float (distance from queried point to station)
      - raw_observation: str (raw METAR string if available)
      - source: str (source citation)
      - status: "OK" or "FAILED"
    """
    cache_key = f"noaa_wind_{round(lat, 2)}_{round(lng, 2)}"
    cached = get_cached_response(cache_key)
    if cached and cached.get("status") == "OK":
        return cached

    params = {
        "bbox": f"{lat-0.5},{lng-0.5},{lat+0.5},{lng+0.5}",
        "format": "json"
    }

    try:
        resp = requests.get(NOAA_API_BASE, params=params, timeout=10)
        if resp.status_code != 200:
            return {
                "status": "FAILED",
                "error": f"NOAA METAR API returned HTTP status {resp.status_code}: {resp.text[:200]}"
            }

        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            # Find station closest to the requested coordinate
            best_station = None
            min_dist = float("inf")

            for st in data:
                st_lat = st.get("lat")
                st_lon = st.get("lon")
                if st_lat is not None and st_lon is not None:
                    dist = _haversine_km(lat, lng, float(st_lat), float(st_lon))
                    if dist < min_dist:
                        min_dist = dist
                        best_station = st

            if best_station is None:
                best_station = data[0]
                min_dist = 0.0

            wind_spd = _parse_wind_speed(best_station.get("wspd"), 8.0)
            wind_dir = _parse_wind_direction(best_station.get("wdir"))
            gust_raw = best_station.get("wgst")
            wind_gust = float(gust_raw) if gust_raw is not None else None

            station_id = best_station.get("icaoId") or best_station.get("name", "KAUS")
            station_name = best_station.get("name", f"METAR Station {station_id}")
            raw_ob = best_station.get("rawOb", "")

            result = {
                "wind_speed_kt": wind_spd,
                "wind_direction_deg": wind_dir,
                "wind_gust_kt": wind_gust,
                "station_id": station_id,
                "station_name": station_name,
                "distance_to_station_km": round(min_dist, 2),
                "raw_observation": raw_ob,
                "source": f"NOAA Aviation Weather METAR ({station_id})",
                "status": "OK"
            }
            set_cached_response(cache_key, "noaa_wind", result)
            return result
        else:
            return {
                "status": "FAILED",
                "error": f"NOAA METAR API returned zero stations for bounding box around ({lat}, {lng})"
            }
    except Exception as e:
        return {
            "status": "FAILED",
            "error": f"NOAA METAR API Request Exception: {str(e)}"
        }

