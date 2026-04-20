"""
build_risk_repo.py
==================

Builds data/risk_repo.json for the Risk Repository sneak-preview on
airisk.mit.edu.

Source:
    Base:     appar7oH57j6jPX1m (The AI Risk Repository Database (AddEv))
    Risks:    tbla5iOE7OXyoqi49 (AI Risk Database v3)
    Docs:     tbl3DhuSU2RiGB5hR (Included resources)

Visualization: causal taxonomy matrix.
  Rows: 7 domains.
  Columns: 3 sections x 3 options = 9 cells.
    Entity: Human | AI | Other
    Intent: Intentional | Unintentional | Other
    Timing: Pre-deployment | Post-deployment | Other
  Cell value: % of risks in that domain assigned that category.

Output shape:

    {
      "meta": {...},
      "sections": [
        {"key": "Entity", "title": "Entity",
         "cols": ["Human", "AI", "Other"], "accent": "#66C2A5"},
        ...
      ],
      "domains": [
        {
          "id": "1", "name": "Discrimination & Toxicity",
          "full_name": "1. Discrimination & Toxicity",
          "color": "#A32035", "count": 217,
          "Entity": {"Human": 10, "AI": 61, "Other": 10},
          "Intent": {"Intentional": 5, "Unintentional": 46, "Other": 31},
          "Timing": {"Pre-deployment": 9, "Post-deployment": 57, "Other": 15}
        }
      ]
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
from _airtable import fetch_all_records  # noqa: E402


BASE_ID = "appar7oH57j6jPX1m"
TBL_RISKS = "tbla5iOE7OXyoqi49"
TBL_DOCS = "tbl3DhuSU2RiGB5hR"

# AI Risk Database v3 field IDs
FLD_EV_ID = "fldgjnLv6PXFiv5jp"
FLD_DOMAIN = "fld4KUGmHw0W4KPHi"
FLD_SUBDOMAIN = "fldZGLiUBsjf16bk4"
FLD_ENTITY = "fld4V1M1d03VLqVEf"
FLD_INTENT = "fldgEbSUYicqvxgvF"
FLD_TIMING = "fldCzBCW75MHdOhAf"
FLD_CATEGORY_LEVEL = "fld4TkUpptKPzJfOB"

# Included resources field IDs
FLD_DOC_QUICKREF = "fldWnwYEq0RACIb7i"

# Canonical domain order + short names + AIRI palette colors
DOMAINS = [
    {"id": "1", "canonical": "1. Discrimination & Toxicity",
     "short": "Discrimination & Toxicity", "color": "#A32035"},
    {"id": "2", "canonical": "2. Privacy & Security",
     "short": "Privacy & Security", "color": "#66C2A5"},
    {"id": "3", "canonical": "3. Misinformation",
     "short": "Misinformation", "color": "#E78AC3"},
    {"id": "4", "canonical": "4. Malicious Actors & Misuse",
     "short": "Malicious Actors & Misuse", "color": "#FC8D62"},
    {"id": "5", "canonical": "5. Human-Computer Interaction",
     "short": "Human-Computer Interaction", "color": "#8DA0CB"},
    {"id": "6", "canonical": "6. Socioeconomic and Environmental",
     "short": "Socioeconomic & Environmental", "color": "#A6D854"},
    {"id": "7", "canonical": "7. AI System Safety, Failure, & Limitations",
     "short": "AI System Safety, Failures & Limitations", "color": "#E5C494"},
]

# Section definitions.  Each section has an internal key (used in Airtable
# select option names), a display column label, and an AIRI accent color.
SECTIONS = [
    {
        "key": "Entity",
        "title": "Entity",
        "accent": "#66C2A5",  # Privacy teal
        "options": [
            ("1 - Human", "Human"),
            ("2 - AI", "AI"),
            ("3 - Other", "Other"),
        ],
    },
    {
        "key": "Intent",
        "title": "Intent",
        "accent": "#A32035",  # Discrimination red
        "options": [
            ("1 - Intentional", "Intentional"),
            ("2 - Unintentional", "Unintentional"),
            ("3 - Other", "Other"),
        ],
    },
    {
        "key": "Timing",
        "title": "Timing",
        "accent": "#8DA0CB",  # HCI blue
        "options": [
            ("1 - Pre-deployment", "Pre-deployment"),
            ("2 - Post-deployment", "Post-deployment"),
            ("3 - Other", "Other"),
        ],
    },
]

REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "risk_repo.json"


def normalise_domain(raw):
    """Map Airtable singleSelect text to canonical id / entry."""
    if not raw:
        return None
    raw = str(raw).strip()
    for d in DOMAINS:
        if raw == d["canonical"]:
            return d
        # Fuzzy leading-digit fallback
        m = re.match(r"^(\d)\.", raw)
        if m and d["canonical"].startswith(m.group(1) + "."):
            return d
    return None


def build():
    print(f"Fetching risks: {BASE_ID} / {TBL_RISKS}")
    risk_records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TBL_RISKS,
        fields=[FLD_EV_ID, FLD_DOMAIN, FLD_SUBDOMAIN,
                FLD_ENTITY, FLD_INTENT, FLD_TIMING,
                FLD_CATEGORY_LEVEL],
    )
    print(f"  fetched {len(risk_records)} risk records")

    # Doc count for footer string
    print(f"\nFetching documents: {TBL_DOCS}")
    doc_records = fetch_all_records(
        base_id=BASE_ID, table_id=TBL_DOCS,
        fields=[FLD_DOC_QUICKREF],
    )
    print(f"  fetched {len(doc_records)} documents")

    # Per-domain counters for each section
    # counts_by_domain[domain_id] = {"Entity": Counter, "Intent": Counter, ...}
    counts_by_domain = defaultdict(lambda: {
        "Entity": Counter(), "Intent": Counter(), "Timing": Counter()
    })
    total_by_domain = Counter()
    unclassified = 0

    for rec in risk_records:
        fields = rec.get("fields", {})
        domain_raw = fields.get(FLD_DOMAIN)
        domain = normalise_domain(domain_raw)
        if not domain:
            unclassified += 1
            continue

        domain_id = domain["id"]
        total_by_domain[domain_id] += 1

        # Assign each causal field value (may be missing -> no increment).
        # Unrecognized values fold into the "Other" bucket of that section.
        for sec in SECTIONS:
            field_id = {"Entity": FLD_ENTITY,
                        "Intent": FLD_INTENT,
                        "Timing": FLD_TIMING}[sec["key"]]
            raw = fields.get(field_id)
            if not raw:
                continue
            # Drop the placeholder header rows which re-use the field name
            # as a value (the Airtable select has these as option 0).
            if raw in ("Entity", "Intent", "Timing"):
                continue

            mapped = None
            for option_name, label in sec["options"]:
                if raw == option_name:
                    mapped = label
                    break
            if mapped is None:
                # "4 - Not coded" or any weird value -> Other
                mapped = "Other"
            counts_by_domain[domain_id][sec["key"]][mapped] += 1

    # Build output domains
    domains_output = []
    for d in DOMAINS:
        did = d["id"]
        total = total_by_domain.get(did, 0)
        entry = {
            "id": did,
            "name": d["short"],
            "full_name": d["canonical"],
            "color": d["color"],
            "count": total,
        }
        for sec in SECTIONS:
            counter = counts_by_domain[did][sec["key"]]
            sec_total = sum(counter.values())
            cell = {}
            for _, label in sec["options"]:
                c = counter.get(label, 0)
                pct = round((c / sec_total) * 100) if sec_total else 0
                cell[label] = pct
            entry[sec["key"]] = cell
        domains_output.append(entry)

    # Interpretation
    total_risks = sum(d["count"] for d in domains_output)
    top = max(domains_output, key=lambda d: d["count"]) if domains_output else None
    parts = [
        f"The Repository catalogues {total_risks:,} risks extracted from "
        f"{len(doc_records)} source documents, mapped to a 7-domain taxonomy "
        f"and coded on three causal dimensions.",
    ]
    if top:
        parts.append(
            f"{top['name']} is the most represented domain "
            f"with {top['count']} catalogued risks."
        )
    interpretation = " ".join(parts)

    # Sections for the widget
    sections_output = []
    for sec in SECTIONS:
        sections_output.append({
            "key": sec["key"],
            "title": sec["title"],
            "accent": sec["accent"],
            "cols": [label for _, label in sec["options"]],
        })

    output = {
        "meta": {
            "dataset": "risk_repo",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"Airtable {BASE_ID} / AI Risk Database v3",
            "record_count": total_risks,
            "document_count": len(doc_records),
            "domain_count": len(domains_output),
            "interpretation_title": "A mapped taxonomy of AI risks",
            "interpretation": interpretation,
            "cta_url": "https://airisk.mit.edu/ai-risk-repository",
            "cta_label": "Explore the Repository \u2192",
        },
        "sections": sections_output,
        "domains": domains_output,
    }

    print("\nBuild summary:")
    print(f"  risks fetched:    {len(risk_records)}")
    print(f"  classified:       {total_risks}")
    print(f"  unclassified:     {unclassified}")
    print(f"  documents:        {len(doc_records)}")
    print(f"  domains:          {len(domains_output)}")
    print("\n  by domain:")
    for d in domains_output:
        print(f"    {d['count']:>5}  {d['name']}")
        for sec in SECTIONS:
            cells = [f"{d[sec['key']][lab]}%" for _, lab in sec["options"]]
            print(f"           {sec['key']:<8} " + " | ".join(cells))

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
