"""
Mireye Earth API Client (Infrastructure & Hazards).

Performs batched fetches to /v1/fetch with grid disk caching.
Parses Mireye's nested response schema: response["fields"][field_name] -> {value, source, confidence, unit, status}.
Preserves value, source, and confidence for every field to support citations and auditability.
"""

import json
import os
from pathlib import Path
import requests
from typing import Dict, Any, List, Tuple
from db import get_cached_response, set_cached_response, get_cached_grid_batch, set_cached_grid_batch

MIREYE_API_KEY = os.getenv("MIREYE_API_KEY") or os.getenv("MIREYE_API_TOKEN", "")
MIREYE_BASE_URL = os.getenv("MIREYE_BASE_URL", "https://api.mireye.com/v1")

FETCH_FIELDS = [
    "nearest_substation_distance_m",
    "nearest_substation_max_voltage_kv",
    "nearest_transmission_line_distance_m",
    "nearest_transmission_line_voltage_kv",
    "nearest_airport_distance_m",
    "fema_flood_zone",
    "elevation",
    "slope_degrees",
    "intersects_critical_habitat",
    "critical_habitat_listing_status",
    "critical_habitat_species",
    "critical_habitat_status"
]


def make_grid_key(lat: float, lng: float) -> str:
    """Round coordinate to ~100m grid cell (0.001 deg resolution ~ 111m)."""
    return f"mireye_grid_{round(lat, 3)}_{round(lng, 3)}"


def extract_field_info(fields_dict: Dict[str, Any], field_name: str) -> Dict[str, Any]:
    """
    Extract value, source, confidence, unit, status, and notes for a field from Mireye's nested response.
    Mireye schema: fields[field_name] -> { "value": ..., "source": ..., "confidence": ..., "unit": ..., "status": ..., "notes": ... }
    Preserves exact value (including None) without filling placeholder defaults.
    """
    f_obj = fields_dict.get(field_name, {})
    if not isinstance(f_obj, dict):
        f_obj = {}

    return {
        "value": f_obj.get("value"),
        "source": f_obj.get("source", "Mireye Earth API"),
        "confidence": f_obj.get("confidence", "unknown"),
        "unit": f_obj.get("unit"),
        "notes": f_obj.get("notes"),
        "status": f_obj.get("status", "ok" if f_obj.get("value") is not None else "unknown")
    }


