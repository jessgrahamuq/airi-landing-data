"""
build_governance.py
===================

Builds data/governance.json for the Governance sneak-preview on airisk.mit.edu.

Visualization: grouped bar chart — x-axis = 24 risk subdomains (1.1-7.6),
y-axis = count of governance documents, each bar stacked by Level of Coverage
(Good / Minimal / None).

Source:
    Base:  appLSe43cSlDiYZyA  (AI Risk Governance Mapping, aka AGORA)
    Table: tbl1afyJWuwAtJMNw  (Risk Domain Upload — one row per document x subdomain)

Filtering rules:
    - Rows without a subdomain value are skipped (logged).
    - Rows without a Level of Coverage value are skipped (logged).
    - One row per (document_id, subdomain) pair, so totals are by unique document.

Output shape:

    {
      "meta": {...},
      "chart": {
        "type": "stacked_bar",
        "x_field": "subdomain",
        "stack_field": "coverage",
        "coverage_levels": ["Good", "Minimal", "None"],
        "series": [
          {"subdomain": "1.1", "domain": "Discrimination & Toxicity",
           "full_name": "Unfair discrimination and misrepresentation",
           "Good": 12, "Minimal": 34, "None": 87, "total": 133},
          ...
        ]
      },
      "top_documents_by_subdomain": {
        "1.1": [
          {"title": "...", "authority": "...", "jurisdiction": "...",
           "level": "Good", "url": "https://..."},
          ...
        ],
        ...
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

sys.path.insert(0, str(Path(__file__).parent))
from _airtable import fetch_all_records, iter_fields  # noqa: E402


# --- Source location ---------------------------------------------------------
BASE_ID = "appLSe43cSlDiYZyA"
TABLE_ID = "tbl1afyJWuwAtJMNw"  # Risk Domain Upload

# --- Field IDs ---------------------------------------------------------------
FLD_DOCUMENT_ID = "fldh6sntMehs6NBpo"
FLD_TITLE = "fldBc1HaFeMERYR5h"  # formula
FLD_SUBDOMAIN = "fldQTL7BV2TxT1NVR"  # singleSelect (full subdomain name)
FLD_COVERAGE_LEVEL = "fldy4LxcQYL0RhmTH"  # singleSelect (level)
FLD_AUTHORITY = "fldj5dTM9PGB9LrhD"
FLD_JURISDICTION = "fldO2tZqkpfhxUgU6"
FLD_OFFICIAL_NAME = "fldRoaWMII6agaxhB"
FLD_LINK_TO_DOC = "fldxw055XjRwKXIPO"  # url
FLD_LINK_TO_DOC_ALT = "flda3GIvrFNHPEY1M"  # secondary url field
FLD_LEGISLATIVE_STATUS = "fldwdZpbnS6lImZBq"

REQUIRED_FIELDS = [
    FLD_DOCUMENT_ID, FLD_TITLE, FLD_SUBDOMAIN, FLD_COVERAGE_LEVEL,
    FLD_AUTHORITY, FLD_JURISDICTION, FLD_OFFICIAL_NAME,
    FLD_LINK_TO_DOC, FLD_LINK_TO_DOC_ALT, FLD_LEGISLATIVE_STATUS,
]

# --- Canonical taxonomy ------------------------------------------------------
# Map subdomain full name (as used in Airtable) -> (code, parent_domain)
# This lets us normalize across any numbering prefix drift in the data.
SUBDOMAIN_TAXONOMY = [
    ("1.1", "Discrimination & Toxicity", "Unfair discrimination and misrepresentation"),
    ("1.2", "Discrimination & Toxicity", "Exposure to toxic content"),
    ("1.3", "Discrimination & Toxicity", "Unequal performance across groups"),
    ("2.1", "Privacy & Security", "Compromise of privacy by obtaining, leaking or correctly inferring sensitive information"),
    ("2.2", "Privacy & Security", "AI system security vulnerabilities and attacks"),
    ("3.1", "Misinformation", "False or misleading information"),
    ("3.2", "Misinformation", "Pollution of information ecosystem and loss of consensus reality"),
    ("4.1", "Malicious Actors", "Disinformation, surveillance, and influence at scale"),
    ("4.2", "Malicious Actors", "Cyberattacks, weapon development or use, and mass harm"),
    ("4.3", "Malicious Actors", "Fraud, scams, and targeted manipulation"),
    ("5.1", "Human-Computer Interaction", "Overreliance and unsafe use"),
    ("5.2", "Human-Computer Interaction", "Loss of human agency and autonomy"),
    ("6.1", "Socioeconomic & Environmental", "Power centralization and unfair distribution of benefits"),
    ("6.2", "Socioeconomic & Environmental", "Increased inequality and decline in employment quality"),
    ("6.3", "Socioeconomic & Environmental", "Economic and cultural devaluation of human effort"),
    ("6.4", "Socioeconomic & Environmental", "Competitive dynamics"),
    ("6.5", "Socioeconomic & Environmental", "Governance failure"),
    ("6.6", "Socioeconomic & Environmental", "Environmental harm"),
    ("7.1", "AI System Safety, Failures & Limitations", "AI pursuing its own goals in conflict with human goals or values"),
    ("7.2", "AI System Safety, Failures & Limitations", "AI possessing dangerous capabilities"),
    ("7.3", "AI System Safety, Failures & Limitations", "Lack of capability or robustness"),
    ("7.4", "AI System Safety, Failures & Limitations", "Lack of transparency or interpretability"),
    ("7.5", "AI System Safety, Failures & Limitations", "AI welfare and rights"),
    ("7.6", "AI System Safety, Failures & Limitations", "Multi-agent risks"),
]
# Lookup by lowercased full name (for normalizing)
SUBDOMAIN_BY_NAME = {full.lower(): code for code, _, full in SUBDOMAIN_TAXONOMY}
SUBDOMAIN_META = {code: (dom, full) for code, dom, full in SUBDOMAIN_TAXONOMY}
SUBDOMAIN_ORDER = [code for code, _, _ in SUBDOMAIN_TAXONOMY]

# --- Coverage level normalization -------------------------------------------
# Raw Airtable values are things like "Good Coverage", "3 Good Coverage",
# "No Mention", "1 No Mention", etc. We normalize to three buckets.
COVERAGE_LEVELS = ["Good", "Minimal", "None"]
COVERAGE_MAP = {
    "good coverage": "Good",
    "3 good coverage": "Good",
    "minimal coverage": "Minimal",
    "2 minimal coverage": "Minimal",
    "no mention": "None",
    "1 no mention": "None",
    "no coverage": "None",
}

# How many documents per subdomain to list in the modal
TOP_DOCS_PER_SUBDOMAIN = 5

# --- Output paths ------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "governance.json"


def normalize_subdomain(raw):
    if not raw:
        return None
    s = str(raw).strip().lower()
    # Strip a leading "X.Y " numeric prefix if present
    m = re.match(r"^(\d+\.\d+)\s+(.+)$", s)
    if m:
        code_candidate = m.group(1)
        if code_candidate in SUBDOMAIN_META:
            return code_candidate
        s = m.group(2)  # fall through to name lookup
    return SUBDOMAIN_BY_NAME.get(s)


def normalize_coverage(raw):
    if not raw:
        return None
    s = str(raw).strip().lower()
    return COVERAGE_MAP.get(s)


def extract_url(raw):
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw.get("url") or None
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def truncate_title(t, max_len=140):
    if not t:
        return None
    t = str(t).strip()
    if not t:
        return None
    if len(t) <= max_len:
        return t
    cut = t.rfind(" ", 0, max_len - 1)
    if cut <= 0:
        cut = max_len - 1
    return t[:cut].rstrip(" ,;:-") + "\u2026"


def build():
    print(f"Fetching from Airtable: {BASE_ID} / {TABLE_ID}")
    records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TABLE_ID,
        fields=REQUIRED_FIELDS,
    )
    print(f"  fetched {len(records)} records")

    # Aggregate counts by (subdomain, coverage)
    counts = defaultdict(lambda: Counter())  # counts[subdomain_code][coverage_level]
    # Collect candidate documents per subdomain (dedup by document_id)
    candidates_by_subdomain = defaultdict(dict)  # [subdomain][doc_id] = {...}

    dropped_no_subdomain = 0
    dropped_no_coverage = 0
    raw_subdomain_counts = Counter()
    raw_coverage_counts = Counter()
    total_rows = 0
    unique_documents = set()

    for fields in iter_fields(records):
        total_rows += 1

        raw_subdomain = fields.get(FLD_SUBDOMAIN)
        raw_subdomain_counts[raw_subdomain or "<null>"] += 1
        subdomain = normalize_subdomain(raw_subdomain)
        if not subdomain:
            dropped_no_subdomain += 1
            continue

        raw_coverage = fields.get(FLD_COVERAGE_LEVEL)
        raw_coverage_counts[raw_coverage or "<null>"] += 1
        coverage = normalize_coverage(raw_coverage)
        if not coverage:
            dropped_no_coverage += 1
            continue

        counts[subdomain][coverage] += 1

        doc_id = fields.get(FLD_DOCUMENT_ID)
        if doc_id is not None:
            unique_documents.add(doc_id)

        # Collect for modal: prefer Good > Minimal > None, and pick a canonical
        # record per document (dedup).
        if doc_id is not None and coverage in ("Good", "Minimal"):
            url = extract_url(fields.get(FLD_LINK_TO_DOC)) or \
                  extract_url(fields.get(FLD_LINK_TO_DOC_ALT))
            if not url:
                continue
            title = truncate_title(
                fields.get(FLD_TITLE) or fields.get(FLD_OFFICIAL_NAME)
            )
            if not title:
                continue
            # If we've seen this doc for this subdomain already with a higher
            # coverage level, don't overwrite.
            existing = candidates_by_subdomain[subdomain].get(doc_id)
            level_rank = {"Good": 2, "Minimal": 1}
            if existing and level_rank.get(existing.get("level"), 0) >= level_rank.get(coverage, 0):
                continue
            candidates_by_subdomain[subdomain][doc_id] = {
                "title": title,
                "authority": fields.get(FLD_AUTHORITY) or None,
                "jurisdiction": fields.get(FLD_JURISDICTION) or None,
                "legislative_status": fields.get(FLD_LEGISLATIVE_STATUS) or None,
                "level": coverage,
                "url": url,
            }

    # --- Build chart series ------------------------------------------------
    series = []
    for code in SUBDOMAIN_ORDER:
        domain, full = SUBDOMAIN_META[code]
        row = {
            "subdomain": code,
            "domain": domain,
            "full_name": full,
        }
        total = 0
        for lvl in COVERAGE_LEVELS:
            c = counts[code].get(lvl, 0)
            row[lvl] = c
            total += c
        row["total"] = total
        series.append(row)

    # --- Build top documents -----------------------------------------------
    # Rank: Good first, then Minimal. Within each, sort by title for stability.
    top_docs_by_subdomain = {}
    for code in SUBDOMAIN_ORDER:
        cands = list(candidates_by_subdomain[code].values())
        cands.sort(key=lambda d: (
            0 if d["level"] == "Good" else 1,
            (d["title"] or "").lower(),
        ))
        top = cands[:TOP_DOCS_PER_SUBDOMAIN]
        # drop nulls for cleanliness
        cleaned = []
        for d in top:
            cleaned.append({k: v for k, v in d.items() if v is not None})
        top_docs_by_subdomain[code] = cleaned

    # --- Interpretation copy -----------------------------------------------
    # Find the subdomain with highest "Good Coverage" count, and the one with
    # the lowest (non-zero good) ratio.
    best_covered = max(
        series, key=lambda r: r.get("Good", 0), default=None
    )
    total_docs_with_any_mention = sum(
        r["Good"] + r["Minimal"] for r in series
    )

    interpretation_title = "Coverage is uneven across the risk landscape"
    parts = [
        f"AGORA has catalogued {len(unique_documents):,} governance documents",
        f"across {len(SUBDOMAIN_ORDER)} risk subdomains.",
    ]
    if best_covered and best_covered.get("Good", 0) > 0:
        parts.append(
            f"Coverage is deepest on {best_covered['full_name'].lower()} "
            f"({best_covered['Good']} documents with good coverage)."
        )
    interpretation = " ".join(parts)

    output = {
        "meta": {
            "dataset": "governance",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"Airtable {BASE_ID} / Risk Domain Upload",
            "record_count": len(unique_documents),
            "row_count": total_rows,
            "interpretation_title": interpretation_title,
            "interpretation": interpretation,
            "cta_url": "https://airisk.mit.edu/ai-governance",
            "cta_label": "Explore the mapping \u2192",
        },
        "chart": {
            "type": "stacked_bar",
            "x_field": "subdomain",
            "stack_field": "coverage",
            "coverage_levels": COVERAGE_LEVELS,
            "series": series,
        },
        "top_documents_by_subdomain": top_docs_by_subdomain,
    }

    # --- Build summary ------------------------------------------------------
    print("\nBuild summary:")
    print(f"  rows in:              {total_rows}")
    print(f"  unique documents:     {len(unique_documents)}")
    print(f"  dropped (no subdomain): {dropped_no_subdomain}")
    print(f"  dropped (no coverage):  {dropped_no_coverage}")
    print("\n  counts by subdomain:")
    for row in series:
        print(f"    {row['subdomain']}  "
              f"Good={row['Good']:>4}  Min={row['Minimal']:>4}  "
              f"None={row['None']:>4}  {row['full_name'][:50]}")
    print("\n  top documents collected:")
    for code in SUBDOMAIN_ORDER:
        kept = len(top_docs_by_subdomain[code])
        pool = len(candidates_by_subdomain[code])
        print(f"    {code}: {kept} kept of {pool} with-url candidates")
    print("\n  raw coverage values seen:")
    for val, cnt in raw_coverage_counts.most_common():
        print(f"    {cnt:>5}  {val}")

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
