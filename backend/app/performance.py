"""Perhitungan performa per periode dan perbandingannya (week-to-week, month-to-month, periode sebelumnya).

Semua angka dihitung dari pesanan (activities type=order) dan tanggal daftar reseller.
Revenue = subtotal produk − diskon (ongkir tidak termasuk), sama dengan laporan lain.
"""
from calendar import monthrange
from datetime import date, timedelta

METRICS = ("revenue", "orders", "packs", "buyers", "aov", "newResellers")


def summarize(orders: list[dict], resellers: list[dict], start: date, end: date, local_date) -> dict:
    """Ringkasan untuk rentang tanggal inklusif [start, end]."""
    s, e = start.isoformat(), end.isoformat()
    rows = [o for o in orders if s <= (o.get("date") or "") <= e]
    revenue = sum(int(o.get("amount") or 0) for o in rows)
    return {
        "revenue": revenue,
        "orders": len(rows),
        "packs": sum(int(o.get("qty") or 0) for o in rows),
        "buyers": len({o["resellerId"] for o in rows}),
        "aov": round(revenue / len(rows)) if rows else 0,
        "newResellers": sum(1 for r in resellers if s <= local_date(r.get("createdAt", "")) <= e),
        "shipping": sum(int(o.get("shippingFee") or 0) for o in rows),
    }


def delta(cur: dict, prev: dict) -> dict:
    """Perubahan absolut & persen per metrik. pct = None bila pembanding 0 (tidak bisa dihitung)."""
    out = {}
    for k in METRICS:
        c, p = cur.get(k, 0), prev.get(k, 0)
        out[k] = {"abs": c - p, "pct": round((c - p) / p * 100, 1) if p else None}
    return out


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))


def previous_range(start: date, end: date) -> tuple[date, date]:
    """Periode pembanding.

    - Rentang yang dimulai tanggal 1 (bulan ini / bulan lalu / beberapa bulan penuh): hari yang sama
      di bulan sebelumnya (MTD vs MTD bulan lalu; Okt penuh vs Sep penuh).
    - Selain itu: rentang sama panjang tepat sebelumnya (7 hari vs 7 hari sebelumnya).
    """
    if start.day == 1:
        months = (end.year - start.year) * 12 + end.month - start.month + 1
        p_start = add_months(start, -months)
        full_month_end = end.day == monthrange(end.year, end.month)[1]
        p_end_month = add_months(date(end.year, end.month, 1), -months)
        p_end = date(p_end_month.year, p_end_month.month,
                     monthrange(p_end_month.year, p_end_month.month)[1] if full_month_end
                     else min(end.day, monthrange(p_end_month.year, p_end_month.month)[1]))
        return p_start, p_end
    length = (end - start).days + 1
    return start - timedelta(days=length), start - timedelta(days=1)


def buckets(granularity: str, n: int, today: date) -> list[tuple[date, date, str]]:
    """n bucket terakhir (lama → baru). Minggu = Senin–Minggu; bulan = kalender."""
    out = []
    if granularity == "week":
        monday = today - timedelta(days=today.weekday())
        for i in range(n - 1, -1, -1):
            s = monday - timedelta(weeks=i)
            out.append((s, s + timedelta(days=6), f"{s.isoformat()}"))
    else:
        first = date(today.year, today.month, 1)
        for i in range(n - 1, -1, -1):
            s = add_months(first, -i)
            out.append((s, date(s.year, s.month, monthrange(s.year, s.month)[1]), s.strftime("%Y-%m")))
    return out


def series(orders: list[dict], resellers: list[dict], granularity: str, n: int, today: date, local_date) -> list[dict]:
    """Performa per bucket + delta vs bucket sebelumnya.

    Bucket berjalan (belum selesai) dibandingkan secara adil: hari pertama s/d hari ini
    vs hari yang sama di bucket sebelumnya (week-to-date / month-to-date).
    """
    bs = buckets(granularity, n + 1, today)  # +1 supaya bucket tertua juga punya pembanding
    out = []
    for i in range(1, len(bs)):
        s, e, key = bs[i]
        ps, pe, _ = bs[i - 1]
        partial = e > today
        cur_end = min(e, today)
        if partial:
            elapsed = (cur_end - s).days
            cmp_end = min(pe, ps + timedelta(days=elapsed)) if granularity == "week" else \
                date(ps.year, ps.month, min(cur_end.day, monthrange(ps.year, ps.month)[1]))
        else:
            cmp_end = pe
        cur = summarize(orders, resellers, s, cur_end, local_date)
        prev = summarize(orders, resellers, ps, cmp_end, local_date)
        out.append({"key": key, "from": s.isoformat(), "to": e.isoformat(), "toDate": cur_end.isoformat(), "partial": partial,
                    "compareFrom": ps.isoformat(), "compareTo": cmp_end.isoformat(), **cur, "prev": prev, "delta": delta(cur, prev)})
    return out
