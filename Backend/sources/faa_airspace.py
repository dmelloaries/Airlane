"""
FAA Airspace Client (UAS Facility Maps & Airspace Ceilings).

Queries the FAA ArcGIS FeatureServer endpoint per sample point to determine
ceiling (ft AGL), airspace class, and grid ID for flight corridor coordinates.
Preserves official FAA disclaimers and supports parallel batch fetching with disk caching.
"""

import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple
from db import get_cached_response, set_cached_response

FAA_UAS_FEATURE_SERVER = (
    "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/"
    "FAA_UAS_FacilityMap_Data/FeatureServer/0/query"
)

DISCLAIMER = "map not updated in real time, not FAA authorization"


def make_faa_cache_key(lat: float, lng: float) -> str:
    """Round coordinate to 4 decimal places (~11m resolution) for FAA lookup caching."""
    return f"faa_{round(lat, 4)}_{round(lng, 4)}"


def fetch_ceiling(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch FAA UAS Facility Map ceiling (ft AGL) and airspace attributes for a single point.

    Returns dict:
      - ceiling_ft: integer ceiling (e.g. 400, 200, 0)
      - source: "FAA UAS Facility Map (ArcGIS)"
      - note: descriptive summary (e.g. "Class C ceiling 400ft AGL", or "uncontrolled/no restriction")
      - disclaimer: "map not updated in real time, not FAA authorization"
      - airspace_class: class designation (e.g. "Class C", "Class G (Uncontrolled)")
      - grid_id: FAA Grid ID or "UNCONTROLLED"
      - status: "OK" or "UNKNOWN"
    """
    cache_key = make_faa_cache_key(lat, lng)
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    params = {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "f": "json"
    }

    try:
        resp = requests.get(FAA_UAS_FEATURE_SERVER, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            features = data.get("features", [])
            if features:
                attributes = features[0].get("attributes", {})
                ceiling_raw = attributes.get("CEILING")
                try:
                    ceiling_ft = int(ceiling_raw) if ceiling_raw is not None else 400
                except (ValueError, TypeError):
                    ceiling_ft = 400

                airspace_cls = attributes.get("CLASS") or attributes.get("AIRSPACE_CLASS") or "Controlled Airspace"
                grid_id = attributes.get("GRID_ID") or attributes.get("OBJECTID") or "UASFM_GRID"
                airport_name = attributes.get("AIRPORT_NAME") or attributes.get("ARPORT_NAME") or ""

                note_str = f"{airspace_cls} ceiling {ceiling_ft}ft AGL"
                if airport_name:
                    note_str += f" ({airport_name})"

                result = {
                    "ceiling_ft": ceiling_ft,
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "note": note_str,
                    "disclaimer": DISCLAIMER,
                    "airspace_class": airspace_cls,
                    "grid_id": str(grid_id),
                    "status": "OK"
                }
            else:
                # Open / uncontrolled airspace (zero results returned by ArcGIS)
                result = {
                    "ceiling_ft": 400,
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "note": "uncontrolled/no restriction (Class G airspace)",
                    "disclaimer": DISCLAIMER,
                    "airspace_class": "Class G (Uncontrolled)",
                    "grid_id": "UNCONTROLLED",
                    "status": "OK"
                }
            set_cached_response(cache_key, "faa_airspace", result)
            return result
    except Exception as e:
        print(f"[FAA API Warning] {e} at ({lat}, {lng})")

    return {
        "ceiling_ft": 400,
        "source": "FAA UAS Facility Map (ArcGIS)",
        "note": "FAA airspace check unavailable (fallback default)",
        "disclaimer": DISCLAIMER,
        "airspace_class": "UNKNOWN",
        "grid_id": "UNKNOWN",
        "status": "UNKNOWN"
    }


def fetch_batch_ceilings(points: List[Tuple[float, float]], max_workers: int = 10) -> List[Dict[str, Any]]:
    """
    Fetch FAA airspace ceiling metrics for a list of (lat, lng) points in parallel.
    Uses disk caching to avoid redundant requests.
    """
    if not points:
        return []

    results = [None] * len(points)
    missing_tasks = []

    for idx, (lat, lng) in enumerate(points):
        c_key = make_faa_cache_key(lat, lng)
        cached = get_cached_response(c_key)
        if cached:
            results[idx] = cached
        else:
            missing_tasks.append((idx, lat, lng))

    if missing_tasks:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(fetch_ceiling, lat, lng): idx
                for idx, lat, lng in missing_tasks
            }

            for future in as_completed(future_to_task):
                idx = future_to_task[future]
                try:
                    results[idx] = future.result()
                except Exception as exc:
                    results[idx] = {
                        "ceiling_ft": 400,
                        "source": "FAA UAS Facility Map (ArcGIS)",
                        "note": f"Error: {exc}",
                        "disclaimer": DISCLAIMER,
                        "airspace_class": "UNKNOWN",
                        "grid_id": "UNKNOWN",
                        "status": "UNKNOWN"
                    }

    return results

