"""
build_delphi.py
===============

Builds data/delphi.json for the Delphi sneak-preview on airisk.mit.edu.

Reads:
    data/vuln_resp_summary.csv  (already in this repo)

Visualization: butterfly chart — user picks a risk and an actor, chart shows
diverging horizontal bars for Vulnerability (left) and Responsibility (right)
stacked by Likert level (5 levels each side), round 3 only.

Output shape:

    {
      "meta": {...},
      "risks": [
        {"number": "1.1", "name": "Unfair discrimination and misrepresentation"}
      ],
      "actors": ["AI Deployer", "AI Developer (General-purpose AI)", ...],
      "data": {
        "1.1": {
          "AI Deployer": {
            "n": 85,
            "Responsibility": {"Primarily": 30.6, "Highly": 51.8, ...},
            "Vulnerability":  {"Extremely": 8.2, "Highly": 28.2, ...}
          }
        }
      }
    }

Levels (fixed order, outermost = strongest):
    Responsibility: Primarily > Highly > Moderately > Minimally > Not at all
    Vulnerability:  Extremely > Highly > Moderately > Minimally > Not at all
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
INPUT_CSV = REPO_ROOT / "data" / "vuln_resp_summary.csv"
OUTPUT_PATH = REPO_ROOT / "data" / "delphi.json"

TARGET_ROUND = "3"
TARGET_CATEGORY = "Actor"  # skip Sector rows

# Levels ordered from weakest to strongest, for rendering consistency.
# Widget will flip for "outward from center" rendering.
RESP_LEVELS = [
    "Not at all responsible",
    "Minimally responsible",
    "Moderately responsible",
    "Highly responsible",
    "Primarily responsible",
]
VULN_LEVELS = [
    "Not at all vulnerable",
    "Minimally vulnerable",
    "Moderately vulnerable",
    "Highly vulnerable",
    "Extremely vulnerable",
]

# Short keys the widget uses (drop the trailing word)
def short_level(level: str) -> str:
    # "Primarily responsible" -> "Primarily"
    # "Extremely vulnerable"  -> "Extremely"
    # "Not at all responsible" -> "Not at all"
    return level.rsplit(" ", 1)[0].strip()


def build():
    print(f"Reading {INPUT_CSV.relative_to(REPO_ROOT)}")
    if not INPUT_CSV.exists():
        raise FileNotFoundError(f"Missing input CSV: {INPUT_CSV}")

    risk_names: dict[str, str] = {}
    actors_seen: set[str] = set()
    # data[risk_number][actor][criteria][level_short] = pct
    data: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    # Also track n = total responses for each risk × actor × criteria.
    # Responsibility and Vulnerability can have different totals (different
    # response counts), so store both; the widget will show whichever makes
    # sense for the pair currently viewed.
    n_counts: dict = defaultdict(lambda: defaultdict(dict))

    rows_kept = 0
    rows_skipped = 0

    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["round"] != TARGET_ROUND:
                rows_skipped += 1
                continue
            if row["actor_sector_category"] != TARGET_CATEGORY:
                rows_skipped += 1
                continue

            criteria = row["criteria"]
            if criteria not in ("Responsibility", "Vulnerability"):
                rows_skipped += 1
                continue

            risk_num = row["risk_number"]
            risk_name = row["risk_name"]
            actor = row["actor_sector_name"]
            level_full = row["vuln_resp_level"]
            level = short_level(level_full)

            try:
                pct = float(row["pct"])
                total = int(row["total"])
            except (ValueError, KeyError):
                rows_skipped += 1
                continue

            # Drop "Don't Know/Unsure" and any other non-Likert response
            # (keep only the 5 canonical levels per criteria)
            valid_full_levels = RESP_LEVELS if criteria == "Responsibility" else VULN_LEVELS
            if level_full not in valid_full_levels:
                rows_skipped += 1
                continue

            # Strip the "(1.1) 1.1 Unfair…" prefix down to just the readable name
            readable = risk_name
            if readable.startswith(risk_num + " "):
                readable = readable[len(risk_num) + 1:]
            risk_names[risk_num] = readable
            actors_seen.add(actor)

            data[risk_num][actor][criteria][level] = pct
            n_counts[risk_num][actor][criteria] = total
            rows_kept += 1

    # Order risks numerically by code (1.1, 1.2, ..., 7.6)
    def risk_sort_key(code: str) -> tuple:
        try:
            major, minor = code.split(".")
            return (int(major), int(minor))
        except (ValueError, AttributeError):
            return (999, 0)

    risks_ordered = [
        {"number": r, "name": risk_names[r]}
        for r in sorted(risk_names, key=risk_sort_key)
    ]

    # Fixed actor order (closest we have to a canonical listing)
    preferred_actor_order = [
        "AI Developer (General-purpose AI)",
        "AI Developer (Specialised AI)",
        "AI Deployer",
        "AI Infrastructure Provider",
        "AI Governance Actor",
        "AI User",
        "Affected Stakeholder",
    ]
    actors_ordered = [a for a in preferred_actor_order if a in actors_seen]
    # Append any seen-but-unknown actors at the end
    for a in sorted(actors_seen):
        if a not in actors_ordered:
            actors_ordered.append(a)

    # Build compact output
    output_data = {}
    for risk_num, actors_data in data.items():
        output_data[risk_num] = {}
        for actor, criteria_data in actors_data.items():
            resp = criteria_data.get("Responsibility", {})
            vuln = criteria_data.get("Vulnerability", {})
            # Fill missing levels with 0 so widget can render without guarding
            resp_full = {short_level(l): resp.get(short_level(l), 0.0) for l in RESP_LEVELS}
            vuln_full = {short_level(l): vuln.get(short_level(l), 0.0) for l in VULN_LEVELS}
            output_data[risk_num][actor] = {
                "n_resp": n_counts[risk_num][actor].get("Responsibility", 0),
                "n_vuln": n_counts[risk_num][actor].get("Vulnerability", 0),
                "Responsibility": resp_full,
                "Vulnerability": vuln_full,
            }

    # Pre-compute some summary stats for the interpretation text
    total_risks = len(risks_ordered)
    total_actors = len(actors_ordered)
    # Count total unique (risk, actor) pairs with data
    combos = sum(1 for r in output_data for a in output_data[r])
    # Approx total responses from any single (risk, actor) pair with full data
    sample_ns = []
    for r in output_data:
        for a in output_data[r]:
            if output_data[r][a]["n_resp"]:
                sample_ns.append(output_data[r][a]["n_resp"])
            if output_data[r][a]["n_vuln"]:
                sample_ns.append(output_data[r][a]["n_vuln"])
    approx_n = max(sample_ns) if sample_ns else 0

    interpretation = (
        f"The Delphi expert panel rated {total_risks} AI risk subdomains "
        f"across {total_actors} AI ecosystem actors on two dimensions: who is "
        f"responsible and who is vulnerable. Pick any combination to see the "
        f"final round 3 consensus."
    )

    output = {
        "meta": {
            "dataset": "delphi",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"data/vuln_resp_summary.csv (round {TARGET_ROUND})",
            "round": int(TARGET_ROUND),
            "risk_count": total_risks,
            "actor_count": total_actors,
            "combo_count": combos,
            "approx_panel_size": approx_n,
            "interpretation_title": "Expert consensus on who's responsible and who's vulnerable",
            "interpretation": interpretation,
            "cta_url": "https://airisk.mit.edu/ai-risk-delphi",
            "cta_label": "Explore the Delphi findings \u2192",
        },
        "risks": risks_ordered,
        "actors": actors_ordered,
        "levels": {
            "Responsibility": [short_level(l) for l in RESP_LEVELS],
            "Vulnerability": [short_level(l) for l in VULN_LEVELS],
        },
        "data": output_data,
    }

    print("\nBuild summary:")
    print(f"  rows kept:        {rows_kept}")
    print(f"  rows skipped:     {rows_skipped}")
    print(f"  risks found:      {total_risks}")
    print(f"  actors found:     {total_actors}")
    print(f"  (risk,actor) combos: {combos}")
    print(f"  approx panel size: n \u2248 {approx_n}")
    print(f"\n  actor order:")
    for a in actors_ordered:
        print(f"    - {a}")

    return output


def main():
    output = build()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\nWrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
