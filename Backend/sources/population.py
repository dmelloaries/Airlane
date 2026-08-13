"""
US Census API & Part 108 Ground Risk Tier Classifier.

Pipeline:
1. Geocode coordinate (lat, lng) -> Census Tract FIPS & Land Area (AREALAND)
2. Query Census ACS5 API (B01003_001E) for tract total population estimate
3. Compute exact density (people per sq mile = population / land_area_sq_mi)
4. Classify Part 108 ground risk tier against data/part108_tiers.json
"""

import os
import json
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple
from pathlib import Path
from db import get_cached_response, set_cached_response, get_cached_grid_batch, set_cached_grid_batch

CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")
TIERS_FILE = Path(__file__).parent.parent / "data" / "part108_tiers.json"


def load_tier_rules() -> list:
    """Load Part 108 ground risk tier thresholds from part108_tiers.json."""
    if TIERS_FILE.exists():
        with open(TIERS_FILE, "r") as f:
            return json.load(f).get("tiers", [])
    return []


def classify_tier(density_sq_mi: float) -> Dict[str, Any]:
    """Map population density (people/sq mi) to Part 108 risk tier."""
    tiers = load_tier_rules()
    for t in tiers:
        if t["min_density_sq_mi"] <= density_sq_mi < t["max_density_sq_mi"]:
            return t
    return {
        "tier": "Tier 1",
        "name": "Sparsely Populated / Rural",
        "description": "Default rural classification"
    }


# In-memory tract population cache to avoid redundant ACS5 API calls for points in the same tract
_TRACT_POP_CACHE: Dict[str, float] = {}


