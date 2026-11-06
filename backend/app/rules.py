"""Aturan bisnis alur reseller: status, tier, dan otomatisasi tahap.

Semua angka turunan dihitung di sini dari daftar aktivitas, tidak pernah disimpan manual.
"""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .config import TZ
from .defaults import MAIN_STAGE_IDS


def today() -> date:
    return datetime.now(ZoneInfo(TZ)).date()


def stage_index(stage: str) -> int:
    """Posisi tahap di alur utama; tahap samping (reaktivasi) dianggap setara tahap 3."""
    return MAIN_STAGE_IDS.index(stage) if stage in MAIN_STAGE_IDS else 2


def compute_tier(packs_30: int, tiers: list[dict]) -> str:
    if not tiers:
        return ""
    ordered = sorted(tiers, key=lambda t: int(t.get("minPacks", 0)))
    result = ordered[0]["name"]
    for t in ordered:
        if packs_30 >= int(t.get("minPacks", 0)):
            result = t["name"]
    return result


def enrich(reseller: dict, activities: list[dict], settings: dict, cms: dict, ref: date | None = None) -> dict:
    """Tambahkan field turunan ke dokumen reseller."""
    ref = ref or today()
    orders = sorted((a for a in activities if a.get("type") == "order"), key=lambda a: a.get("date", ""))
    orders_n = len(orders)
    packs = sum(int(a.get("qty") or 0) for a in orders)
    revenue = sum(int(a.get("amount") or 0) for a in orders)
    last = orders[-1]["date"] if orders else ""
    first = orders[0]["date"] if orders else ""
    days_since = (ref - date.fromisoformat(last)).days if last else None
    cutoff = (ref - timedelta(days=30)).isoformat()
    packs_30 = sum(int(a.get("qty") or 0) for a in orders if a.get("date", "") >= cutoff)
    open_c = sum(1 for a in activities if a.get("type") == "complaint" and a.get("status") != "resolved")

    if orders_n == 0:
        status = "Lead"
    elif days_since >= int(settings.get("churnDays", 90)):
        status = "Churn"
    elif days_since >= int(settings.get("pasifDays", 30)):
        status = "Pasif"
    else:
        status = "Aktif"

    tier_auto = compute_tier(packs_30, cms.get("tiers", [])) if orders_n else ""
    tier_eff = reseller.get("tierManual") or tier_auto

    out = dict(reseller)
    out.update(
        ordersCount=orders_n,
        totalPacks=packs,
        totalRevenue=revenue,
        firstOrderDate=first,
        lastOrderDate=last,
        daysSinceLastOrder=days_since,
        packsLast30=packs_30,
        status=status,
        tierAuto=tier_auto,
        tier=tier_eff,
        openComplaints=open_c,
        isRepeat=orders_n >= 2,
        needsAction=bool(open_c) or status == "Pasif" or (bool(out.get("nextFollowUp")) and out["nextFollowUp"] <= ref.isoformat()),
    )
    return out


def apply_activity_rules(reseller: dict, activity: dict, orders_after: int, settings: dict, ref: date | None = None) -> dict:
    """Kembalikan perubahan field reseller setelah sebuah aktivitas dicatat.

    orders_after = jumlah order termasuk aktivitas ini (bila tipe order).
    """
    ref = ref or today()
    cur = reseller.get("stage", "lead")
    idx = stage_index(cur)
    changes: dict = {}
    t = activity["type"]
    if t == "order":
        if orders_after == 1 and idx < 2:
            changes["stage"] = "order1"
            changes["nextFollowUp"] = (ref + timedelta(days=int(settings.get("followUpDays", 14)))).isoformat()
        if orders_after >= 2 and (idx <= 2 or cur == "reaktivasi"):
            changes["stage"] = "repeat"
            changes["nextFollowUp"] = ""
        if cur == "retention":
            changes["nextFollowUp"] = ""
    elif t == "followup":
        changes["nextFollowUp"] = activity.get("nextFollowUp", "") or ""
        if orders_after < 2 and cur in ("order1", "reaktivasi"):
            changes["stage"] = "reaktivasi"
    elif t == "education":
        if cur == "repeat":
            changes["stage"] = "education"
    return changes
