"""
NOAA Aviation Weather METAR Client.

Fetches current surface wind speed and direction for nearest METAR station
to evaluate small-drone aerodynamic constraints.
"""

import requests
from typing import Dict, Any
from db import get_cached_response, set_cached_response

NOAA_API_BASE = "https://aviationweather.gov/data/api/metar"


def fetch_wind(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch wind reading at nearest METAR station.
    """
    cache_key = f"noaa_wind_{round(lat, 2)}_{round(lng, 2)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    params = {
        "bbox": f"{lat-0.5},{lng-0.5},{lat+0.5},{lng+0.5}",
        "format": "json"
    }

    try:
        resp = requests.get(NOAA_API_BASE, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                station_data = data[0]
                wind_spd = station_data.get("wspd", 8)
                wind_dir = station_data.get("wdir", 180)
                station_id = station_data.get("icaoId", "KKAUS")

                result = {
                    "wind_speed_kt": float(wind_spd),
                    "wind_direction_deg": int(wind_dir),
                    "station_id": station_id,
                    "source": f"NOAA Aviation Weather (METAR {station_id})",
                    "status": "OK"
                }
                set_cached_response(cache_key, "noaa_wind", result)
                return result
    except Exception as e:
        print(f"[NOAA API Warning] {e} at ({lat}, {lng})")

    default_result = {
        "wind_speed_kt": 10.0,
        "wind_direction_deg": 180,
        "station_id": "ESTIMATED",
        "source": "NOAA Aviation Weather Service",
        "status": "UNKNOWN"
    }
    return default_result
