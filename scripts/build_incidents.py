"""
build_incidents.py
==================

Builds data/incidents.json for the Incidents sneak-preview on airisk.mit.edu.

Visualization: stacked area chart, x = year, y = count of incidents, stacked
by MIT Risk Repo Domain (7 domains + "Other" bucket for unmapped).

Source:
    Base:  appYXeL8YwZfAy4kF  (Incident Tracker Live)
    Table: tbldsUc5St4KG9hGP  (Classifications for export)

Filtering rules:
    - Rows with a null or empty Domain are bucketed into "Other" (and logged).
    - Rows with a null Year are dropped (logged with incident_id).
    - No date filter — we include everything the export table contains.

Output shape (see CLAUDE.md for the general contract):

    {
      "meta": { ... },
      "chart": {
        "type": "stacked_area",
        "x_field": "year",
        "stack_field": "domain",
        "domains": ["Discrimination & Toxicity", "Privacy & Security", ...],
        "series": [
          {
            "year": 2018,
            "Discrimination & Toxicity": 4,
            "Privacy & Security": 2,
            ...
            "total": 12
          },
          ...
        ]
      }
    }
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Add scripts dir to path so we can import _airtable regardless of CWD
sys.path.insert(0, str(Path(__file__).parent))
from _airtable import fetch_all_records, iter_fields  # noqa: E402


# --- Source location ---------------------------------------------------------
BASE_ID = "appYXeL8YwZfAy4kF"
TABLE_ID = "tbldsUc5St4KG9hGP"  # Classifications for export

# --- Field IDs (resilient to name changes) -----------------------------------
FLD_INCIDENT_ID = "fldi08XG44xOzQx6x"
FLD_DOMAIN = "fld63Irmbk4vRdIjr"
FLD_YEAR = "flduvMsBTfTBqsOwT"  # formula field returning year
FLD_TITLE = "fld7tPwvbS1nqyXBg"

REQUIRED_FIELDS = [FLD_INCIDENT_ID, FLD_DOMAIN, FLD_YEAR, FLD_TITLE]

# --- Canonical domain order (stable color assignment in the widget) ----------
# Matches the 7-domain MIT Risk Repository taxonomy. "Other" catches anything
# that doesn't map cleanly so we never silently drop data from the chart.
# Prefixes like "1." are tolerated on input; we normalize to the bare label.
CANONICAL_DOMAINS = [
    "Discrimination & Toxicity",
    "Privacy & Security",
    "Misinformation",
    "Malicious Use",
    "Human-Computer Interaction",
    "Socioeconomic & Environmental",
    "AI System Safety, Failures & Limitations",
]
OTHER_BUCKET = "Other"


# --- Output paths ------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "incidents.json"


def normalize_domain(raw: str | None) -> str:
    """
    Normalize a raw Domain string from Airtable to one of CANONICAL_DOMAINS.
    Returns OTHER_BUCKET if no match. Tolerates common formatting variations:
    leading numeric prefixes ("1. "), trailing whitespace, differing ampersand
    styles.
    """
    if not raw:
        return OTHER_BUCKET
    s = raw.strip()
    # Strip leading "N." or "N)" prefixes if the taxonomy is numbered
    import re
    s = re.sub(r"^\s*\d+\s*[\.\)]\s*", "", s)
    s = s.replace(" and ", " & ")
    # Case-insensitive match against canonical
    for canon in CANONICAL_DOMAINS:
        if s.lower() == canon.lower():
            return canon
    return OTHER_BUCKET


def build() -> dict:
    print(f"Fetching from Airtable: {BASE_ID} / {TABLE_ID}")
    records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TABLE_ID,
        fields=REQUIRED_FIELDS,
    )
    print(f"  fetched {len(records)} records")

    # Aggregate: {year: Counter({domain: count})}
    by_year: dict[int, Counter] = defaultdict(Counter)
    dropped_no_year = 0
    bucketed_other = 0
    domain_raw_counts: Counter = Counter()

    for fields in iter_fields(records):
        year = fields.get(FLD_YEAR)
        domain_raw = fields.get(FLD_DOMAIN)
        domain_raw_counts[domain_raw or "<null>"] += 1

        if year is None or year == "":
            dropped_no_year += 1
            continue
        try:
            year_int = int(year)
        except (TypeError, ValueError):
            dropped_no_year += 1
            continue

        domain = normalize_domain(domain_raw)
        if domain == OTHER_BUCKET:
            bucketed_other += 1
        by_year[year_int][domain] += 1

    # Build the series array, sorted by year, zero-filling missing domains
    all_domains = CANONICAL_DOMAINS + [OTHER_BUCKET]
    series = []
    for year in sorted(by_year.keys()):
        row = {"year": year}
        total = 0
        for d in all_domains:
            count = by_year[year].get(d, 0)
            row[d] = count
            total += count
        row["total"] = total
        series.append(row)

    total_kept = sum(r["total"] for r in series)

    # --- Interpretation copy (editable; reviewed as part of data PRs) --------
    interpretation_title = (
        "Reports of AI incidents are rising sharply"
    )
    interpretation = (
        f"The tracker has classified {total_kept:,} incidents to date "
        f"across seven MIT Risk Repository domains. Misinformation and "
        f"Malicious Use dominate recent years, though all domains have "
        f"grown as reporting matures."
    )

    output = {
        "meta": {
            "dataset": "incidents",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"Airtable {BASE_ID} / Classifications for export",
            "record_count": total_kept,
            "interpretation_title": interpretation_title,
            "interpretation": interpretation,
            "cta_url": "https://airisk.mit.edu/ai-incident-tracker",
            "cta_label": "Explore the tracker \u2192",
        },
        "chart": {
            "type": "stacked_area",
            "x_field": "year",
            "stack_field": "domain",
            "domains": all_domains,
            "series": series,
        },
    }

    # --- Build summary ------------------------------------------------------
    print("\nBuild summary:")
    print(f"  records in:           {len(records)}")
    print(f"  kept (with year):     {total_kept}")
    print(f"  dropped (no year):    {dropped_no_year}")
    print(f"  bucketed as 'Other':  {bucketed_other}")
    print("\n  raw Domain values seen (top 10):")
    for val, cnt in domain_raw_counts.most_common(10):
        print(f"    {cnt:>5}  {val}")

    return output


def main() -> int:
    output = build()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"\nWrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
