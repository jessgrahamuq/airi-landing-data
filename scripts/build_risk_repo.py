"""
build_risk_repo.py
==================

Builds data/risk_repo.json for the Risk Repository sneak-preview on
airisk.mit.edu.

Source:
    Base:  app32FOUBa5WcUfEO (AI Risk Repository)
    Risks:    tbla5iOE7OXyoqi49 (AI Risk Database)
    Causal:   tblg701fQVhEQQNiC (Causal Taxonomy)
    Domains:  tbl9ZHdGZ8O4otqiy (Domain Taxonomy (Domains))
    Docs:     tbl3DhuSU2RiGB5hR (Documents)

Visualization: causal taxonomy matrix.
  Rows: 7 domains.
  Columns: 3 sections x 3 options = 9 cells.
    Entity: Human | AI | Other
    Intent: Intentional | Unintentional | Other
    Timing: Pre-deployment | Post-deployment | Other
  Cell value: % of risks in that domain assigned that category.
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


BASE_ID = "app32FOUBa5WcUfEO"
TBL_RISKS = "tbla5iOE7OXyoqi49"
TBL_CAUSAL = "tblg701fQVhEQQNiC"
TBL_DOMAINS = "tbl9ZHdGZ8O4otqiy"
TBL_DOCS = "tbl3DhuSU2RiGB5hR"

# AI Risk Database field IDs
FLD_EV_ID = "fldgjnLv6PXFiv5jp"
FLD_DESCRIPTION = "flduKQlLpCuhpUXR7"
FLD_CAUSAL_ENTITY = "fldfnYrh6BIK3s964"
FLD_CAUSAL_INTENT = "fldoT1jI8bU3DTH8H"
FLD_CAUSAL_TIMING = "fldhb7tveGss5VQqm"
FLD_DOMAIN_LINK = "fldXTV9iXXPbPENxU"
FLD_SUBDOMAIN_LINK = "fldEHH7srpAwkrljr"
FLD_DOC_LINK = "fldEiSXjLP8Kp5IFe"

# Causal Taxonomy field IDs
FLD_CAUSAL_NAME = "fldfTD4QGhwHj9K0C"

# Domain Taxonomy (Domains) field IDs
FLD_DOMAIN_CODE = "fld5Q9tnHPDr1aXTw"
FLD_DOMAIN_NAME = "fldIKzcLG6Bq1fIwc"

# Documents field IDs
FLD_DOC_QUICKREF = "fldWnwYEq0RACIb7i"

# Canonical domain order + short names + AIRI palette colors.
# Keyed by domain code so we can match regardless of exact naming.
DOMAINS = [
    {"code": "1", "short": "Discrimination & Toxicity", "color": "#A32035"},
    {"code": "2", "short": "Privacy & Security", "color": "#66C2A5"},
    {"code": "3", "short": "Misinformation", "color": "#E78AC3"},
    {"code": "4", "short": "Malicious Actors & Misuse", "color": "#FC8D62"},
    {"code": "5", "short": "Human-Computer Interaction", "color": "#8DA0CB"},
    {"code": "6", "short": "Socioeconomic & Environmental", "color": "#A6D854"},
    {"code": "7", "short": "AI System Safety, Failures & Limitations", "color": "#E5C494"},
]

# Section definitions. Each option maps causal-taxonomy-name substring(s)
# to a display label. The name check is case-insensitive "contains".
SECTIONS = [
    {
        "key": "Entity", "title": "Entity", "accent": "#66C2A5",
        "options": [
            ("Human", ["human"]),
            ("AI", ["ai"]),
            ("Other", ["other"]),
        ],
    },
    {
        "key": "Intent", "title": "Intent", "accent": "#A32035",
        "options": [
            ("Intentional", ["intentional"]),  # careful: "unintentional" contains "intentional"
            ("Unintentional", ["unintentional"]),
            ("Other", ["other"]),
        ],
    },
    {
        "key": "Timing", "title": "Timing", "accent": "#8DA0CB",
        "options": [
            ("Pre-deployment", ["pre-deployment", "pre deployment"]),
            ("Post-deployment", ["post-deployment", "post deployment"]),
            ("Other", ["other"]),
        ],
    },
]

REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "risk_repo.json"


def classify_causal(section_key, name):
    """Map a causal taxonomy record name to a display label for a section.

    Handles the unintentional/intentional substring overlap by checking the
    more specific term first.
    """
    if not name:
        return "Other"
    lower = name.lower()

    if section_key == "Intent":
        # Check "unintentional" first since "intentional" is a substring.
        if "unintentional" in lower:
            return "Unintentional"
        if "intentional" in lower:
            return "Intentional"
        return "Other"

    if section_key == "Entity":
        if "human" in lower:
            return "Human"
        # Match "AI" as whole word or start of "AI system"
        if re.search(r"\bai\b", lower):
            return "AI"
        return "Other"

    if section_key == "Timing":
        if "pre-deployment" in lower or "pre deployment" in lower:
            return "Pre-deployment"
        if "post-deployment" in lower or "post deployment" in lower:
            return "Post-deployment"
        return "Other"

    return "Other"


def build():
    print(f"Fetching causal taxonomy: {BASE_ID} / {TBL_CAUSAL}")
    causal_records = fetch_all_records(
        base_id=BASE_ID, table_id=TBL_CAUSAL,
        fields=[FLD_CAUSAL_NAME],
    )
    causal_lookup = {}
    for rec in causal_records:
        rid = rec.get("id")
        name = (rec.get("fields", {}).get(FLD_CAUSAL_NAME) or "").strip()
        if rid and name:
            causal_lookup[rid] = name
    print(f"  {len(causal_lookup)} causal records loaded")

    print(f"\nFetching domain taxonomy: {TBL_DOMAINS}")
    domain_records = fetch_all_records(
        base_id=BASE_ID, table_id=TBL_DOMAINS,
        fields=[FLD_DOMAIN_CODE, FLD_DOMAIN_NAME],
    )
    domain_lookup = {}
    for rec in domain_records:
        rid = rec.get("id")
        fields = rec.get("fields", {})
        code = (fields.get(FLD_DOMAIN_CODE) or "").strip()
        name = (fields.get(FLD_DOMAIN_NAME) or "").strip()
        if rid:
            # Normalise code to the leading digit
            m = re.match(r"^(\d+)", code)
            code_norm = m.group(1) if m else code
            domain_lookup[rid] = {"code": code_norm, "name": name}
    print(f"  {len(domain_lookup)} domain records loaded")

    print(f"\nFetching documents: {TBL_DOCS}")
    doc_records = fetch_all_records(
        base_id=BASE_ID, table_id=TBL_DOCS,
        fields=[FLD_DOC_QUICKREF],
    )
    print(f"  {len(doc_records)} documents")

    print(f"\nFetching risks: {TBL_RISKS}")
    risk_records = fetch_all_records(
        base_id=BASE_ID, table_id=TBL_RISKS,
        fields=[FLD_EV_ID, FLD_CAUSAL_ENTITY, FLD_CAUSAL_INTENT,
                FLD_CAUSAL_TIMING, FLD_DOMAIN_LINK, FLD_SUBDOMAIN_LINK,
                FLD_DOC_LINK],
    )
    print(f"  {len(risk_records)} risk records")

    # Count per domain_code and causal
    counts_by_domain = defaultdict(lambda: {
        "Entity": Counter(), "Intent": Counter(), "Timing": Counter()
    })
    total_by_domain = Counter()
    unclassified = 0

    for rec in risk_records:
        fields = rec.get("fields", {})
        domain_links = fields.get(FLD_DOMAIN_LINK) or []
        if not domain_links:
            unclassified += 1
            continue
        domain_info = domain_lookup.get(domain_links[0])
        if not domain_info:
            unclassified += 1
            continue
        code = domain_info["code"]
        total_by_domain[code] += 1

        # Resolve each causal field by looking up the linked record name
        for sec_key, field_id in [
            ("Entity", FLD_CAUSAL_ENTITY),
            ("Intent", FLD_CAUSAL_INTENT),
            ("Timing", FLD_CAUSAL_TIMING),
        ]:
            links = fields.get(field_id) or []
            if not links:
                continue
            name = causal_lookup.get(links[0])
            if not name:
                continue
            label = classify_causal(sec_key, name)
            counts_by_domain[code][sec_key][label] += 1

    # Build output domains
    domains_output = []
    for d in DOMAINS:
        code = d["code"]
        total = total_by_domain.get(code, 0)
        entry = {
            "id": code,
            "name": d["short"],
            "full_name": f"{code}. {d['short']}",
            "color": d["color"],
            "count": total,
        }
        for sec in SECTIONS:
            counter = counts_by_domain[code][sec["key"]]
            sec_total = sum(counter.values())
            cell = {}
            for label, _ in sec["options"]:
                c = counter.get(label, 0)
                pct = round((c / sec_total) * 100) if sec_total else 0
                cell[label] = pct
            entry[sec["key"]] = cell
        domains_output.append(entry)

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

    sections_output = []
    for sec in SECTIONS:
        sections_output.append({
            "key": sec["key"],
            "title": sec["title"],
            "accent": sec["accent"],
            "cols": [label for label, _ in sec["options"]],
        })

    output = {
        "meta": {
            "dataset": "risk_repo",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"Airtable {BASE_ID} / AI Risk Database",
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
            cells = [f"{d[sec['key']][lab]}%" for lab, _ in sec["options"]]
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
