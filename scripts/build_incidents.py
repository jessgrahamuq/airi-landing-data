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
import re
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

# --- Canonical domains -------------------------------------------------------
# These are the 7 MIT Risk Repository domain labels used on the site. We map
# the raw Airtable strings (which have various formats: "4 Malicious actors",
# "7 AI system safety, failures, & limitations") onto these canonical display
# labels. The key is the domain number (1-7); the value is the display label.
DOMAIN_BY_NUMBER = {
    1: "Discrimination & Toxicity",
    2: "Privacy & Security",
    3: "Misinformation",
    4: "Malicious Actors",
    5: "Human-Computer Interaction",
    6: "Socioeconomic & Environmental",
    7: "AI System Safety, Failures & Limitations",
}
CANONICAL_DOMAINS = [DOMAIN_BY_NUMBER[i] for i in range(1, 8)]
OTHER_BUCKET = "Other"

# Regex: leading digit, optional punctuation/whitespace, rest of label.
# Matches: "4 Malicious actors", "4. Malicious Actors", "4) foo", "4: bar"
_LEADING_NUM_RE = re.compile(r"^\s*(\d+)\s*[\.\):]?\s+(.+)$")


# --- Output paths ------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "incidents.json"


def normalize_domain(raw: str | None) -> str:
    """
    Normalize a raw Domain string from Airtable to one of CANONICAL_DOMAINS.
    Returns OTHER_BUCKET if no match.

    Strategy: extract the leading domain number if present and map via
    DOMAIN_BY_NUMBER. If no leading number, fall back to case-insensitive
    label match.
    """
    if not raw:
        return OTHER_BUCKET
    s = raw.strip()
    if not s:
        return OTHER_BUCKET

    # Try leading-number prefix: "4 Malicious actors" -> 4
    m = _LEADING_NUM_RE.match(s)
    if m:
        try:
            num = int(m.group(1))
        except ValueError:
            num = None
        if num is not None and num in DOMAIN_BY_NUMBER:
            return DOMAIN_BY_NUMBER[num]

    # Fallback: case-insensitive match against canonical labels
    # (also swap common variations)
    s_norm = s.lower().replace(" and ", " & ")
    for canon in CANONICAL_DOMAINS:
        if s_norm == canon.lower():
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
    domain_canonical_counts: Counter = Counter()

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
        domain_canonical_counts[domain] += 1
        if domain == OTHER_BUCKET:
            bucketed_other += 1
        by_year[year_int][domain] += 1

    # Build the series array, sorted by year, zero-filling missing domains
    all_domains = CANONICAL_DOMAINS + [OTHER_BUCKET]
    series = []
    for year in sorted(by_year.keys()):
        row: dict = {"year": year}
        total = 0
        for d in all_domains:
            count = by_year[year].get(d, 0)
            row[d] = count
            total += count
        row["total"] = total
        series.append(row)

    total_kept = sum(r["total"] for r in series)

    # --- Interpretation copy (editable; reviewed as part of data PRs) --------
    # Figure out which domain is the largest for the most recent year with
    # complete data, to keep the prose honest.
    latest_year_row = series[-1] if series else None
    top_domain = ""
    if latest_year_row:
        counts = [
            (latest_year_row[d], d)
            for d in CANONICAL_DOMAINS
            if latest_year_row.get(d, 0) > 0
        ]
        if counts:
            counts.sort(reverse=True)
            top_domain = counts[0][1]

    interpretation_title = "Reports of AI incidents are rising sharply"
    interpretation = (
        f"The tracker has classified {total_kept:,} incidents to date "
        f"across the seven MIT Risk Repository domains. "
    )
    if top_domain:
        interpretation += (
            f"In {latest_year_row['year']}, {top_domain} accounted for the "
            f"largest share of reports."
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
    print("\n  canonical domain counts:")
    for d in all_domains:
        cnt = domain_canonical_counts.get(d, 0)
        print(f"    {cnt:>5}  {d}")
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
