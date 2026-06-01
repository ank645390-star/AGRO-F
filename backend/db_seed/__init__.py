"""
db_seed package — auto-import production-grade content into MongoDB
when the collection is empty.

How it works
------------
On every backend startup we call `seed_all_from_json(db)` once. For each
JSON dump in `data/*.json` we:
  1. Read the file (skip if missing / empty).
  2. Check if the corresponding MongoDB collection is empty.
  3. If empty → insert_many() the documents. Otherwise → skip.

This is fully **idempotent**: a redeploy on top of an existing DB will
never overwrite admin edits or duplicate documents.

Source of the JSON files
------------------------
`/app/scripts/export_db_seed.py` exports the current state of the DB
into `data/<collection>.json`. Run it whenever you want to freeze a new
canonical content baseline (e.g. after bulk-uploading new product cards
through the admin panel).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Iterable

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"

# Order matters: categories must exist before products reference them.
SEED_ORDER: list[str] = [
    "product_categories",
    "products",
    "reviews",
    "blog_posts",
    "cultures",
    "faq_items",
    "trusted_partners",
    "contact_info",
    "site_policies",
    "inside_tabs",
    "inside_meta",
    "admin_settings",
    "discount_rules",
    "upsell_rules",
]


async def _seed_collection(db: AsyncIOMotorDatabase, name: str) -> int:
    """Import data/<name>.json into db[<name>] iff it's empty.

    Returns the number of inserted documents (0 means skipped)."""
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return 0

    try:
        with path.open("r", encoding="utf-8") as fp:
            docs: list[dict] = json.load(fp)
    except Exception as e:  # pragma: no cover
        logger.warning(f"[db_seed] failed to read {path}: {e}")
        return 0

    if not docs:
        return 0

    existing = await db[name].count_documents({})
    if existing > 0:
        logger.debug(f"[db_seed] {name}: skipping ({existing} existing docs)")
        return 0

    # Strip any leftover Mongo _id field defensively
    for d in docs:
        d.pop("_id", None)

    await db[name].insert_many(docs)
    logger.info(f"[db_seed] {name}: inserted {len(docs)} documents from JSON dump")
    return len(docs)


async def seed_all_from_json(db: AsyncIOMotorDatabase) -> int:
    """Run the full seed-from-JSON for all collections that have a dump.

    Safe to call on every startup."""
    total = 0
    for name in SEED_ORDER:
        try:
            total += await _seed_collection(db, name)
        except Exception as e:  # don't fail the whole startup
            logger.warning(f"[db_seed] {name}: import failed: {e}")
    if total:
        logger.info(f"[db_seed] imported {total} documents from JSON baseline")
    return total


__all__ = ["seed_all_from_json"]
