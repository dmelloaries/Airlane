"""
Eval 2: Tier Accuracy Test.

Asserts that ground population density values map to exact Part 108 risk tiers.
Target pass rate: 100%.
"""

import sys
from pathlib import Path

# Add Backend root to path
sys.path.append(str(Path(__file__).parent.parent))

from sources.population import classify_tier


def test_tier_classification():
    test_cases = [
        (100.0, "Tier 1"),
        (499.0, "Tier 1"),
        (500.0, "Tier 2"),
        (1500.0, "Tier 2"),
        (2000.0, "Tier 3"),
        (4500.0, "Tier 3"),
        (5000.0, "Tier 4"),
        (11999.0, "Tier 4"),
        (12000.0, "Tier 5"),
        (50000.0, "Tier 5"),
    ]

    passed = 0
    for density, expected in test_cases:
        res = classify_tier(density)
        actual = res.get("tier")
        if actual == expected:
            passed += 1
            print(f"  ✓ Density {density:>7.1f} sq/mi -> {actual}")
        else:
            print(f"  ✗ Density {density:>7.1f} sq/mi -> Expected {expected}, got {actual}")

    accuracy = (passed / len(test_cases)) * 100.0
    print(f"\nTier Classification Accuracy: {accuracy:.1f}% ({passed}/{len(test_cases)})")
    assert passed == len(test_cases), "Tier classification accuracy must be 100%"


if __name__ == "__main__":
    test_tier_classification()
