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
    Taxonomy: tbl0HE3lEEmyHhcFr (MitigationTaxonomy)
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
          {"name": "...", "definition": "...", "source": "Bengio 2025", "url": "..."}
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
TBL_TAXONOMY = "tbl0HE3lEEmyHhcFr"
TBL_MITIGATIONS = "tblZRKlssxugpZAfr"
TBL_DOCUMENTS = "tbleVxrlfEZvuFBJI"

# MitigationTaxonomy field IDs
FLD_TAX_CODE = "fldVFtTPbBCY7li1Q"
FLD_TAX_NAME = "fldGd3FJtVyRWOLWG"
FLD_TAX_DESC = "fldAOXJeRBY5GVXIV"
FLD_TAX_PARENT = "fldPCFKWGi4jAKuSA"
FLD_TAX_CHILDREN = "fld8BZXiKNVGkga0y"

# SysRev_MitigationDatabase field IDs
FLD_MIT_NAME = "fldiyzQ7077CdlIkz"
FLD_MIT_DEFINITION = "fldsznGxvHRriPqnj"
FLD_MIT_SOURCE = "fld830Pz8KFM2rvH3"
FLD_MIT_TAX_PRIMARY = "fldW9EqhIJdfqGRiu"
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
        fields=[FLD_TAX_CODE, FLD_TAX_NAME, FLD_TAX_DESC,
                FLD_TAX_PARENT, FLD_TAX_CHILDREN],
    )
    print(f"  fetched {len(tax_records)} taxonomy records")

    # Build taxonomy lookup: rec_id -> { code, name, parent_id, children_ids }
    taxonomy = {}
    for rec in tax_records:
        rec_id = rec.get("id")
        fields = rec.get("fields", {})
        parent_links = fields.get(FLD_TAX_PARENT) or []
        children_links = fields.get(FLD_TAX_CHILDREN) or []
        taxonomy[rec_id] = {
            "id": rec_id,
            "code": (fields.get(FLD_TAX_CODE) or "").strip(),
            "name": (fields.get(FLD_TAX_NAME) or "").strip(),
            "description": (fields.get(FLD_TAX_DESC) or "").strip(),
            "parent_id": parent_links[0] if parent_links else None,
            "children_ids": list(children_links),
        }

    # Identify top-level categories (no parent)
    top_categories = [t for t in taxonomy.values() if not t["parent_id"]]
    # Sort by code numerically if possible, else by name
    def sort_key(t):
        code = t["code"]
        try:
            return (0, float(code))
        except (TypeError, ValueError):
            return (1, code.lower())
    top_categories.sort(key=sort_key)
    print(f"  identified {len(top_categories)} top-level categories")

    # Fetch all documents so we can attach source info
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

        # Build a short reference like "Bengio 2025"
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

    # Fetch all mitigations
    print(f"\nFetching mitigations: {TBL_MITIGATIONS}")
    mit_records = fetch_all_records(
        base_id=BASE_ID,
        table_id=TBL_MITIGATIONS,
        fields=[FLD_MIT_NAME, FLD_MIT_DEFINITION, FLD_MIT_SOURCE,
                FLD_MIT_TAX_PRIMARY, FLD_MIT_AILIFECYCLE, FLD_MIT_AIACTOR,
                FLD_MIT_AIRM],
    )
    print(f"  fetched {len(mit_records)} mitigations")

    # Count mitigations per taxonomy category
    counts_by_category = Counter()
    candidates_by_category = defaultdict(list)
    unclassified = 0

    for rec in mit_records:
        fields = rec.get("fields", {})
        tax_links = fields.get(FLD_MIT_TAX_PRIMARY) or []
        if not tax_links:
            unclassified += 1
            continue
        tax_id = tax_links[0]
        if tax_id not in taxonomy:
            unclassified += 1
            continue

        # Count for this category AND every ancestor (so parents inherit counts)
        current_id = tax_id
        while current_id:
            counts_by_category[current_id] += 1
            current_id = taxonomy[current_id]["parent_id"]

        # Collect as candidate for THIS specific category (not rolled up)
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

    # Build output structure
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
        # Collect direct children only (one level deep)
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

    # Top mitigations per category (for the modal)
    mitigations_by_category = {}
    for cat_id, items in candidates_by_category.items():
        # Drop items without source URLs for public display
        with_source = [it for it in items if it["source"] and it["source"].get("url")]
        # Sort alphabetically by name
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
    total_mits = sum(1 for rec in mit_records)
    top_cat = max(top_cats_output, key=lambda c: c["count"], default=None)
    interpretation_title = "A catalogued landscape of AI risk mitigations"
    parts = [
        f"The database has catalogued {total_mits:,} mitigation actions "
        f"across {len(top_cats_output)} top-level categories "
        f"drawn from {len(doc_records)} source documents.",
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
            "record_count": total_mits,
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
    print(f"  mitigations in:       {total_mits}")
    print(f"  unclassified:         {unclassified}")
    print(f"  taxonomy records:     {len(tax_records)}")
    print(f"  top-level categories: {len(top_cats_output)}")
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
