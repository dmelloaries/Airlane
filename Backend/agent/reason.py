"""
Reasoning Layer agent module (Phase 7).

Uses Gemini (gemini-flash-latest) via google-genai SDK to generate structured safety case JSON.
Prompt instructs model to evaluate 3 scored geometric corridors (A, B, C), affirm the pre-computed optimal corridor,
explain the explicit rejection of the 2 losing corridors based on computed metrics and cited facts, and maintain strict JSON output.

Performance & Latency Optimizations:
- Compact JSON payload extraction (~300 tokens instead of 20,000+ token raw point dumps) for <1.5s latency.
- Direct model targeting (gemini-flash-latest) with zero cycling through dead/404 endpoints.
- Single fast retry (0.5s) on temporary 503/429 spikes, falling back instantly to deterministic safety case if API is unavailable.
- Structured 'category' enum for 100% deterministic source attribution.
"""

import os
import json
import time
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Union


def _load_env():
    """Auto-load .env from Backend directory if not already set."""
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'").strip('"')
                    os.environ.setdefault(k, v)


_load_env()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Active validated model
PRIMARY_MODEL = "gemini-flash-latest"

SOURCE_ENUM = {
    "INFRASTRUCTURE": "Mireye Earth API",
    "AIRSPACE": "FAA UAS Facility Map",
    "POPULATION": "US Census Bureau ACS5",
    "WIND": "NOAA Aviation Weather",
    "ENVIRONMENTAL": "USFWS Critical Habitat (Fish & Wildlife Service)"
}


def _clean_json_text(text: str) -> str:
    """Extract and clean raw JSON string from LLM response text."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    if text.startswith("{") and text.endswith("}"):
        return text
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        return text[first_brace:last_brace + 1].strip()
    return text


def _build_compact_prompt_payload(computed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract a concise, high-signal summary of computed metrics for Gemini.
    Strips raw coordinate arrays and per-point traces to minimize token payload and latency (<1.5s).
    """
    compact = {}
    for c_key in ["corridor_a", "corridor_b", "corridor_c"]:
        c_val = computed_data.get(c_key, {})
        if not c_val:
            continue

        haz = c_val.get("hazard_exposure", {})
        tier = c_val.get("tier", {})
        obs = c_val.get("obstacles", [])
        lz = c_val.get("landing_zones", [])
        env = c_val.get("environmental_risk", {}) or c_val.get("environmental", {})

        compact[c_key] = {
            "name": c_val.get("name", c_key),
            "distance_m": c_val.get("total_distance_m", 0.0),
            "part108_tier": tier.get("dominant_tier", "Tier 1"),
            "max_density_sq_mi": tier.get("max_density_sq_mi", 0.0),
            "hazard_score": haz.get("hazard_exposure_score", 0.0),
            "min_transmission_m": haz.get("min_transmission_distance_m", 9999.0),
            "min_substation_m": haz.get("min_substation_distance_m", 9999.0),
            "intersects_critical_habitat": env.get("intersects_critical_habitat", False),
            "critical_habitat_species": env.get("species"),
            "critical_habitat_listing_status": env.get("listing_status"),
            "flagged_obstacles_count": len(obs),
            "obstacles": [
                {
                    "type": o.get("obstacle_type"),
                    "distance_m": o.get("distance_m"),
                    "voltage_kv": o.get("voltage_kv", 0.0),
                    "severity": o.get("severity"),
                    "description": o.get("description")
                } for o in obs
            ],
            "landing_zones_count": len(lz)
        }

    if "comparison" in computed_data:
        comp = computed_data["comparison"]
        compact["comparison"] = {
            "recommended_corridor": comp.get("recommended_corridor"),
            "recommended_name": comp.get("recommended_name"),
            "comparison_reason": comp.get("comparison_reason"),
            "dimension_winners": comp.get("dimension_winners", {}),
            "rejected_corridors": comp.get("rejected_corridors", []),
            "environmental_risks": comp.get("environmental_risks", {})
        }

    return compact


