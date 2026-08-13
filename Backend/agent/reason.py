"""
Reasoning Layer agent module.
Uses Gemini (gemini-flash-latest) via google-genai SDK to generate structured safety case JSON.
Prompt instructs model to evaluate 3 scored geometric corridors (A, B, C), affirm the optimal corridor,
and explicitly explain the rejection of the 2 losing corridors.
"""

import os
import json
from typing import Dict, Any

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def generate_safety_case(computed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate structured reasoning verdict for 3-corridor comparison.
    Falls back to deterministic JSON if Gemini API key is missing or encounters errors.
    """
    comparison = computed_data.get("comparison", {})
    recommended = comparison.get("recommended_corridor", "corridor_a")
    rec_name = comparison.get("recommended_name", "Corridor A (Direct Path)")
    reason = comparison.get("comparison_reason", "Lowest hazard exposure score corridor selected.")
    rejected = comparison.get("rejected_corridors", [])

    # Try Gemini client if available
    if GEMINI_API_KEY:
        try:
            from google import genai  # type: ignore
            client = genai.Client(api_key=GEMINI_API_KEY)
            prompt = f"""
You are an expert FAA Part 108 Drone BVLOS Flight Operations & Safety Officer.
You are evaluating 3 geometric candidate flight corridors (Corridor A, Corridor B, Corridor C) for a BVLOS drone mission based on distance-based hazard exposure scores, ground risk tiers, and airspace ceilings.

Pre-computed flight analysis payload:
{json.dumps(computed_data, indent=2)}

Instructions:
1. Do NOT perform arithmetic or invent new numbers. Use the pre-computed hazard exposure scores and metrics.
2. Recommend the pre-computed optimal corridor ({recommended}).
3. Explicitly state the rejection reason for EACH of the 2 losing corridors.
4. Output ONLY a valid JSON object matching the following structure:
{{
  "recommended_corridor": "{recommended}",
  "recommended_name": "{rec_name}",
  "verdict_title": "<Short headline title>",
  "part108_tier": "<Dominant Part 108 Tier>",
  "primary_justification": "{reason}",
  "rejected_corridors": [
    {{ "id": "<id>", "reason": "<explicit rejection reason based on hazard exposure score or tier>" }},
    {{ "id": "<id>", "reason": "<explicit rejection reason based on hazard exposure score or tier>" }}
  ],
  "flagged_risks": ["<risk 1 with source citation>", "<risk 2 with source citation>"],
  "landing_zones_summary": "<Summary of emergency landing options>",
  "confidence_score": 0.95,
  "caveats": ["<caveat or disclaimer>"]
}}
"""
            response = client.models.generate_content(
                model="gemini-flash-latest",
                contents=prompt,
                config={"response_mime_type": "application/json"}
            )

            if response and response.text:
                return json.loads(response.text)
        except Exception as e:
            print(f"[Gemini Reasoning Warning] {e}")

    # Deterministic Structured Fallback Verdict
    corr_info = computed_data.get(recommended, {})
    tier = corr_info.get("tier", {}).get("dominant_tier", "Tier 1")
    obstacles = corr_info.get("obstacles", [])

    flagged = [obs["description"] + " [Source: Mireye Earth API]" for obs in obstacles]
    if not flagged:
        flagged.append("No critical high-voltage or ground obstacle hazards detected. [Source: Mireye Earth API]")

    return {
        "recommended_corridor": recommended,
        "recommended_name": rec_name,
        "verdict_title": f"Approved Route: {rec_name} ({tier})",
        "part108_tier": tier,
        "primary_justification": reason,
        "rejected_corridors": rejected,
        "flagged_risks": flagged,
        "landing_zones_summary": f"Identified {len(corr_info.get('landing_zones', []))} clear forced landing points along route.",
        "confidence_score": 0.95,
        "caveats": [
            "FAA UAS Facility Map data is for planning only and not real-time flight authorization.",
            "Federal EIA/HIFLD infrastructure distance metrics queried via Mireye Earth API."
        ]
    }
