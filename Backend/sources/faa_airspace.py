"""
FAA Airspace Client (UAS Facility Maps & Airspace Ceilings).

Queries the FAA ArcGIS FeatureServer endpoint to determine ceiling (ft AGL)
and airspace class for given flight corridor coordinates.
"""

import requests
from typing import Dict, Any
from db import get_cached_response, set_cached_response

FAA_UAS_FEATURE_SERVER = (
    "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/"
    "FAA_UAS_FacilityMap_Data/FeatureServer/0/query"
)

DISCLAIMER = "Map data for planning only — not real-time FAA flight authorization."


def fetch_ceiling(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch FAA UAS Facility Map ceiling (ft AGL) for a given point.
    """
    cache_key = f"faa_{round(lat, 4)}_{round(lng, 4)}"
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
                ceiling_ft = attributes.get("CEILING", 400)
                grid_id = attributes.get("GRID_ID", "UNCONTROLLED")
                result = {
                    "ceiling_ft": ceiling_ft,
                    "airspace_class": attributes.get("CLASS", "Class G / Uncontrolled"),
                    "grid_id": grid_id,
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "disclaimer": DISCLAIMER,
                    "status": "OK"
                }
            else:
                result = {
                    "ceiling_ft": 400,
                    "airspace_class": "Class G (Uncontrolled)",
                    "grid_id": "NONE",
                    "source": "FAA UAS Facility Map (ArcGIS)",
                    "disclaimer": DISCLAIMER,
                    "status": "OK"
                }
            set_cached_response(cache_key, "faa_airspace", result)
            return result
    except Exception as e:
        print(f"[FAA API Warning] {e} at ({lat}, {lng})")

    return {
        "ceiling_ft": 400,
        "airspace_class": "UNKNOWN",
        "grid_id": "UNKNOWN",
        "source": "FAA UAS Facility Map (ArcGIS)",
        "disclaimer": DISCLAIMER,
        "status": "UNKNOWN"
    }