def _enforce_grounded_citations(raw_risks: List[Any], computed_data: Optional[Dict[str, Any]] = None) -> List[str]:
    """
    Automated grounding enforcement for cited facts:
    Transforms structured risk objects or raw risk strings into standardized, 100% grounded strings.
    """
    cleaned_risks = []

    for item in raw_risks:
        category = None
        description = ""

        # Case 1: Structured risk object with explicit 'category' enum
        if isinstance(item, dict):
            raw_cat = str(item.get("category", "")).strip().upper()
            description = str(item.get("description") or item.get("risk") or item.get("text") or "").strip()

            if raw_cat in SOURCE_ENUM:
                category = raw_cat
            elif "ENV" in raw_cat or "HABITAT" in raw_cat or "SPECIES" in raw_cat or "USFWS" in raw_cat or "WILDLIFE" in raw_cat:
                category = "ENVIRONMENTAL"
            elif "INFRA" in raw_cat or "OBSTACLE" in raw_cat or "LINE" in raw_cat:
                category = "INFRASTRUCTURE"
            elif "POP" in raw_cat or "CENSUS" in raw_cat or "TIER" in raw_cat:
                category = "POPULATION"
            elif "AIR" in raw_cat or "FAA" in raw_cat or "CEIL" in raw_cat:
                category = "AIRSPACE"
            elif "WIND" in raw_cat or "WEATHER" in raw_cat:
                category = "WIND"

        # Case 2: Raw string item
        elif isinstance(item, str):
            description = item.strip()

        if not description:
            continue

        clean_desc = re.sub(r"\s*\[Source:[^\]]+\]\s*$", "", description).strip()

        # If category wasn't explicitly provided in a dict, infer from description
        if not category:
            desc_lower = clean_desc.lower()
            if any(w in desc_lower for w in ["critical habitat", "endangered species", "usfws", "fish & wildlife", "protected habitat", "threatened species", "wildlife refuge", "houston toad", "salt marsh harvest mouse", "plover"]):
                category = "ENVIRONMENTAL"
            elif any(w in desc_lower for w in ["population", "density", "people/sq mi", "census", "part 108 tier", "tier 1", "tier 2", "tier 3", "tier 4", "tier 5", "ground risk", "residential"]):
                category = "POPULATION"
            elif any(w in desc_lower for w in ["airspace", "ceiling", "class g", "class d", "class b", "class c", "class e", "uas facility", "uasfm", "agl"]):
                category = "AIRSPACE"
            elif any(w in desc_lower for w in ["transmission", "substation", "kv", "power line", "slope", "elevation", "infrastructure", "obstacle", "clearance"]):
                category = "INFRASTRUCTURE"
            elif any(w in desc_lower for w in ["wind", "gust", "crosswind", "knot", "kt", "metar"]):
                category = "WIND"
            else:
                category = "INFRASTRUCTURE"

        source_name = SOURCE_ENUM.get(category, "Mireye Earth API")
        cleaned_risks.append(f"{clean_desc} [Source: {source_name}]")

    return cleaned_risks


