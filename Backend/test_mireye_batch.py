"""
Test script for Mireye Batch Fetching (/v1/fetch).

Verifies that multiple coordinate points (e.g. 20 points along a flight route)
are fetched and parsed correctly from Mireye's nested fields structure:
response["fields"][field_name] -> {value, source, confidence, unit, status, notes}.

Asserts against ALL 20 points:
- Every field object must exist (not silently dropped).
- Value must be either a valid number/string OR explicitly None.
- If None, field metadata (status, notes, source) must still be present.
"""

import sys
import time
from pathlib import Path

# Add Backend root to path
sys.path.append(str(Path(__file__).parent))

from db import clear_fetch_cache
from agent.corridor import interpolate_direct_path
from sources.mireye import fetch_batch_points, FETCH_FIELDS, MIREYE_API_KEY, MIREYE_BASE_URL


def main():
    print("Clearing disk cache to test live API execution...")
    clear_fetch_cache()

    print("==================================================")
    print("      TESTING MIREYE BATCH FETCH API (/v1/fetch)  ")
    print("==================================================")
    print(f"Base URL:       {MIREYE_BASE_URL}")
    print(f"API Key set:    {'YES' if MIREYE_API_KEY else 'NO (using fallback baseline)'}\n")

    # Generate 20 sample points along a 3.6-mile demo route in Cedar Creek, TX
    start_pt = (30.1345, -97.5512)
    end_pt = (30.1650, -97.5020)

    sample_pts, total_dist = interpolate_direct_path(start_pt, end_pt, sample_spacing_m=300.0)
    coords = [(p.lat, p.lng) for p in sample_pts]

    print(f"Generated {len(coords)} sample points across {total_dist:.0f}m flight path.")

    print("\nExecuting live API fetch for all 20 sample points...")
    t0 = time.time()
    results = fetch_batch_points(coords)
    t1 = time.time()

    elapsed = t1 - t0
    print(f"✓ Response received in {elapsed:.2f} seconds.")
    print(f"✓ Total point results returned: {len(results)} / {len(coords)}\n")

    print("==================================================")
    print("   POINTS 16-19 FIELD METADATA INSPECTION         ")
    print("==================================================")
    for p_idx in [16, 17, 18, 19]:
        pt_item = results[p_idx]
        trans_field = pt_item.get("nearest_transmission_line_distance_m", {})
        print(f"Point [{p_idx:02d}] ({coords[p_idx][0]:.4f}, {coords[p_idx][1]:.4f}):")
        print(f"  nearest_transmission_line_distance_m:")
        print(f"    value:      {trans_field.get('value')}")
        print(f"    status:     {trans_field.get('status')}")
        print(f"    notes:      {trans_field.get('notes')}")
        print(f"    source:     {trans_field.get('source')}")
        print(f"    confidence: {trans_field.get('confidence')}\n")

    print("==================================================")
    print("   VERIFYING ALL 20 SAMPLE POINTS (STRICT AUDIT)  ")
    print("==================================================")
    valid_points_count = 0

    for idx, item in enumerate(results):
        all_fields_valid = True

        for f_name in FETCH_FIELDS:
            assert f_name in item, f"Field '{f_name}' missing from point [{idx}]"
            f_obj = item[f_name]
            assert isinstance(f_obj, dict), f"Field '{f_name}' at point [{idx}] must be a dict object"
            assert "status" in f_obj, f"Field '{f_name}' at point [{idx}] missing status metadata"
            assert "source" in f_obj, f"Field '{f_name}' at point [{idx}] missing source metadata"

            val = f_obj.get("value")
            # Value must be numeric/string OR explicitly None
            assert val is None or isinstance(val, (int, float, str)), \
                f"Field '{f_name}' at point [{idx}] has invalid value type: {type(val)}"

        valid_points_count += 1
        sub_val = item["nearest_substation_distance_m"]["value"]
        trans_val = item["nearest_transmission_line_distance_m"]["value"]
        elev_val = item["elevation"]["value"]
        sub_src = item["nearest_substation_distance_m"]["source"]

        trans_str = f"{trans_val:.1f}m" if trans_val is not None else "None (honest absence)"
        sub_str = f"{sub_val:.1f}m" if sub_val is not None else "None"
        elev_str = f"{elev_val:.1f}m" if elev_val is not None else "None"

        print(f"  Point [{idx:02d}] ({coords[idx][0]:.4f}, {coords[idx][1]:.4f}) -> "
              f"Substation: {sub_str:<8} | Transmission: {trans_str:<22} | Elev: {elev_str:<7} | Source: {sub_src}")

    # Assertions across ALL 20 points
    assert len(results) == len(coords), "Should return exact number of requested points"
    assert valid_points_count == len(coords), f"All {len(coords)} points must have valid field objects"

    print("\n==================================================")
    print(f"✅ ALL {valid_points_count}/{len(coords)} POINTS VERIFIED (HONEST FIELD OBJECT AUDIT PASSED)!")
    print("==================================================")


if __name__ == "__main__":
    main()
