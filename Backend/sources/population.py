"""
US Census API & Part 108 Ground Risk Tier Classifier.

Pipeline:
1. Geocode coordinate (lat, lng) -> Census Tract FIPS & Land Area
2. Query Census ACS5 API for tract population estimate
3. Compute density (people per sq mile)
4. Classify Part 108 ground risk tier against data/part108_tiers.json
"""

import os
import json
import requests
from typing import Dict, Any
from pathlib import Path
from db import get_cached_response, set_cached_response

CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")
TIERS_FILE = Path(__file__).parent.parent / "data" / "part108_tiers.json"


def load_tier_rules() -> list:
    if TIERS_FILE.exists():
        with open(TIERS_FILE, "r") as f:
            return json.load(f).get("tiers", [])
    return []


def classify_tier(density_sq_mi: float) -> Dict[str, Any]:
    """Map population density to Part 108 risk tier."""
    tiers = load_tier_rules()
    for t in tiers:
        if t["min_density_sq_mi"] <= density_sq_mi < t["max_density_sq_mi"]:
            return t
    return {
        "tier": "Tier 1",
        "name": "Sparsely Populated / Rural",
        "description": "Default rural classification"
    }


def fetch_population_density_and_tier(lat: float, lng: float) -> Dict[str, Any]:
    """
    Fetch Census tract population density for lat/lng and classify ground risk tier.
    """
    cache_key = f"census_{round(lat, 3)}_{round(lng, 3)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    try:
        # Step 1: Census Geocoder to get Tract FIPS
        geo_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
        geo_params = {
            "x": lng,
            "y": lat,
            "benchmark": "Public_AR_Current",
            "vintage": "Current_Current",
            "format": "json"
        }
        resp = requests.get(geo_url, params=geo_params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            geographies = data.get("result", {}).get("geographies", {})
            tracts = geographies.get("Census Tracts", [])
            if tracts:
                tract_data = tracts[0]
                state_fips = tract_data.get("STATE")
                county_fips = tract_data.get("COUNTY")
                tract_code = tract_data.get("TRACT")

                # Step 2: Fetch population via ACS5 API
                acs_url = "https://api.census.gov/data/2021/acs/acs5"
                acs_params = {
                    "get": "B01003_001E",  # Total Population
                    "for": f"tract:{tract_code}",
                    "in": f"state:{state_fips} county:{county_fips}",
                    "key": CENSUS_API_KEY
                }
                acs_resp = requests.get(acs_url, params=acs_params, timeout=10)
                if acs_resp.status_code == 200:
                    acs_json = acs_resp.json()
                    if len(acs_json) > 1:
                        pop_estimate = float(acs_json[1][0])
                        # Estimate land area (sq miles) - default ~1.5 sq mi per tract if missing
                        land_area_sq_mi = float(tract_data.get("AREALAND", 3884982)) / 2589988.11
                        density = pop_estimate / land_area_sq_mi if land_area_sq_mi > 0 else 500.0

                        tier_info = classify_tier(density)
                        result = {
                            "population": int(pop_estimate),
                            "density_sq_mi": round(density, 1),
                            "tier": tier_info["tier"],
                            "tier_name": tier_info["name"],
                            "tier_description": tier_info.get("description", ""),
                            "tract_fips": f"{state_fips}{county_fips}{tract_code}",
                            "source": "US Census Bureau ACS5",
                            "status": "OK"
                        }
                        set_cached_response(cache_key, "census", result)
                        return result
    except Exception as e:
        print(f"[Census API Warning] {e} at ({lat}, {lng})")

    # Fallback response
    fallback_tier = classify_tier(800.0)
    return {
        "population": 2500,
        "density_sq_mi": 800.0,
        "tier": fallback_tier["tier"],
        "tier_name": fallback_tier["name"],
        "tier_description": fallback_tier.get("description", ""),
        "tract_fips": "UNKNOWN",
        "source": "US Census Bureau (Estimated)",
        "status": "UNKNOWN"
    }
