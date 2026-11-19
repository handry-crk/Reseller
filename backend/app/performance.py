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
        "newResellers": sum(1 for r in resellers if s <= (r.get("joinedDate") or local_date(r.get("createdAt", ""))) <= e),
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


def compare_window(s: date, e: date, g: str) -> tuple[date, date]:
    """Pembanding satu bucket: hari sebelumnya / minggu sebelumnya (hari yang sama) / bulan sebelumnya (tanggal yang sama)."""
    if g == "day":
        return s - timedelta(days=1), e - timedelta(days=1)
    if g == "week":
        return s - timedelta(days=7), e - timedelta(days=7)
    ps = add_months(s, -1)
    full_end = e.day == monthrange(e.year, e.month)[1]
    pm = add_months(date(e.year, e.month, 1), -1)
    pe = date(pm.year, pm.month, monthrange(pm.year, pm.month)[1] if full_end else min(e.day, monthrange(pm.year, pm.month)[1]))
    return ps, pe


def range_buckets(start: date, end: date, g: str) -> list[tuple[date, date, bool]]:
    """Bucket di dalam [start, end]; bucket tepi dipotong mengikuti rentang (clipped=True)."""
    out, cur = [], start
    while cur <= end:
        if g == "day":
            nat_s, nat_e = cur, cur
        elif g == "week":
            nat_s = cur - timedelta(days=cur.weekday()); nat_e = nat_s + timedelta(days=6)
        else:
            nat_s = date(cur.year, cur.month, 1); nat_e = date(cur.year, cur.month, monthrange(cur.year, cur.month)[1])
        s, e = max(nat_s, start), min(nat_e, end)
        out.append((s, e, (s, e) != (nat_s, nat_e)))
        cur = e + timedelta(days=1)
    return out


def range_series(orders: list[dict], resellers: list[dict], start: date, end: date, g: str, today: date, local_date) -> list[dict]:
    out = []
    for s, e, clipped in range_buckets(start, end, g):
        to_date = min(e, today)
        if s > today:  # bucket di masa depan: kosong
            cur = summarize([], [], s, e, local_date); ps, pe = compare_window(s, e, g)
            prev = summarize(orders, resellers, ps, pe, local_date)
        else:
            ps, pe = compare_window(s, to_date, g)
            cur = summarize(orders, resellers, s, to_date, local_date)
            prev = summarize(orders, resellers, ps, pe, local_date)
        key = s.isoformat() if g != "month" else s.strftime("%Y-%m")
        out.append({"key": key, "from": s.isoformat(), "to": e.isoformat(), "toDate": to_date.isoformat() if s <= today else e.isoformat(),
                    "partial": e > today or clipped, "clipped": clipped, "compareFrom": ps.isoformat(), "compareTo": pe.isoformat(),
                    **cur, "prev": prev, "delta": delta(cur, prev)})
    return out
