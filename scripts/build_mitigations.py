"""
build_mitigations.py
====================

Builds data/mitigations.json for the Mitigations sneak-preview on airisk.mit.edu.

Visualization: 2-level drill-down donut.
  Layer 1: top-level mitigation taxonomy categories, sized by count.
  Layer 2: children of the clicked category, same donut re-rendered.
  Click a leaf: modal listing specific mitigations with source docs.

Source:
    Base:  appUJl8KRAUMeIVXs  (AI Risk Mitigation Database)
    Taxonomy: tblj4yMDyNG0jlJAq (SysRev_MitTaxonomy)
    Mitigations: tblZRKlssxugpZAfr (SysRev_MitigationDatabase)
    Documents: tbleVxrlfEZvuFBJI (SysRev_Documents)

Output shape:

    {
      "meta": {...},
      "taxonomy": {
        "top_categories": [
          {"id": "rec...", "code": "1", "name": "Governance", "count": 147, "children_count": 8}
        ],
        "children_by_parent": {
          "rec...": [
            {"id": "rec...", "code": "1.1", "name": "Board structure", "count": 23}
          ]
        }
      },
      "mitigations_by_category": {
        "rec...": [
          {"name": "...", "definition": "...", "source_ref": "Bengio 2025", "url": "..."}
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

sys.path.insert(0, str(Path(__file__).parent))
from _airtable import fetch_all_records, iter_fields  # noqa: E402


BASE_ID = "appUJl8KRAUMeIVXs"
TBL_TAXONOMY = "tblj4yMDyNG0jlJAq"   # SysRev_MitTaxonomy (correct linked table)
TBL_MITIGATIONS = "tblZRKlssxugpZAfr"
TBL_DOCUMENTS = "tbleVxrlfEZvuFBJI"

# SysRev_MitTaxonomy field IDs
FLD_TAX_CODE = "fldZgIhbdNwy9cXYU"       # Code (singleLineText)
FLD_TAX_NAME = "fld0IFojmxOLEytNP"       # Name (singleLineText)
FLD_TAX_DEFINITION = "fldIZSWZhKNeac3ie"  # Definition (multilineText)
FLD_TAX_LEVEL = "fldaY7h4NdTkPvpnj"       # Level (number: 1=top, 2=sub, 3=leaf)
FLD_TAX_PARENT_TEXT = "fldrism21rQnuHtbP" # Parent (singleLineText, code reference)
FLD_TAX_PARENT_LINK = "fldXDAhgxcYdwboYl" # Parent_Link (multipleRecordLinks)
FLD_TAX_CHILDREN_LINK = "fld4rhIaN9pAJEswr" # Child_Link (multipleRecordLinks)

# SysRev_MitigationDatabase field IDs
FLD_MIT_NAME = "fldiyzQ7077CdlIkz"
FLD_MIT_DEFINITION = "fldsznGxvHRriPqnj"
FLD_MIT_SOURCE = "fld830Pz8KFM2rvH3"
FLD_MIT_TAX_PRIMARY = "fldW9EqhIJdfqGRiu"   # MitigationTax_Primary -> SysRev_MitTaxonomy
FLD_MIT_AILIFECYCLE = "fldz7u54ojipVOPcK"
FLD_MIT_AIACTOR = "fldG0Z0Jh7oh2l3bm"
FLD_MIT_AIRM = "fldroRjbRhJzpzPur"

# SysRev_Documents field IDs
FLD_DOC_TITLE = "fldQKV30Bg2vO5CMh"
FLD_DOC_FIRST_AUTHOR = "fldO6xajmOM3QSwHw"
FLD_DOC_YEAR = "fld63Cwa0dlGqAjLY"
FLD_DOC_URL = "fldiXV7F88qhlUNqI"
FLD_DOC_SOURCE_ID = "flddbxYII6GAVVA7h"

TOP_MITIGATIONS_PER_CATEGORY = 5

REPO_ROOT = Path(__file__).parent.parent
OUTPUT_PATH = REPO_ROOT / "data" / "mitigations.json"


def truncate(t, max_len=140):
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
    print(f"Fetching taxonomy from Airtable: {BASE_ID} / {TBL_TAXONOMY}")
    tax_records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TBL_TAXONOMY,
        fields=[FLD_TAX_CODE, FLD_TAX_NAME, FLD_TAX_DEFINITION,
                FLD_TAX_LEVEL, FLD_TAX_PARENT_LINK, FLD_TAX_CHILDREN_LINK],
    )
    print(f"  fetched {len(tax_records)} taxonomy records")

    # Build taxonomy lookup
    taxonomy = {}
    for rec in tax_records:
        rec_id = rec.get("id")
        fields = rec.get("fields", {})
        parent_links = fields.get(FLD_TAX_PARENT_LINK) or []
        children_links = fields.get(FLD_TAX_CHILDREN_LINK) or []
        taxonomy[rec_id] = {
            "id": rec_id,
            "code": (fields.get(FLD_TAX_CODE) or "").strip(),
            "name": (fields.get(FLD_TAX_NAME) or "").strip(),
            "definition": (fields.get(FLD_TAX_DEFINITION) or "").strip(),
            "level": fields.get(FLD_TAX_LEVEL),
            "parent_id": parent_links[0] if parent_links else None,
            "children_ids": list(children_links),
        }

    # Identify top-level categories using Level=1
    top_categories = [t for t in taxonomy.values() if t["level"] == 1]
    # Fallback: if no records have level=1, use records with no parent
    if not top_categories:
        top_categories = [t for t in taxonomy.values() if not t["parent_id"]]

    def sort_key(t):
        code = t["code"]
        try:
            return (0, float(code))
        except (TypeError, ValueError):
            return (1, code.lower())
    top_categories.sort(key=sort_key)
    print(f"  identified {len(top_categories)} top-level categories:")
    for t in top_categories:
        print(f"    [{t['code']}]  {t['name']}  "
              f"({len(t['children_ids'])} children)")

    # Fetch documents
    print(f"\nFetching documents: {TBL_DOCUMENTS}")
    doc_records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TBL_DOCUMENTS,
        fields=[FLD_DOC_TITLE, FLD_DOC_FIRST_AUTHOR, FLD_DOC_YEAR,
                FLD_DOC_URL, FLD_DOC_SOURCE_ID],
    )
    print(f"  fetched {len(doc_records)} documents")

    documents = {}
    for rec in doc_records:
        rec_id = rec.get("id")
        fields = rec.get("fields", {})
        title = (fields.get(FLD_DOC_TITLE) or "").strip()
        first_author = (fields.get(FLD_DOC_FIRST_AUTHOR) or "").strip()
        year = fields.get(FLD_DOC_YEAR)
        url = (fields.get(FLD_DOC_URL) or "").strip() or None
        source_id = (fields.get(FLD_DOC_SOURCE_ID) or "").strip()

        if first_author and year:
            short_ref = f"{first_author.split(',')[0].split()[-1]} {int(year)}"
        elif source_id:
            short_ref = source_id
        else:
            short_ref = title[:40] if title else "Unknown"
        documents[rec_id] = {
            "title": title,
            "short_ref": short_ref,
            "url": url,
        }

    # Fetch mitigations
    print(f"\nFetching mitigations: {TBL_MITIGATIONS}")
    mit_records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TBL_MITIGATIONS,
        fields=[FLD_MIT_NAME, FLD_MIT_DEFINITION, FLD_MIT_SOURCE,
                FLD_MIT_TAX_PRIMARY, FLD_MIT_AILIFECYCLE, FLD_MIT_AIACTOR,
                FLD_MIT_AIRM],
    )
    print(f"  fetched {len(mit_records)} mitigations")

    counts_by_category = Counter()
    candidates_by_category = defaultdict(list)
    unclassified = 0
    tax_link_missing_from_taxonomy = 0

    for rec in mit_records:
        fields = rec.get("fields", {})
        tax_links = fields.get(FLD_MIT_TAX_PRIMARY) or []
        if not tax_links:
            unclassified += 1
            continue
        tax_id = tax_links[0]
        if tax_id not in taxonomy:
            tax_link_missing_from_taxonomy += 1
            continue

        # Count for this category AND every ancestor (so parents inherit counts)
        current_id = tax_id
        while current_id:
            counts_by_category[current_id] += 1
            current_id = taxonomy[current_id]["parent_id"]

        # Collect as candidate for THIS specific category
        name = truncate(fields.get(FLD_MIT_NAME))
        if not name:
            continue
        source_links = fields.get(FLD_MIT_SOURCE) or []
        source = None
        if source_links and source_links[0] in documents:
            source = documents[source_links[0]]
        definition = truncate(fields.get(FLD_MIT_DEFINITION), max_len=200)

        candidates_by_category[tax_id].append({
            "name": name,
            "definition": definition,
            "source": source,
            "lifecycle": fields.get(FLD_MIT_AILIFECYCLE),
            "actor": fields.get(FLD_MIT_AIACTOR),
        })

    # Build output
    top_cats_output = []
    children_by_parent = {}
    for top in top_categories:
        top_cats_output.append({
            "id": top["id"],
            "code": top["code"],
            "name": top["name"],
            "count": counts_by_category.get(top["id"], 0),
            "children_count": len(top["children_ids"]),
        })
        kids = []
        for kid_id in top["children_ids"]:
            if kid_id not in taxonomy:
                continue
            k = taxonomy[kid_id]
            kids.append({
                "id": k["id"],
                "code": k["code"],
                "name": k["name"],
                "count": counts_by_category.get(k["id"], 0),
            })
        kids.sort(key=lambda x: (-x["count"], x["code"]))
        children_by_parent[top["id"]] = kids

    # Top mitigations per category
    mitigations_by_category = {}
    for cat_id, items in candidates_by_category.items():
        with_source = [it for it in items if it["source"] and it["source"].get("url")]
        with_source.sort(key=lambda x: x["name"].lower())
        top = with_source[:TOP_MITIGATIONS_PER_CATEGORY]
        cleaned = []
        for it in top:
            cleaned.append({
                "name": it["name"],
                "definition": it["definition"],
                "source_ref": it["source"]["short_ref"] if it["source"] else None,
                "source_title": it["source"]["title"] if it["source"] else None,
                "url": it["source"]["url"] if it["source"] else None,
            })
        mitigations_by_category[cat_id] = cleaned

    # Interpretation copy
    total_mits = len(mit_records)
    classified = total_mits - unclassified - tax_link_missing_from_taxonomy
    top_cat = max(top_cats_output, key=lambda c: c["count"], default=None)
    interpretation_title = "A catalogued landscape of AI risk mitigations"
    parts = [
        f"The database has catalogued {classified:,} classified "
        f"mitigation actions across {len(top_cats_output)} top-level categories "
        f"drawn from {len(doc_records)} source documents."
    ]
    if top_cat and top_cat["count"] > 0:
        parts.append(
            f"{top_cat['name']} is the most heavily researched area "
            f"with {top_cat['count']} actions catalogued."
        )
    interpretation = " ".join(parts)

    output = {
        "meta": {
            "dataset": "mitigations",
            "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source": f"Airtable {BASE_ID} / SysRev_MitigationDatabase",
            "record_count": classified,
            "record_count_total": total_mits,
            "top_level_count": len(top_cats_output),
            "document_count": len(doc_records),
            "interpretation_title": interpretation_title,
            "interpretation": interpretation,
            "cta_url": "https://airisk.mit.edu/ai-risk-mitigations",
            "cta_label": "Explore the database \u2192",
        },
        "taxonomy": {
            "top_categories": top_cats_output,
            "children_by_parent": children_by_parent,
        },
        "mitigations_by_category": mitigations_by_category,
    }

    # Summary
    print("\nBuild summary:")
    print(f"  mitigations fetched:      {total_mits}")
    print(f"  classified:               {classified}")
    print(f"  no taxonomy link:         {unclassified}")
    print(f"  link to missing taxonomy: {tax_link_missing_from_taxonomy}")
    print(f"  taxonomy records:         {len(tax_records)}")
    print(f"  top-level categories:     {len(top_cats_output)}")
    print("\n  top categories by count:")
    for c in sorted(top_cats_output, key=lambda x: -x["count"]):
        kids = len(children_by_parent.get(c["id"], []))
        print(f"    {c['count']:>5}  [{c['code']}]  {c['name']}  "
              f"({kids} children)")

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
