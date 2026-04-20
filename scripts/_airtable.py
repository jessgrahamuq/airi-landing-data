"""
Shared Airtable client helpers.

Usage:
    from _airtable import fetch_all_records

    records = fetch_all_records(
        base_id="appXXXXXXXXXXXXXX",
        table_id="tblXXXXXXXXXXXXXX",
        fields=["fldA", "fldB"],
    )

Env:
    AIRTABLE_TOKEN: Personal Access Token with `data.records:read` scope on the
                    target base(s). Set in GitHub Secrets as AIRTABLE_TOKEN.
"""
from __future__ import annotations

import os
import time
from typing import Iterator

import requests


API_ROOT = "https://api.airtable.com/v0"
PAGE_SIZE = 100  # Airtable max
RATE_LIMIT_PAUSE_SECONDS = 0.25  # stay under 5 req/sec


def _token() -> str:
    token = os.environ.get("AIRTABLE_TOKEN")
    if not token:
        raise RuntimeError(
            "AIRTABLE_TOKEN not set. For local dev, export it; "
            "for CI, set it as a repository secret."
        )
    return token


def fetch_all_records(
    base_id: str,
    table_id: str,
    fields: list[str] | None = None,
    view: str | None = None,
) -> list[dict]:
    """
    Fetch all records from a table, handling pagination.

    Passing `fields` (list of field IDs) restricts the payload — strongly
    recommended for large tables to keep builds fast and cheap.

    Returns a list of Airtable record dicts: {"id": "rec...", "fields": {...}}.
    """
    url = f"{API_ROOT}/{base_id}/{table_id}"
    headers = {"Authorization": f"Bearer {_token()}"}
    params: dict = {"pageSize": PAGE_SIZE, "returnFieldsByFieldId": "true"}
    if fields:
        params["fields[]"] = fields
    if view:
        params["view"] = view

    records: list[dict] = []
    offset: str | None = None
    while True:
        if offset:
            params["offset"] = offset
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        payload = resp.json()
        records.extend(payload.get("records", []))
        offset = payload.get("offset")
        if not offset:
            break
        time.sleep(RATE_LIMIT_PAUSE_SECONDS)
    return records


def iter_fields(records: list[dict]) -> Iterator[dict]:
    """Yield just the `fields` dict of each record, in order."""
    for rec in records:
        yield rec.get("fields", {})