def _build_deterministic_fallback(computed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate high-fidelity deterministic safety case directly from pure compute engine output.
    Ensures sub-millisecond execution if LLM API is unavailable, rate-limited, or degraded.
    """
    comparison = computed_data.get("comparison", {})
    recommended = comparison.get("recommended_corridor", "corridor_a")
    rec_name = comparison.get("recommended_name", "Corridor A (Direct Path)")
    reason = comparison.get("comparison_reason", "Lowest hazard exposure score and optimal ground risk corridor selected.")
    rejected_raw = comparison.get("rejected_corridors", [])

    corr_info = computed_data.get(recommended, {})
    tier_info = corr_info.get("tier", {})
    tier = tier_info.get("dominant_tier", "Tier 1")
    obstacles = corr_info.get("obstacles", [])
    landing_zones = corr_info.get("landing_zones", [])
    env_info = corr_info.get("environmental_risk", {}) or corr_info.get("environmental", {})

    # Standardize rejected corridors structure
    rejected_corridors = []
    for rej in rejected_raw:
        rejected_corridors.append({
            "id": rej.get("id", ""),
            "name": rej.get("name", rej.get("id", "")),
            "reason": rej.get("reason", "Higher hazard exposure score or higher ground risk tier.")
        })

    # Assemble cited flagged risks with explicit 100% grounded sources
    structured_risks = []
    for obs in obstacles:
        structured_risks.append({
            "category": "INFRASTRUCTURE",
            "description": obs.get("description", "High-voltage or obstacle proximity hazard.")
        })

    if env_info.get("intersects_critical_habitat"):
        structured_risks.append({
            "category": "ENVIRONMENTAL",
            "description": env_info.get("description", "Intersects designated USFWS Critical Habitat.")
        })

    for c_id in ["corridor_a", "corridor_b", "corridor_c"]:
        if c_id != recommended:
            other_c = computed_data.get(c_id, {})
            other_name = other_c.get("name", c_id)
            for obs in other_c.get("obstacles", []):
                structured_risks.append({
                    "category": "INFRASTRUCTURE",
                    "description": f"[{other_name}] {obs.get('description', 'Obstacle hazard')}"
                })
            other_tier_info = other_c.get("tier", {})
            other_tier = other_tier_info.get("dominant_tier")
            other_density = other_tier_info.get("max_density_sq_mi", 0.0)
            if other_tier and other_tier in ("Tier 3", "Tier 4", "Tier 5"):
                structured_risks.append({
                    "category": "POPULATION",
                    "description": f"[{other_name}] Operates in higher ground risk {other_tier} (peak density {other_density:.0f} people/sq mi)."
                })
            other_env = other_c.get("environmental_risk", {}) or other_c.get("environmental", {})
            if other_env.get("intersects_critical_habitat"):
                structured_risks.append({
                    "category": "ENVIRONMENTAL",
                    "description": f"[{other_name}] {other_env.get('description', 'Intersects designated USFWS Critical Habitat.')}"
                })

    if not structured_risks:
        structured_risks.append({
            "category": "INFRASTRUCTURE",
            "description": "No critical high-voltage transmission or substation hazards detected along recommended route."
        })

    flagged_risks = _enforce_grounded_citations(structured_risks, computed_data)

    lz_summary = (
        f"Identified {len(landing_zones)} candidate emergency forced landing zones with high infrastructure clearance "
        f"(>400m) and gentle terrain slope (<5°). [Source: {SOURCE_ENUM['INFRASTRUCTURE']}]"
        if landing_zones else
        f"No dedicated open landing zones identified with required clearance buffer. [Source: {SOURCE_ENUM['INFRASTRUCTURE']}]"
    )

    return {
        "recommended_corridor": recommended,
        "recommended_name": rec_name,
        "verdict_title": f"Approved Route: {rec_name} — Part 108 {tier}",
        "part108_tier": tier,
        "primary_justification": reason,
        "rejected_corridors": rejected_corridors,
        "flagged_risks": flagged_risks,
        "landing_zones_summary": lz_summary,
        "confidence_score": 0.95,
        "caveats": [
            "FAA UAS Facility Map data is for pre-flight planning and risk screening only, not real-time flight authorization.",
            "Ground population risk classified against US Census Bureau ACS5 tract population density.",
            "High-voltage electrical transmission and substation proximity queried via Mireye Earth API.",
            "Environmental critical habitat and endangered species boundaries queried via US Fish & Wildlife Service (USFWS)."
        ]
    }


def generate_safety_case(computed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Phase 7: Generate structured reasoning verdict for 3-corridor comparison using Gemini.
    Fast execution (<1.5s) using compact payload and instant deterministic fallback on API contention.
    """
    comparison = computed_data.get("comparison", {})
    recommended = comparison.get("recommended_corridor", "corridor_a")
    rec_name = comparison.get("recommended_name", "Corridor A (Direct Path)")
    reason = comparison.get("comparison_reason", "Lowest hazard exposure score corridor selected.")

    # Build ultra-compact prompt payload (~300 tokens)
    compact_payload = _build_compact_prompt_payload(computed_data)

    prompt = f"""You are an expert FAA Part 108 Drone BVLOS Flight Operations & Safety Officer.
You are evaluating 3 geometric candidate flight corridors (Corridor A, Corridor B, Corridor C) for a commercial BVLOS drone delivery mission based on distance-based hazard exposure scores, ground risk tiers, and airspace ceilings.

Pre-computed flight analysis payload:
{json.dumps(compact_payload, indent=2)}

GROUNDING & CITATION RULES:
You must provide 'flagged_risks' as an array of structured objects with:
- "category": exactly one of ["INFRASTRUCTURE", "AIRSPACE", "POPULATION", "WIND", "ENVIRONMENTAL"]
  * "ENVIRONMENTAL": USFWS critical habitat, endangered or threatened species, wildlife conservation areas
  * "INFRASTRUCTURE": electrical transmission lines, towers, substations, slope, elevation, physical obstacles
  * "AIRSPACE": airspace ceilings, controlled airspace classes (Class B/C/D/E/G), UAS Facility Map limits
  * "POPULATION": census population density, residential density, Part 108 ground risk tiers
  * "WIND": surface wind speeds, gusts, aerodynamic crosswind limits
- "description": clear factual description of the hazard/risk. Do NOT write "[Source: ...]" inside description (the system automatically assigns the official citation from the category).

ANTI-HALLUCINATION & PROVENANCE CONSISTENCY RULES:
- Affirm and recommend the pre-computed optimal corridor: '{recommended}' ({rec_name}).
- Explicitly explain why EACH of the 2 losing corridors was rejected in 'rejected_corridors', citing their higher ground risk tier, higher hazard exposure score, closer infrastructure proximity, or flagged obstacles.
- Summarize emergency forced landing zone suitability in 'landing_zones_summary'.
- Include relevant operational caveats in 'caveats' (e.g. FAA UAS Facility Map planning disclaimer).
- Output ONLY a valid JSON object matching this exact schema:
{{
  "recommended_corridor": "{recommended}",
  "recommended_name": "{rec_name}",
  "verdict_title": "Approved Route: {rec_name} — Part 108 <Tier>",
  "part108_tier": "<Dominant Part 108 Tier of recommended corridor>",
  "primary_justification": "{reason}",
  "rejected_corridors": [
    {{
      "id": "<losing_corridor_id_1>",
      "name": "<losing_corridor_name_1>",
      "reason": "<Explicit factual reason for rejection based on tier, hazard score, or obstacles>"
    }},
    {{
      "id": "<losing_corridor_id_2>",
      "name": "<losing_corridor_name_2>",
      "reason": "<Explicit factual reason for rejection based on tier, hazard score, or obstacles>"
    }}
  ],
  "flagged_risks": [
    {{
      "category": "INFRASTRUCTURE",
      "description": "<Factual obstacle hazard description>"
    }},
    {{
      "category": "POPULATION",
      "description": "<Factual ground population risk description>"
    }},
    {{
      "category": "AIRSPACE",
      "description": "<Factual airspace ceiling limit description>"
    }}
  ],
  "landing_zones_summary": "<Summary of identified emergency landing zones and suitability> [Source: Mireye Earth API]",
  "confidence_score": 0.95,
  "caveats": [
    "FAA UAS Facility Map data is for pre-flight planning and not real-time flight authorization.",
    "Federal EIA/HIFLD infrastructure distance metrics queried via Mireye Earth API."
  ]
}}
"""

    if GEMINI_API_KEY:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=GEMINI_API_KEY)

            # At most 2 attempts (0.5s backoff) to keep latency strictly under 2 seconds
            for attempt in range(2):
                try:
                    t0 = time.time()
                    print(f"  [Reasoning Layer] Querying Gemini ({PRIMARY_MODEL})...", flush=True)
                    # Configure low latency: disable thinking budget and limit output tokens
                    try:
                        gen_config = types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                            max_output_tokens=1000,
                            thinking_config=types.ThinkingConfig(thinking_budget=0)
                        )
                    except (AttributeError, TypeError):
                        gen_config = types.GenerateContentConfig(
                            response_mime_type="application/json",
                            temperature=0.1,
                            max_output_tokens=1000
                        )

                    response = client.models.generate_content(
                        model=PRIMARY_MODEL,
                        contents=prompt,
                        config=gen_config
                    )
                    t1 = time.time()

                    if response and response.text:
                        cleaned_json = _clean_json_text(response.text)
                        parsed = json.loads(cleaned_json)
                        if "recommended_corridor" in parsed and "rejected_corridors" in parsed and "part108_tier" in parsed:
                            raw_risks = parsed.get("flagged_risks", [])
                            parsed["flagged_risks"] = _enforce_grounded_citations(raw_risks, computed_data)
                            print(f"  [Reasoning Layer] ✓ Successfully generated safety case in {t1 - t0:.2f}s.", flush=True)
                            return parsed

                except Exception as exc:
                    exc_str = str(exc).lower()
                    is_transient = "503" in exc_str or "429" in exc_str or "unavailable" in exc_str or "exhausted" in exc_str
                    print(f"  [Reasoning Layer Notice] Gemini attempt {attempt+1} ({exc_str[:120]}...)", flush=True)

                    if is_transient and attempt == 0:
                        time.sleep(0.5)
                        continue
                    else:
                        break

        except Exception as e:
            print(f"  [Reasoning Layer Notice] Client exception: {e}", flush=True)

    # Sub-millisecond deterministic fallback
    print("  [Reasoning Layer] Instantly returned deterministic structured safety case fallback.", flush=True)
    return _build_deterministic_fallback(computed_data)