def geocode_census_tract(lat: float, lng: float, point_info: str = "") -> Dict[str, Any]:
    """
    Step 1: Standalone Census Geocoder lookup.
    Queries geocoding.geo.census.gov with (lng, lat) coordinates to extract Census Tract FIPS & Land Area.
    """
    cache_key = f"census_geo_{round(lat, 4)}_{round(lng, 4)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    prefix = f"{point_info}: " if point_info else ""
    print(f"  [Census Geocode] {prefix}Geocoding ({lat:.4f}, {lng:.4f})...", flush=True)

    geo_url = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
    geo_params = {
        "x": lng,
        "y": lat,
        "benchmark": "Public_AR_Current",
        "vintage": "Current_Current",
        "format": "json"
    }

    try:
        resp = requests.get(geo_url, params=geo_params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            geographies = data.get("result", {}).get("geographies", {})
            tracts = geographies.get("Census Tracts", [])
            if tracts:
                tract_data = tracts[0]
                state_fips = tract_data.get("STATE", "")
                county_fips = tract_data.get("COUNTY", "")
                tract_code = tract_data.get("TRACT", "")
                geoid = tract_data.get("GEOID", f"{state_fips}{county_fips}{tract_code}")
                arealand_sq_m = float(tract_data.get("AREALAND", 3884982))
                land_area_sq_mi = round(arealand_sq_m / 2589988.11, 4)

                result = {
                    "state_fips": state_fips,
                    "county_fips": county_fips,
                    "tract_code": tract_code,
                    "tract_fips": geoid,
                    "arealand_sq_m": arealand_sq_m,
                    "land_area_sq_mi": land_area_sq_mi,
                    "source": "US Census Geocoder API",
                    "status": "OK"
                }
                set_cached_response(cache_key, "census_geo", result)
                return result
        else:
            print(f"  [Census Warning] HTTP {resp.status_code} geocoding ({lat:.4f}, {lng:.4f})", flush=True)
    except requests.exceptions.Timeout:
        print(f"  [Census Timeout] Timed out (10s) geocoding ({lat:.4f}, {lng:.4f})", flush=True)
    except Exception as e:
        print(f"  [Census Geocoder Warning] {e} at ({lat:.4f}, {lng:.4f})", flush=True)

    return {
        "state_fips": "",
        "county_fips": "",
        "tract_code": "",
        "tract_fips": "UNKNOWN",
        "arealand_sq_m": 0,
        "land_area_sq_mi": 1.5,
        "source": "US Census Geocoder API",
        "status": "UNKNOWN"
    }


def fetch_population_density_and_tier(lat: float, lng: float, idx: int = 0, total: int = 0) -> Dict[str, Any]:
    """
    Full Phase 4 Pipeline:
    1. Geocode lat/lng coordinate -> Census Tract & Land Area
    2. Query Census ACS5 API for tract population estimate (B01003_001E)
    3. Compute exact population density (people / sq mile)
    4. Map density to Part 108 Tier
    """
    cache_key = f"census_full_{round(lat, 4)}_{round(lng, 4)}"
    cached = get_cached_response(cache_key)
    if cached:
        return cached

    point_info = f"Point {idx+1}/{total}" if total > 0 else f"Point {idx+1}"

    # Step 1: Census Geocoder
    geo = geocode_census_tract(lat, lng, point_info=point_info)
    if geo["status"] != "OK" or not geo["tract_code"]:
        fallback_tier = classify_tier(250.0)
        return {
            "population": 500,
            "density_sq_mi": 250.0,
            "tier": fallback_tier["tier"],
            "tier_name": fallback_tier["name"],
            "tier_description": fallback_tier.get("description", ""),
            "tract_fips": "UNKNOWN",
            "source": "US Census Bureau (Fallback)",
            "status": "UNKNOWN"
        }

    # Step 2: Query Census ACS5 API (or check in-memory tract cache)
    state_fips = geo["state_fips"]
    county_fips = geo["county_fips"]
    tract_code = geo["tract_code"]
    tract_fips = geo["tract_fips"]
    land_area_sq_mi = geo["land_area_sq_mi"]

    # Check in-memory tract population cache
    if tract_fips in _TRACT_POP_CACHE:
        print(f"  [Census ACS5] Tract {tract_fips} already cached, skipping API call", flush=True)
        pop_estimate = _TRACT_POP_CACHE[tract_fips]
        density = pop_estimate / land_area_sq_mi if land_area_sq_mi > 0 else 500.0
        tier_info = classify_tier(density)
        result = {
            "population": int(pop_estimate),
            "density_sq_mi": round(density, 1),
            "land_area_sq_mi": land_area_sq_mi,
            "tier": tier_info["tier"],
            "tier_name": tier_info["name"],
            "tier_description": tier_info.get("description", ""),
            "tract_fips": tract_fips,
            "source": "US Census Bureau ACS5 (Cached Tract)",
            "status": "OK"
        }
        set_cached_response(cache_key, "census_full", result)
        return result

    print(f"  [Census ACS5] {point_info}: querying ACS5 for tract {tract_fips}...", flush=True)

    acs_url = "https://api.census.gov/data/2021/acs/acs5"
    acs_params = {
        "get": "B01003_001E",
        "for": f"tract:{tract_code}",
        "in": f"state:{state_fips} county:{county_fips}"
    }
    if CENSUS_API_KEY:
        acs_params["key"] = CENSUS_API_KEY

    try:
        resp = requests.get(acs_url, params=acs_params, timeout=10)
        if resp.status_code == 200:
            acs_json = resp.json()
            if len(acs_json) > 1:
                pop_estimate = float(acs_json[1][0])

                # Memoize tract population
                _TRACT_POP_CACHE[tract_fips] = pop_estimate

                density = pop_estimate / land_area_sq_mi if land_area_sq_mi > 0 else 500.0
                tier_info = classify_tier(density)

                result = {
                    "population": int(pop_estimate),
                    "density_sq_mi": round(density, 1),
                    "land_area_sq_mi": land_area_sq_mi,
                    "tier": tier_info["tier"],
                    "tier_name": tier_info["name"],
                    "tier_description": tier_info.get("description", ""),
                    "tract_fips": tract_fips,
                    "source": "US Census Bureau ACS5 (2021)",
                    "status": "OK"
                }
                set_cached_response(cache_key, "census_full", result)
                return result
        else:
            print(f"  [Census Warning] HTTP {resp.status_code} querying ACS5 for tract {tract_fips}", flush=True)
    except requests.exceptions.Timeout:
        print(f"  [Census Timeout] Timed out (10s) querying ACS5 for tract {tract_fips}", flush=True)
    except Exception as e:
        print(f"  [Census ACS5 Warning] {e} at ({lat:.4f}, {lng:.4f})", flush=True)

    fallback_tier = classify_tier(350.0)
    return {
        "population": 700,
        "density_sq_mi": 350.0,
        "tier": fallback_tier["tier"],
        "tier_name": fallback_tier["name"],
        "tier_description": fallback_tier.get("description", ""),
        "tract_fips": geo["tract_fips"],
        "source": "US Census Bureau (Estimated)",
        "status": "UNKNOWN"
    }


def fetch_batch_population_density(points: List[Tuple[float, float]], max_workers: int = 10) -> List[Dict[str, Any]]:
    """
    Fetch population density and Part 108 tiers for a list of (lat, lng) points in parallel.
    Uses generalized batch cache retrieval to avoid 40 sequential DB lookups.
    """
    if not points:
        return []

    results = [None] * len(points)
    keys = [f"census_full_{round(lat, 4)}_{round(lng, 4)}" for lat, lng in points]
    cached_map = get_cached_grid_batch(keys)

    missing_tasks = []
    for idx, (lat, lng) in enumerate(points):
        c_key = keys[idx]
        if c_key in cached_map:
            results[idx] = cached_map[c_key]
        else:
            missing_tasks.append((idx, lat, lng))

    if missing_tasks:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_task = {
                executor.submit(fetch_population_density_and_tier, lat, lng, idx, len(points)): idx
                for idx, lat, lng in missing_tasks
            }

            for future in as_completed(future_to_task):
                idx = future_to_task[future]
                try:
                    results[idx] = future.result()
                except Exception as exc:
                    results[idx] = {
                        "population": 0,
                        "density_sq_mi": 0.0,
                        "tier": "Tier 1",
                        "tier_name": "Rural",
                        "tier_description": f"Error: {exc}",
                        "tract_fips": "UNKNOWN",
                        "source": "US Census Bureau",
                        "status": "UNKNOWN"
                    }

    return results
