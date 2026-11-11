"""Fungsi bersama untuk membaca konfigurasi dan reseller yang sudah diperkaya."""
import uuid
from datetime import datetime, timezone

from .db import get_db
from .defaults import DEFAULT_CMS, DEFAULT_SETTINGS
from .rules import enrich


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def public(doc: dict) -> dict:
    d = dict(doc)
    d["id"] = d.pop("_id")
    d.pop("passwordHash", None)
    if d.get("type") == "order":
        d.setdefault("status", "completed")  # pesanan lama sebelum fitur status
        d.setdefault("receivedDate", "")
        d.setdefault("invoiceNo", "")
        d.setdefault("items", [])  # pesanan lama tanpa rincian produk
        d.setdefault("discount", 0)
        d.setdefault("shippingFee", 0)
        d.setdefault("subtotal", int(d.get("amount") or 0) + int(d.get("discount") or 0))
        d["totalPaid"] = int(d.get("amount") or 0) + int(d.get("shippingFee") or 0)
        d.setdefault("paymentProof", None)
    return d


async def next_invoice_no(month_key: str) -> str:
    """Nomor invoice berurutan per bulan: INV-YYYYMM-0001."""
    key = "invoice-" + month_key
    doc = await get_db().config.find_one_and_update({"_id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = int(doc["seq"]) if doc and "seq" in doc else 1
    return f"INV-{month_key.replace('-', '')}-{seq:04d}"


async def get_settings() -> dict:
    doc = await get_db().config.find_one({"_id": "settings"})
    merged = {**DEFAULT_SETTINGS, **(doc or {})}
    merged["company"] = {**DEFAULT_SETTINGS["company"], **((doc or {}).get("company") or {})}
    return merged


async def get_cms() -> dict:
    doc = await get_db().config.find_one({"_id": "cms"})
    return {**DEFAULT_CMS, **(doc or {})} if doc else dict(DEFAULT_CMS)


async def activities_by_reseller(reseller_ids: list[str] | None = None) -> dict[str, list[dict]]:
    q = {"resellerId": {"$in": reseller_ids}} if reseller_ids is not None else {}
    grouped: dict[str, list[dict]] = {}
    async for a in get_db().activities.find(q):
        grouped.setdefault(a["resellerId"], []).append(public(a))
    return grouped


async def enriched_resellers(ids: list[str] | None = None) -> list[dict]:
    settings, cms = await get_settings(), await get_cms()
    q = {"_id": {"$in": ids}} if ids is not None else {}
    docs = [public(d) async for d in get_db().resellers.find(q)]
    acts = await activities_by_reseller([d["id"] for d in docs] if ids is not None else None)
    return [enrich(d, acts.get(d["id"], []), settings, cms) for d in docs]


async def enriched_reseller(rid: str) -> dict | None:
    rows = await enriched_resellers([rid])
    return rows[0] if rows else None


def price_items(items: list[dict], products: list[dict]) -> tuple[list[dict], int, int]:
    """Validasi item pesanan terhadap katalog dan hitung subtotal, total pack, total harga di server.

    Baris dengan produk & harga sama digabung. Kembalikan (items, total_qty, total_amount).
    Melempar ValueError bila produk tidak ada di katalog.
    """
    names = {p["name"] for p in products}
    merged: dict[tuple[str, int], int] = {}
    order: list[tuple[str, int]] = []
    for it in items:
        if it["product"] not in names:
            raise ValueError(f"Produk \"{it['product']}\" tidak ada di katalog")
        key = (it["product"], int(it["price"]))
        if key not in merged:
            order.append(key)
            merged[key] = 0
        merged[key] += int(it["qty"])
    out = [{"product": p, "qty": merged[(p, pr)], "price": pr, "subtotal": merged[(p, pr)] * pr} for p, pr in order]
    return out, sum(i["qty"] for i in out), sum(i["subtotal"] for i in out)


def order_money(subtotal: int, discount: int, shipping: int) -> dict:
    """amount (revenue) = subtotal produk − diskon; total dibayar = amount + ongkir."""
    if discount > subtotal:
        raise ValueError("Diskon tidak boleh melebihi subtotal produk")
    return {"subtotal": subtotal, "discount": discount, "shippingFee": shipping, "amount": subtotal - discount}
