# CLAUDE.md — AIRI Landing Data Pipeline

This document is the contract. It defines the shape, conventions, and guardrails for the pipeline that feeds the airisk.mit.edu landing page visualizations. When extending this repo — whether you're a human dev, a UROP onboarding, or an AI assistant — read this first.

## Purpose

This repo exists to decouple the landing page visualizations from Airtable. Widgets on the site fetch static JSON files from a CDN. Those JSON files are produced by deterministic transform scripts that read from Airtable on a schedule. Editing happens in Airtable (data) or in this repo (transforms, interpretation copy).

The core principle: **the source data shape and the visualization data shape are different, and that's fine.** Transform scripts bridge them. Don't make the widget consume Airtable directly; don't make editors shape their data for a widget.

## Architecture

```
┌─────────────┐
│  Airtable   │  team edits here
└──────┬──────┘
       │ pulled daily (06:00 UTC) by GitHub Action
       │ or on-demand via workflow_dispatch
       ▼
┌───────────────────────────────────┐
│ airi-landing-data (this repo)     │
│  scripts/build_*.py               │  one per dataset
│  data/*.json                      │  committed output
│  .github/workflows/sync.yml       │
└──────┬────────────────────────────┘
       │ auto-deploy on push to main
       ▼
┌─────────────────────────────────────┐
│ Cloudflare Pages                    │
│ airi-landing-data.pages.dev/data/*  │
└──────┬──────────────────────────────┘
       │ fetched at page load
       ▼
┌────────────────────┐
│ Webflow widgets    │
└────────────────────┘
```

## Repo layout

```
airi-landing-data/
├── README.md                     human-facing overview
├── CLAUDE.md                     this file
├── _headers                      Cloudflare Pages CORS + cache config
├── scripts/
│   ├── requirements.txt
│   ├── _airtable.py              shared Airtable client helpers
│   ├── build_incidents.py        pilot
│   ├── build_risk_repo.py        (tbd)
│   ├── build_delphi.py           (tbd)
│   ├── build_mitigations.py      (tbd)
│   └── build_governance.py       (tbd)
├── data/
│   ├── incidents.json
│   └── ...
└── .github/workflows/
    └── sync.yml
```

## JSON schema — the contract every widget relies on

Every JSON file in `/data/` must have this top-level shape:

```json
{
  "meta": {
    "dataset": "incidents",
    "last_updated": "2026-04-20T06:00:00Z",
    "source": "Airtable appYXeL8YwZfAy4kF / Classifications for export",
    "record_count": 487,
    "interpretation": "Reports of AI incidents have risen sharply since 2023, with the largest share falling in the Misinformation and Malicious Use domains.",
    "interpretation_title": "Incident reports are growing fastest in misinformation",
    "cta_url": "https://airisk.mit.edu/ai-incident-tracker",
    "cta_label": "Explore the tracker →"
  },
  "chart": { ... dataset-specific shape ... }
}
```

**Rules about `meta`:**
- `dataset` — snake_case identifier matching the filename
- `last_updated` — ISO 8601 UTC, set at build time
- `source` — human-readable provenance; what table / base / file
- `record_count` — rows after filtering, not the total Airtable rows
- `interpretation` — the paragraph shown next to the chart in Webflow. **This is editorial copy.** Keep it short (max ~300 characters), factual, and reflect the current state of the data. If the chart updates and the interpretation becomes misleading, that is a bug.
- `interpretation_title` — optional; the heading above the interpretation
- `cta_url`, `cta_label` — link shown at the bottom of the panel

**Rules about `chart`:**
- Shape is visualization-specific. Document the shape in a comment at the top of each build script.
- Prefer flat structures where possible. Don't nest more than 2-3 levels deep.
- Use string keys for categorical labels and numeric keys only when they're actually numeric (years, counts).
- Colors should be referenced by semantic name (`"domain_misinformation"`), not hex. The widget owns the color mapping.

## Build script conventions

Every `build_<dataset>.py` must:

1. Be runnable standalone: `python scripts/build_incidents.py` produces `data/incidents.json`.
2. Read Airtable credentials from `AIRTABLE_TOKEN` env var. No tokens in code.
3. Be idempotent: running twice in a row with the same input produces the same output (no timestamps other than `meta.last_updated`, no random IDs, stable sort order).
4. Fail loudly on schema drift. If a required field is missing or renamed, raise — don't silently produce empty output.
5. Apply data quality filters explicitly and document them in a module-level docstring. Common filters: "status = Validated", "year >= 2018", "drop rows with null domain".
6. Write output to `data/<dataset>.json` using `json.dumps(..., indent=2, sort_keys=False)`.
7. Print a summary to stdout: rows in, rows out, rows dropped and why.

Use `scripts/_airtable.py` for the shared client. Don't re-implement pagination in every script.

## Adding a new dataset

1. Write `scripts/build_<dataset>.py` following the conventions above.
2. Document the JSON shape in the script's module docstring.
3. Run it locally. Inspect `data/<dataset>.json` by eye.
4. Commit both the script and the generated JSON.
5. Add the dataset to the sync workflow (`.github/workflows/sync.yml`).
6. Add an entry to the dataset table in `README.md`.

## Airtable conventions

- Reference fields by **ID** (`fldXXXXXXXXXXXXXX`), not by name. Field names drift; IDs don't.
- When a field is computed in Airtable (formula, rollup), read its value from the API response — don't try to re-derive it in Python.
- `lastModifiedTime` fields are useful for sanity checks ("did anyone edit this base since the last sync?") but should not gate sync decisions; always do a full rebuild.

## Handling stale data gracefully

Widgets must render even if the JSON is stale or unavailable. In the Webflow widget code:
- Always wrap `fetch()` in try/catch.
- On failure, render the interpretation text only, with a muted "Data temporarily unavailable" indicator where the chart would be.
- Never fail silently. A blank chart with no explanation is worse than a visible fallback.

## Scheduling

Default schedule: **daily at 06:00 UTC** (in `sync.yml`). That's 16:30 Adelaide time — late afternoon, well after anyone editing Airtable in the morning.

If you change the schedule, document why in the workflow file.

## Caching

See `_headers`. Currently:
- JSON files cached for 5 minutes at the edge
- `stale-while-revalidate=3600` so a stale copy serves while revalidating
- CORS open (`Access-Control-Allow-Origin: *`) so Webflow can fetch across origins

A manual workflow run triggers redeployment, which purges edge caches.

## Failure modes to watch for

- **Airtable renames a field.** The script will KeyError. This is the desired behavior — fail fast. Fix: update the field ID in the script.
- **A record has an unexpected value** (e.g. a Domain that isn't in the taxonomy). Log a warning, bucket into "Other", continue.
- **The Airtable API is down.** The Action will fail; the previous JSON continues to serve from the CDN. No site impact.
- **Interpretation text references a stat that's no longer true.** This is a content bug, not a pipeline bug. Catch it in PR review.

## What this repo is not

- Not a CMS. Editors who don't want to touch a JSON file should edit the Airtable source, not this repo.
- Not a caching layer for live Airtable queries. The CDN is the only thing widgets talk to.
- Not a place to store widget code. The Webflow page holds that; this repo only produces data.
- Not a public dataset distribution mechanism. The JSON files are shaped for specific visualizations and are not suitable as a general API.