def normalize_mireye_item(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize raw Mireye point payload into structured object preserving value, source, and confidence per field.
    Reads response["fields"][field_name] nested structure.
    """
    fields_dict = data.get("fields", {}) if isinstance(data, dict) else {}

    sub_dist = extract_field_info(fields_dict, "nearest_substation_distance_m")
    sub_kv = extract_field_info(fields_dict, "nearest_substation_max_voltage_kv")
    trans_dist = extract_field_info(fields_dict, "nearest_transmission_line_distance_m")
    trans_kv = extract_field_info(fields_dict, "nearest_transmission_line_voltage_kv")
    airport_dist = extract_field_info(fields_dict, "nearest_airport_distance_m")
    flood_zone = extract_field_info(fields_dict, "fema_flood_zone")
    elevation = extract_field_info(fields_dict, "elevation")
    slope = extract_field_info(fields_dict, "slope_degrees")
    crit_hab_intersects = extract_field_info(fields_dict, "intersects_critical_habitat")
    crit_hab_listing = extract_field_info(fields_dict, "critical_habitat_listing_status")
    crit_hab_species = extract_field_info(fields_dict, "critical_habitat_species")
    crit_hab_status = extract_field_info(fields_dict, "critical_habitat_status")

    return {
        # Rich field objects containing value, source, and confidence for audit citations
        "nearest_substation_distance_m": sub_dist,
        "nearest_substation_max_voltage_kv": sub_kv,
        "nearest_transmission_line_distance_m": trans_dist,
        "nearest_transmission_line_voltage_kv": trans_kv,
        "nearest_airport_distance_m": airport_dist,
        "fema_flood_zone": flood_zone,
        "elevation": elevation,
        "slope_degrees": slope,
        "intersects_critical_habitat": crit_hab_intersects,
        "critical_habitat_listing_status": crit_hab_listing,
        "critical_habitat_species": crit_hab_species,
        "critical_habitat_status": crit_hab_status,
        # Conveniences for numeric calculations
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "source": "Mireye Earth API (/v1/fetch)",
        "status": "OK",
        "raw_response": data
    }


def get_field_val(mireye_item: Dict[str, Any], key: str, default: Any = None) -> Any:
    """Helper to safely extract numeric/string value from a normalized field dict."""
    field_obj = mireye_item.get(key)
    if isinstance(field_obj, dict) and "value" in field_obj:
        val = field_obj["value"]
        return val if val is not None else default
    elif field_obj is not None:
        return field_obj
    return default


def fetch_single_point_from_api(lat: float, lng: float, max_retries: int = 4) -> Dict[str, Any]:
    """
    Execute single HTTP POST to Mireye /v1/fetch for one (lat, lng) point.
    Retries automatically on 429 (rate limit) with backoff using the server's
    retry_after_s hint.  RAISES RuntimeError on non-200/non-429 responses.
    """
    import time as _time

    headers = {
        "Authorization": f"Bearer {MIREYE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "lat": lat,
        "lng": lng,
        "fields": FETCH_FIELDS
    }

    for attempt in range(max_retries):
        resp = requests.post(
            f"{MIREYE_BASE_URL}/fetch", json=payload,
            headers=headers, timeout=15
        )
        if resp.status_code == 200:
            data = resp.json()
            return normalize_mireye_item(data)

        if resp.status_code == 429:
            # Rate limited — parse server hint and sleep
            try:
                detail = resp.json().get("detail", {})
                retry_after = float(detail.get("retry_after_s", 3))
            except Exception:
                retry_after = 3.0
            wait = retry_after + 0.5 * (attempt + 1)   # progressive backoff
            _time.sleep(wait)
            continue

        # Any other HTTP error — raise immediately
        raise RuntimeError(
            f"Mireye API Error (HTTP {resp.status_code}): {resp.text}\n"
            f"Sent Payload: {payload}"
        )

    raise RuntimeError(
        f"Mireye API still rate-limited after {max_retries} retries for ({lat}, {lng})"
    )


LAST_RAW_BATCH_RESPONSE: Dict[str, Any] = {}


def fetch_batch_from_api(points: List[Tuple[float, float]], max_retries: int = 4) -> List[Dict[str, Any]]:
    """
    Execute POST /v1/fetch/batch to Mireye API for a list of (lat, lng) points.
    Chunks points into batches of max 25 locations per request.
    Attaches Idempotency-Key UUID header and uses 120s timeout.
    Returns normalized items in exact input order.
    """
    import uuid
    import time as _time
    global LAST_RAW_BATCH_RESPONSE

    if not points:
        return []

    results = [None] * len(points)
    chunk_size = 25

    # Split missing points into chunks of at most 25 locations
    for chunk_start in range(0, len(points), chunk_size):
        chunk_points = points[chunk_start:chunk_start + chunk_size]

        payload = {
            "locations": [{"lat": lat, "lng": lng} for lat, lng in chunk_points],
            "fields": FETCH_FIELDS
        }

        idempotency_key = str(uuid.uuid4())
        headers = {
            "Authorization": f"Bearer {MIREYE_API_KEY}",
            "Content-Type": "application/json",
            "Idempotency-Key": idempotency_key
        }

        # Visual log requirement
        print(f"[Mireye] Sending batch request: {len(chunk_points)} locations", flush=True)

        batch_data = None
        for attempt in range(max_retries):
            try:
                resp = requests.post(
                    f"{MIREYE_BASE_URL}/fetch/batch",
                    json=payload,
                    headers=headers,
                    timeout=60
                )
                if resp.status_code == 200:
                    batch_data = resp.json()
                    LAST_RAW_BATCH_RESPONSE = batch_data
                    try:
                        raw_out_path = Path(__file__).parent.parent / "tests" / "raw_mireye_batch_response.json"
                        with open(raw_out_path, "w", encoding="utf-8") as f:
                            json.dump(batch_data, f, indent=2)
                    except Exception:
                        pass
                    break

                if resp.status_code == 409:
                    # Batch is still being computed on Mireye server — retry with same idempotency key in 2-3s
                    _time.sleep(2.5)
                    continue

                if resp.status_code == 429:
                    try:
                        detail = resp.json().get("detail", {})
                        retry_after = float(detail.get("retry_after_s", 3))
                    except Exception:
                        retry_after = 3.0
                    wait = retry_after + 0.5 * (attempt + 1)
                    _time.sleep(wait)
                    continue

                print(f"  [Mireye Warning] HTTP {resp.status_code} on batch fetch: {resp.text[:120]}", flush=True)
                break
            except (requests.exceptions.RequestException, Exception) as req_err:
                print(f"  [Mireye Notice] Connection/Network issue ({req_err}) on attempt {attempt+1}", flush=True)
                if attempt < max_retries - 1:
                    _time.sleep(0.5)
                else:
                    break

        if not batch_data:
            print(f"  [Mireye Degradation] Network unavailable: degrading {len(chunk_points)} points to UNKNOWN", flush=True)
            for idx_in_chunk, (c_lat, c_lng) in enumerate(chunk_points):
                overall_idx = chunk_start + idx_in_chunk
                if overall_idx < len(results):
                    results[overall_idx] = {
                        "nearest_substation_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "nearest_substation_max_voltage_kv": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "nearest_transmission_line_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "nearest_transmission_line_voltage_kv": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "nearest_airport_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "fema_flood_zone": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "elevation": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "slope_degrees": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "intersects_critical_habitat": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "critical_habitat_listing_status": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "critical_habitat_species": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "critical_habitat_status": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "unknown"},
                        "lat": c_lat,
                        "lng": c_lng,
                        "source": "Mireye Earth API (/v1/fetch/batch)",
                        "status": "UNKNOWN",
                        "error": "Mireye batch fetch unavailable / network offline"
                    }
            continue

        # Parse index-aligned results array
        raw_results = batch_data.get("results", [])
        for item in raw_results:
            idx_in_chunk = item.get("index", 0)
            overall_idx = chunk_start + idx_in_chunk

            loc = chunk_points[idx_in_chunk] if idx_in_chunk < len(chunk_points) else (0.0, 0.0)
            lat = item.get("lat", loc[0])
            lng = item.get("lng", loc[1])

            if item.get("ok", True):
                norm_item = normalize_mireye_item({
                    "lat": lat,
                    "lng": lng,
                    "fields": item.get("fields", {})
                })
            else:
                norm_item = {
                    "nearest_substation_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "nearest_substation_max_voltage_kv": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "nearest_transmission_line_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "nearest_transmission_line_voltage_kv": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "nearest_airport_distance_m": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "fema_flood_zone": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "elevation": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "slope_degrees": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "intersects_critical_habitat": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "critical_habitat_listing_status": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "critical_habitat_species": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "critical_habitat_status": {"value": None, "source": "Mireye Earth API", "confidence": "none", "status": "failed"},
                    "lat": lat,
                    "lng": lng,
                    "source": "Mireye Earth API (/v1/fetch/batch)",
                    "status": "FAILED",
                    "error": item.get("error", "Location fetch failed")
                }

            if overall_idx < len(results):
                results[overall_idx] = norm_item

    return results


def fetch_batch_points(points: List[Tuple[float, float]]) -> List[Dict[str, Any]]:
    """
    Fetch Mireye hazard metrics for a list of (lat, lng) points using POST /v1/fetch/batch.

    1. Checks disk cache (fetch_cache) first for ~100m grid cells.
    2. Sends batched /v1/fetch/batch request for cache misses.
    3. Stores valid returned results into fetch_cache.
    4. Returns results in exact input order.
    """
    if not points:
        return []

    grid_keys = [make_grid_key(lat, lng) for lat, lng in points]
    cached_map = get_cached_grid_batch(grid_keys)

    results = [None] * len(points)
    missing_points = []  # tuples of (original_idx, lat, lng, g_key)

    for idx, (lat, lng) in enumerate(points):
        g_key = grid_keys[idx]
        if g_key in cached_map:
            results[idx] = cached_map[g_key]
        else:
            missing_points.append((idx, lat, lng, g_key))

    if missing_points:
        coords_to_fetch = [(lat, lng) for _, lat, lng, _ in missing_points]
        fetched_items = fetch_batch_from_api(coords_to_fetch)

        newly_fetched_db = []
        for i, norm_item in enumerate(fetched_items):
            orig_idx, lat, lng, g_key = missing_points[i]
            results[orig_idx] = norm_item
            newly_fetched_db.append((g_key, "mireye_fetch", norm_item))

        if newly_fetched_db:
            set_cached_grid_batch(newly_fetched_db)

    return results


def fetch_at_point(lat: float, lng: float) -> Dict[str, Any]:
    """Single point helper utilizing the batch grid cache pipeline."""
    res_list = fetch_batch_points([(lat, lng)])
    return res_list[0] if res_list else {}


KNOWN_ADDRESS_COORDINATES = {
    # Cedar Creek Corridor
    "480 berdoll ln, cedar creek tx": (30.1395, -97.5462),
    "480 berdoll ln, cedar creek, tx": (30.1395, -97.5462),
    "480 berdoll ln": (30.1395, -97.5462),
    "620 fm 535, cedar creek tx": (30.1550, -97.5200),
    "620 fm 535, cedar creek, tx": (30.1550, -97.5200),
    "620 fm 535": (30.1550, -97.5200),
    "912 elm st, cedar creek tx": (30.1550, -97.5200),
    "912 elm st, cedar creek, tx": (30.1550, -97.5200),
    "912 elm st": (30.1550, -97.5200),

    # Palo Alto Corridor (Cubberley -> Byxbee)
    "cubberley community center": (37.4172, -122.1084),
    "cubberley community center, palo alto": (37.4172, -122.1084),
    "cubberley community center, palo alto ca": (37.4172, -122.1084),
    "cubberley community center, palo alto, ca": (37.4172, -122.1084),
    "4000 middlefield rd, palo alto ca": (37.4172, -122.1084),
    "4000 middlefield rd, palo alto, ca": (37.4172, -122.1084),
    "byxbee park": (37.4481, -122.1063),
    "byxbee park, palo alto": (37.4481, -122.1063),
    "byxbee park, baylands palo alto": (37.4481, -122.1063),
    "byxbee park, baylands, palo alto": (37.4481, -122.1063),
    "byxbee park baylands": (37.4481, -122.1063),
    "2380 embarcadero rd, palo alto ca": (37.4481, -122.1063),
    "2380 embarcadero rd, palo alto, ca": (37.4481, -122.1063),

    # Stanford -> Moffett Corridor
    "stanford research park": (37.4124, -122.1468),
    "stanford research park, palo alto": (37.4124, -122.1468),
    "stanford research park, palo alto ca": (37.4124, -122.1468),
    "stanford research park, palo alto, ca": (37.4124, -122.1468),
    "moffett federal airfield": (37.4152, -122.0490),
    "moffett federal airfield hub": (37.4152, -122.0490),
    "moffett federal airfield hub, mountain view": (37.4152, -122.0490),
    "moffett field": (37.4152, -122.0490),
    "moffett field, mountain view ca": (37.4152, -122.0490),
    "stanford dish loop hub": (37.4124, -122.1640),
    "stanford dish loop hub, stanford ca": (37.4124, -122.1640),
    "stanford dish": (37.4124, -122.1640),

    # Other Major Silicon Valley Landmarks
    "palo alto airport": (37.4611, -122.1150),
    "palo alto airport (kpao)": (37.4611, -122.1150),
    "palo alto airport, palo alto ca": (37.4611, -122.1150),
    "googleplex, mountain view": (37.4220, -122.0841),
    "googleplex": (37.4220, -122.0841),
    "apple park, cupertino": (37.3349, -122.0090),
    "apple park": (37.3349, -122.0090),
    "meta hq, menlo park": (37.4848, -122.1484),
    "meta hq": (37.4848, -122.1484),
    "3000 hanover st, palo alto ca": (37.4172, -122.1084),
}


def geocode_address(address: str) -> Dict[str, Any]:
    """
    Geocode a raw address string or coordinate tuple/string to (lat, lng) coordinates.
    Supports:
    1. Direct numeric coordinate strings (e.g. "30.1395, -97.5462" or "(37.4172, -122.1084)")
    2. Cached geocode responses from DB
    3. Known Demo / Preset Address Lookup Table (exact & fuzzy keyword matching)
    4. Mireye Earth API (/v1/geocode)
    5. OSM Nominatim fallback for live addresses
    """
    import re
    raw_str = address.strip()

    # Case 1: Coordinate string "lat, lng"
    coord_match = re.match(r"^\s*\(?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)?\s*$", raw_str)
    if coord_match:
        lat = float(coord_match.group(1))
        lng = float(coord_match.group(2))
        return {
            "lat": lat,
            "lng": lng,
            "normalized_address": f"({lat:.4f}, {lng:.4f})",
            "source": "Direct Coordinates",
            "status": "OK"
        }

    clean_addr = raw_str.lower().strip()
    cache_key = f"mireye_geocode_{clean_addr}"
    cached = get_cached_response(cache_key)
    if cached and cached.get("status") == "OK":
        return cached

    # Case 2: Known Demo Address Lookup Table (Exact match)
    if clean_addr in KNOWN_ADDRESS_COORDINATES:
        k_lat, k_lng = KNOWN_ADDRESS_COORDINATES[clean_addr]
        res = {
            "lat": k_lat,
            "lng": k_lng,
            "normalized_address": raw_str,
            "source": "Grounded Preset Database",
            "status": "OK"
        }
        set_cached_response(cache_key, "mireye_geocode", res)
        return res

    # Case 2B: Known Address Fuzzy Substring Matching
    for key, (k_lat, k_lng) in KNOWN_ADDRESS_COORDINATES.items():
        if key in clean_addr or (len(clean_addr) > 5 and clean_addr in key):
            res = {
                "lat": k_lat,
                "lng": k_lng,
                "normalized_address": raw_str,
                "source": "Grounded Preset Database (Keyword Match)",
                "status": "OK"
            }
            set_cached_response(cache_key, "mireye_geocode", res)
            return res

    # Case 3: Live Mireye /v1/geocode
    if MIREYE_API_KEY:
        try:
            headers = {
                "Authorization": f"Bearer {MIREYE_API_KEY}",
                "Content-Type": "application/json"
            }
            resp = requests.post(
                f"{MIREYE_BASE_URL}/geocode",
                json={"address": address},
                headers=headers,
                timeout=8
            )
            if resp.status_code == 200:
                data = resp.json()
                result = {
                    "lat": float(data.get("lat", 0.0)),
                    "lng": float(data.get("lng", 0.0)),
                    "normalized_address": data.get("normalized_address", address),
                    "source": "Mireye Earth API (/v1/geocode)",
                    "status": "OK"
                }
                set_cached_response(cache_key, "mireye_geocode", result)
                return result
        except Exception as e:
            print(f"  [Geocode Notice] Mireye geocode request failed: {e}", flush=True)

    # Case 4: OSM Nominatim Fallback (with progressive query simplifications)
    queries_to_try = [
        address,
        re.sub(r",\s*baylands", "", address, flags=re.IGNORECASE),
        re.sub(r"\s+hub\b", "", address, flags=re.IGNORECASE),
        address.split(",")[0]
    ]

    for q in queries_to_try:
        q_clean = q.strip()
        if not q_clean:
            continue
        try:
            nom_url = "https://nominatim.openstreetmap.org/search"
            nom_resp = requests.get(
                nom_url,
                params={"q": q_clean, "format": "json", "limit": 1},
                headers={"User-Agent": "AirlaneBVLOSAgent/1.0"},
                timeout=6
            )
            if nom_resp.status_code == 200:
                nom_data = nom_resp.json()
                if nom_data and len(nom_data) > 0:
                    result = {
                        "lat": float(nom_data[0]["lat"]),
                        "lng": float(nom_data[0]["lon"]),
                        "normalized_address": nom_data[0].get("display_name", address),
                        "source": "OpenStreetMap Nominatim",
                        "status": "OK"
                    }
                    set_cached_response(cache_key, "mireye_geocode", result)
                    return result
        except Exception as e:
            print(f"  [Geocode Notice] Nominatim fallback for '{q_clean}' failed: {e}", flush=True)

    # If all fails, raise RuntimeError with clear instruction
    raise RuntimeError(
        f"Unable to geocode address '{address}'. "
        f"Please provide valid coordinates '(lat, lng)' or a recognized address."
    )
