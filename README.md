# airi-landing-data

Pipeline that turns AIRI Airtable sources into static JSON files consumed by interactive visualizations on [airisk.mit.edu](https://airisk.mit.edu).

## What this repo does

```
Airtable  →  GitHub Action (daily)  →  /data/*.json  →  Cloudflare Pages CDN  →  Webflow widgets
```

Each dataset has one `scripts/build_<dataset>.py` that pulls from Airtable, transforms the records into the exact shape its visualization needs, and writes a JSON file into `/data/`. The JSON files are committed to the repo (so we have a free audit trail) and served via Cloudflare Pages.

## Datasets

| Dataset | Source | Build script | Output |
|---|---|---|---|
| Incidents | Airtable `appYXeL8YwZfAy4kF` → `Classifications for export` | `build_incidents.py` | `data/incidents.json` |
| Risk Repository | _(pending)_ | `build_risk_repo.py` | `data/risk-repo.json` |
| Delphi | _(pending — likely static)_ | `build_delphi.py` | `data/delphi.json` |
| Mitigations | _(pending)_ | `build_mitigations.py` | `data/mitigations.json` |
| Governance | _(pending)_ | `build_governance.py` | `data/governance.json` |

## How to update the data

**If you edit a source Airtable:** do nothing. The daily sync will pick it up within 24 hours. If you need it live sooner, go to the Actions tab and run the `sync` workflow manually.

**If you need to change what a visualization shows** (e.g. group by a different field, filter different rows, update the interpretation text): edit the transform script. Open a PR. See `CLAUDE.md` for the shape each JSON must have.

**If you need to change the interpretation text** (the paragraph shown next to the chart in Webflow): it lives in the JSON under `meta.interpretation`. Update it in the transform script and open a PR. This keeps editorial copy under version control alongside the data.

## Local development

```bash
pip install -r scripts/requirements.txt
export AIRTABLE_TOKEN=<your-pat>
python scripts/build_incidents.py
```

Output goes to `data/incidents.json`. Diff against the committed version to confirm your change.

## Deploying

Pushes to `main` auto-deploy to Cloudflare Pages. The JSON files are served from:

```
https://airi-landing-data.pages.dev/data/incidents.json
https://airi-landing-data.pages.dev/data/risk-repo.json
...
```

A custom domain (e.g. `data.airisk.mit.edu`) can be added later via Cloudflare Pages → Custom Domains.

## Contributing

See `CLAUDE.md` for the full contract. The short version: one script per dataset, one JSON per dataset, transforms are deterministic and idempotent, interpretation text lives in the JSON.
