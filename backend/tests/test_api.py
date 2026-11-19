"""Uji aturan alur reseller lewat API (database in-memory)."""
from datetime import timedelta

import os

os.environ["ALLOW_DEFAULT_SECRET"] = "1"

import pytest
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app import db as dbmod
from app.main import app, ensure_admin
from app.rules import today


@pytest.fixture
async def client():
    dbmod.set_db(AsyncMongoMockClient()["test"])
    await ensure_admin()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/api/auth/login", json={"email": "admin@crk.local", "password": "admin123"})
        assert r.status_code == 200, r.text
        c.headers["Authorization"] = "Bearer " + r.json()["token"]
        yield c


async def make_reseller(c, **kw):
    r = await c.post("/api/resellers", json={"name": "Toko A", "phone": "0812", "area": "Bandung", "channel": "WhatsApp", "pic": "CS 1", **kw})
    assert r.status_code == 200, r.text
    return r.json()


async def order(c, rid, qty, days_ago=0, amount=None):
    d = (today() - timedelta(days=days_ago)).isoformat()
    r = await c.post("/api/activities", json={"resellerId": rid, "type": "order", "qty": qty, "amount": amount or qty * 35000, "date": d})
    assert r.status_code == 200, r.text
    return r.json()["reseller"]


@pytest.mark.asyncio
async def test_first_order_moves_to_stage3_with_followup(client):
    r = await make_reseller(client)
    assert r["status"] == "Lead" and r["stage"] == "lead"
    r = await order(client, r["id"], 10)
    assert r["stage"] == "order1"
    assert r["nextFollowUp"] == (today() + timedelta(days=14)).isoformat()
    assert r["status"] == "Aktif" and r["ordersCount"] == 1


@pytest.mark.asyncio
async def test_second_order_moves_to_repeat_and_clears_followup(client):
    r = await make_reseller(client)
    await order(client, r["id"], 10, days_ago=20)
    r = await order(client, r["id"], 15)
    assert r["stage"] == "repeat" and r["nextFollowUp"] == "" and r["isRepeat"]


@pytest.mark.asyncio
async def test_tier_from_packs_last_30_days(client):
    r = await make_reseller(client)
    await order(client, r["id"], 25, days_ago=10)
    r = await order(client, r["id"], 15, days_ago=5)  # 40 pack dalam 30 hari -> Silver (30)
    assert r["packsLast30"] == 40 and r["tier"] == "Silver"
    # override manual
    body = {k: r[k] for k in ("name", "phone", "area", "channel", "pic", "stage", "tierManual", "address", "nextFollowUp", "notes")}
    body["tierManual"] = "Gold"
    r = (await client.put(f"/api/resellers/{r['id']}", json=body)).json()
    assert r["tier"] == "Gold" and r["tierAuto"] == "Silver"


@pytest.mark.asyncio
async def test_pasif_and_needs_action(client):
    r = await make_reseller(client)
    r = await order(client, r["id"], 10, days_ago=35)
    assert r["status"] == "Pasif"
    dash = (await client.get("/api/dashboard")).json()
    assert any(t["id"] == r["id"] and t["kind"] in ("pasif", "followup") for t in dash["todo"])
    assert dash["kpi"]["byStatus"]["Pasif"] == 1


@pytest.mark.asyncio
async def test_followup_without_repeat_goes_to_reaktivasi(client):
    r = await make_reseller(client)
    await order(client, r["id"], 10, days_ago=20)
    res = await client.post("/api/activities", json={"resellerId": r["id"], "type": "followup", "note": "WA", "nextFollowUp": (today() + timedelta(days=7)).isoformat()})
    r = res.json()["reseller"]
    assert r["stage"] == "reaktivasi" and r["nextFollowUp"] == (today() + timedelta(days=7)).isoformat()


@pytest.mark.asyncio
async def test_complaint_open_resolve(client):
    r = await make_reseller(client)
    res = await client.post("/api/activities", json={"resellerId": r["id"], "type": "complaint", "note": "Packaging penyok"})
    aid = res.json()["activity"]["id"]
    assert res.json()["reseller"]["openComplaints"] == 1
    assert (await client.post(f"/api/activities/{aid}/resolve")).status_code == 200
    assert (await client.get(f"/api/resellers/{r['id']}")).json()["openComplaints"] == 0


@pytest.mark.asyncio
async def test_viewer_cannot_write(client):
    u = await client.post("/api/users", json={"email": "v@citarasakuliner.com", "name": "Viewer", "role": "viewer", "password": "viewer123"})
    assert u.status_code == 200
    login = await client.post("/api/auth/login", json={"email": "v@citarasakuliner.com", "password": "viewer123"})
    tok = login.json()["token"]
    res = await client.post("/api/resellers", json={"name": "X"}, headers={"Authorization": "Bearer " + tok})
    assert res.status_code == 403
    res = await client.get("/api/dashboard", headers={"Authorization": "Bearer " + tok})
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_seed_and_dashboard(client):
    assert (await client.post("/api/admin/seed")).status_code == 200
    dash = (await client.get("/api/dashboard")).json()
    assert dash["kpi"]["total"] == 8 and dash["kpi"]["revenue"] > 0
    assert sum(s["count"] for s in dash["stages"]) == 8
    assert dash["funnel"][0]["count"] == 8


@pytest.mark.asyncio
async def test_duplicate_reseller_rejected(client):
    await make_reseller(client, name="Toko Dobel", phone="0811")
    r = await client.post("/api/resellers", json={"name": "toko dobel", "phone": "0811"})
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_order_invoice_status_and_gudang(client):
    r = await make_reseller(client)
    res = await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 20, "amount": 700000, "date": "2026-11-09"})
    a = res.json()["activity"]
    assert a["status"] == "to_ship" and a["invoiceNo"] == "INV-202611-0001"
    res = await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 5, "amount": 175000, "date": "2026-11-10"})
    assert res.json()["activity"]["invoiceNo"] == "INV-202611-0002"
    # gudang: hanya boleh status & tanggal diterima
    await client.post("/api/users", json={"email": "gudang@citarasakuliner.com", "name": "Gudang", "role": "gudang", "password": "gudang123"})
    tok = (await client.post("/api/auth/login", json={"email": "gudang@citarasakuliner.com", "password": "gudang123"})).json()["token"]
    h = {"Authorization": "Bearer " + tok}
    res = await client.put(f"/api/activities/{a['id']}", json={"status": "shipping", "qty": 999}, headers=h)
    assert res.status_code == 200 and res.json()["status"] == "shipping" and res.json()["qty"] == 20
    res = await client.put(f"/api/activities/{a['id']}", json={"status": "completed"}, headers=h)
    assert res.json()["receivedDate"] != ""
    assert (await client.post("/api/resellers", json={"name": "X"}, headers=h)).status_code == 403
    # monitoring
    o = (await client.get("/api/orders?month=2026-11", headers=h)).json()
    assert len(o["orders"]) == 2 and o["counts"]["completed"] == 1 and o["counts"]["to_ship"] == 1
    inv = (await client.get(f"/api/activities/{a['id']}", headers=h)).json()
    assert inv["activity"]["invoiceNo"] == "INV-202611-0001" and inv["company"]["name"]


@pytest.mark.asyncio
async def test_monthly_revenue_per_reseller(client):
    r = await make_reseller(client)
    await order(client, r["id"], 10, days_ago=0)
    await order(client, r["id"], 10, days_ago=0)
    d = (await client.get(f"/api/resellers/{r['id']}")).json()
    assert len(d["monthly"]) == 12 and d["monthly"][-1]["revenue"] == 700000 and d["monthly"][-1]["orders"] == 2


@pytest.mark.asyncio
async def test_stage_history(client):
    r = await make_reseller(client)
    await order(client, r["id"], 10)  # otomatis -> order1
    await client.post(f"/api/resellers/{r['id']}/stage", json={"stage": "form"})  # manual
    h = (await client.get("/api/stage-history?month=" + today().isoformat()[:7])).json()
    assert h["total"] == 2 and h["resellers"] == 1
    auto = [x for x in h["rows"] if x["auto"]][0]
    assert auto["fromStage"] == "lead" and auto["toStage"] == "order1"
    manual = [x for x in h["rows"] if not x["auto"]][0]
    assert manual["fromStage"] == "order1" and manual["toLabel"] == "Form Pendaftaran"


@pytest.mark.asyncio
async def test_delete_order_reverts_stage(client):
    r = await make_reseller(client)
    a1 = (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 10, "amount": 1, "date": (today() - timedelta(days=3)).isoformat()})).json()["activity"]
    a2 = (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 10, "amount": 1})).json()["activity"]
    assert (await client.get(f"/api/resellers/{r['id']}")).json()["stage"] == "repeat"
    await client.delete(f"/api/activities/{a2['id']}")
    assert (await client.get(f"/api/resellers/{r['id']}")).json()["stage"] == "order1"
    await client.delete(f"/api/activities/{a1['id']}")
    d = (await client.get(f"/api/resellers/{r['id']}")).json()
    assert d["stage"] == "form" and d["nextFollowUp"] == "" and d["status"] == "Lead"


@pytest.mark.asyncio
async def test_future_date_rejected_and_historic_order_no_followup(client):
    r = await make_reseller(client)
    res = await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 1, "amount": 1, "date": (today() + timedelta(days=2)).isoformat()})
    assert res.status_code == 422
    d = await order(client, r["id"], 10, days_ago=200)
    assert d["stage"] == "order1" and d["nextFollowUp"] == "" and d["status"] == "Churn" and d["tier"] == ""


@pytest.mark.asyncio
async def test_spa_path_traversal_blocked(client):
    import os
    from app import main as m
    static = os.path.join(os.path.dirname(m.__file__), "..", "static")
    if not os.path.isdir(static):
        pytest.skip("frontend belum di-build ke backend/static")
    res = await client.get("/..%2fapp%2fconfig.py")
    assert res.status_code == 200 and "JWT_SECRET" not in res.text
    assert (await client.get("/api/tidak-ada")).status_code == 404


@pytest.mark.asyncio
async def test_register_domain_and_approval(client):
    anon = {"Authorization": ""}
    r = await client.post("/api/auth/register", json={"name": "Budi", "email": "budi@gmail.com", "password": "rahasia123"}, headers=anon)
    assert r.status_code == 422 and "citarasakuliner" in r.json()["detail"]
    r = await client.post("/api/auth/register", json={"name": "Budi", "email": "Budi@CitarasaKuliner.co.id", "password": "rahasia123"}, headers=anon)
    assert r.status_code == 200
    assert (await client.post("/api/auth/register", json={"name": "Budi 2", "email": "budi@citarasakuliner.co.id", "password": "rahasia123"}, headers=anon)).status_code == 409
    login = await client.post("/api/auth/login", json={"email": "budi@citarasakuliner.co.id", "password": "rahasia123"}, headers=anon)
    assert login.status_code == 401 and "persetujuan" in login.json()["detail"]
    assert (await client.get("/api/meta")).json()["pendingUsers"] == 1
    uid = [u for u in (await client.get("/api/users")).json() if u["email"] == "budi@citarasakuliner.co.id"][0]["id"]
    assert (await client.post(f"/api/users/{uid}/approve", json={"role": "gudang"})).status_code == 200
    login = await client.post("/api/auth/login", json={"email": "budi@citarasakuliner.co.id", "password": "rahasia123"}, headers=anon)
    assert login.status_code == 200 and login.json()["user"]["role"] == "gudang"
    # domain lain yang mirip ditolak
    assert (await client.post("/api/auth/register", json={"name": "Xx", "email": "x@citarasakuliner-palsu.com", "password": "rahasia123"}, headers=anon)).status_code == 422
    assert (await client.post("/api/auth/register", json={"name": "Xx", "email": "x@evilcitarasakuliner.com", "password": "rahasia123"}, headers=anon)).status_code == 422
    # admin juga wajib domain perusahaan untuk user baru
    assert (await client.post("/api/users", json={"email": "luar@gmail.com", "name": "Luar", "role": "cs", "password": "abcdef"})).status_code == 422


MOZZA = ["Mozza Balado", "Mozza Ayam Bawang", "Mozza Asin Pedas", "Mozza BBQ", "Mozza Jagung Bakar"]


@pytest.mark.asyncio
async def test_catalog_default_products(client):
    cms = (await client.get("/api/cms")).json()
    assert [p["name"] for p in cms["products"]] == MOZZA and all(p["price"] == 23800 for p in cms["products"])


@pytest.mark.asyncio
async def test_order_items_totals_computed_server_side(client):
    r = await make_reseller(client)
    body = {"resellerId": r["id"], "type": "order", "qty": 1, "amount": 1,  # nilai palsu dari klien harus diabaikan
            "items": [{"product": "Mozza Balado", "qty": 20, "price": 23800},
                      {"product": "Mozza BBQ", "qty": 10, "price": 22000},
                      {"product": "Mozza Balado", "qty": 5, "price": 23800}]}  # baris kembar digabung
    a = (await client.post("/api/activities", json=body)).json()["activity"]
    assert a["qty"] == 35 and a["amount"] == 25 * 23800 + 10 * 22000 == 815000
    assert [(i["product"], i["qty"], i["subtotal"]) for i in a["items"]] == [("Mozza Balado", 25, 595000), ("Mozza BBQ", 10, 220000)]
    d = (await client.get(f"/api/resellers/{r['id']}")).json()
    assert d["totalPacks"] == 35 and d["totalRevenue"] == 815000 and d["monthly"][-1]["revenue"] == 815000
    o = (await client.get("/api/orders?month=" + today().isoformat()[:7])).json()
    assert {k: o["totals"][k] for k in ("orders", "packs", "revenue")} == {"orders": 1, "packs": 35, "revenue": 815000}
    assert o["products"][0] == {"product": "Mozza Balado", "packs": 25, "revenue": 595000}
    # edit item -> total dihitung ulang; ubah total langsung ditolak
    res = await client.put(f"/api/activities/{a['id']}", json={"items": [{"product": "Mozza Jagung Bakar", "qty": 4, "price": 23800}]})
    assert res.status_code == 200 and res.json()["qty"] == 4 and res.json()["amount"] == 95200
    assert (await client.put(f"/api/activities/{a['id']}", json={"amount": 5})).status_code == 422
    assert (await client.put(f"/api/activities/{a['id']}", json={"items": []})).status_code == 422


@pytest.mark.asyncio
async def test_order_items_validation(client):
    r = await make_reseller(client)
    bad = lambda items: client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "items": items})
    assert (await bad([{"product": "Produk Palsu", "qty": 1, "price": 1000}])).status_code == 422
    assert (await bad([{"product": "Mozza BBQ", "qty": 0, "price": 1000}])).status_code == 422
    assert (await bad([{"product": "Mozza BBQ", "qty": -3, "price": 1000}])).status_code == 422
    assert (await bad([{"product": "Mozza BBQ", "qty": 2, "price": -1}])).status_code == 422
    # tanpa item dan tanpa qty tetap ditolak
    assert (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order"})).status_code == 422
    # gudang tidak bisa mengubah item
    await client.post("/api/users", json={"email": "g2@citarasakuliner.com", "name": "Gd", "role": "gudang", "password": "gudang123"})
    tok = (await client.post("/api/auth/login", json={"email": "g2@citarasakuliner.com", "password": "gudang123"})).json()["token"]
    a = (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "items": [{"product": "Mozza BBQ", "qty": 2, "price": 23800}]})).json()["activity"]
    res = await client.put(f"/api/activities/{a['id']}", json={"items": [{"product": "Mozza BBQ", "qty": 999, "price": 1}]}, headers={"Authorization": "Bearer " + tok})
    assert res.status_code == 200 and res.json()["qty"] == 2 and res.json()["amount"] == 47600


@pytest.mark.asyncio
async def test_cms_rejects_duplicate_product(client):
    cms = (await client.get("/api/cms")).json()
    cms["products"].append({"name": "mozza balado", "price": 1})
    assert (await client.put("/api/cms", json=cms)).status_code == 422


PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


@pytest.mark.asyncio
async def test_order_discount_shipping(client):
    r = await make_reseller(client)
    body = {"resellerId": r["id"], "type": "order", "items": [{"product": "Mozza Balado", "qty": 10, "price": 23800}],
            "discount": 18000, "shippingFee": 25000}
    a = (await client.post("/api/activities", json=body)).json()["activity"]
    assert a["subtotal"] == 238000 and a["discount"] == 18000 and a["shippingFee"] == 25000
    assert a["amount"] == 220000 and a["totalPaid"] == 245000  # revenue tanpa ongkir; dibayar = revenue + ongkir
    d = (await client.get(f"/api/resellers/{r['id']}")).json()
    assert d["totalRevenue"] == 220000
    o = (await client.get("/api/orders?month=" + today().isoformat()[:7])).json()["totals"]
    assert o["revenue"] == 220000 and o["shipping"] == 25000 and o["totalPaid"] == 245000 and o["discount"] == 18000
    # diskon > subtotal ditolak; negatif ditolak
    bad = dict(body, discount=300000)
    assert (await client.post("/api/activities", json=bad)).status_code == 422
    assert (await client.post("/api/activities", json=dict(body, shippingFee=-1))).status_code == 422
    # ubah ongkir saja -> dihitung ulang
    res = (await client.put(f"/api/activities/{a['id']}", json={"shippingFee": 0, "discount": 0})).json()
    assert res["amount"] == 238000 and res["totalPaid"] == 238000
    # ubah item -> diskon lama dipertahankan
    await client.put(f"/api/activities/{a['id']}", json={"discount": 8000})
    res = (await client.put(f"/api/activities/{a['id']}", json={"items": [{"product": "Mozza BBQ", "qty": 5, "price": 20000}]})).json()
    assert res["subtotal"] == 100000 and res["amount"] == 92000
    assert (await client.put(f"/api/activities/{a['id']}", json={"discount": 100001})).status_code == 422


@pytest.mark.asyncio
async def test_payment_proof(client):
    r = await make_reseller(client)
    a = (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "items": [{"product": "Mozza BBQ", "qty": 5, "price": 23800}]})).json()["activity"]
    assert a["paymentProof"] is None
    up = await client.post(f"/api/activities/{a['id']}/proof", json={"name": "tf.png", "mime": "image/png", "data": PNG_1PX})
    assert up.status_code == 200 and up.json()["paymentProof"]["name"] == "tf.png"
    got = await client.get(f"/api/activities/{a['id']}/proof")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.content[:4] == b"\x89PNG"
    # format palsu / tidak didukung / terlalu besar
    assert (await client.post(f"/api/activities/{a['id']}/proof", json={"name": "x.png", "mime": "image/png", "data": "aGVsbG8="})).status_code == 422
    assert (await client.post(f"/api/activities/{a['id']}/proof", json={"name": "x.exe", "mime": "application/x-msdownload", "data": "aGVsbG8="})).status_code == 422
    import base64 as b64
    big = b64.b64encode(b"%PDF-" + b"0" * (2 * 1024 * 1024)).decode()
    assert (await client.post(f"/api/activities/{a['id']}/proof", json={"name": "big.pdf", "mime": "application/pdf", "data": big})).status_code == 422
    o = (await client.get("/api/orders")).json()
    assert o["totals"]["withProof"] == 1
    # hapus pesanan ikut menghapus bukti
    await client.delete(f"/api/activities/{a['id']}")
    assert (await client.get(f"/api/activities/{a['id']}/proof")).status_code == 404


@pytest.mark.asyncio
async def test_cs_can_edit_lists_only(client):
    await client.post("/api/users", json={"email": "cs9@citarasakuliner.com", "name": "CS9", "role": "cs", "password": "cs123456"})
    tok = (await client.post("/api/auth/login", json={"email": "cs9@citarasakuliner.com", "password": "cs123456"})).json()["token"]
    h = {"Authorization": "Bearer " + tok}
    res = await client.put("/api/settings/lists", json={"pic": ["Andi", " andi ", "Budi"], "channel": ["WhatsApp"], "area": ["Bandung", "Bali"]}, headers=h)
    assert res.status_code == 200 and res.json()["pic"] == ["Andi", "Budi"] and res.json()["area"] == ["Bandung", "Bali"]
    assert res.json()["pasifDays"] == 30  # aturan lain tidak tersentuh
    assert (await client.put("/api/settings/lists", json={"pic": [], "channel": ["WA"], "area": ["X"]}, headers=h)).status_code == 422
    s = (await client.get("/api/settings")).json()
    assert (await client.put("/api/settings", json=s, headers=h)).status_code == 403



@pytest.mark.asyncio
async def test_dashboard_custom_range(client):
    r1 = await make_reseller(client, name="Toko Rentang A", phone="0811")
    r2 = await make_reseller(client, name="Toko Rentang B", phone="0822")
    d = lambda n: (today() - timedelta(days=n)).isoformat()
    await order(client, r1["id"], 10, days_ago=40, amount=100000)
    await order(client, r1["id"], 10, days_ago=10, amount=200000)
    await order(client, r2["id"], 10, days_ago=5, amount=50000)
    await order(client, r2["id"], 10, days_ago=0, amount=70000)
    q = await client.get(f"/api/dashboard?from={d(12)}&to={d(5)}")
    k = q.json()["kpi"]
    assert k["revenue"] == 250000 and k["orders"] == 2 and k["aov"] == 125000 and k["buyersInPeriod"] == 2
    assert q.json()["range"] == {"from": d(12), "to": d(5)}
    top = q.json()["top"]
    assert [(x["name"], x["totalRevenue"], x["ordersCount"]) for x in top] == [("Toko Rentang A", 200000, 1), ("Toko Rentang B", 50000, 1)]
    assert sum(p["revenue"] for p in q.json()["pics"]) == 250000
    assert sum(q.json()["orderCounts"].values()) == 2
    # batas inklusif: satu hari
    assert (await client.get(f"/api/dashboard?from={d(0)}&to={d(0)}")).json()["kpi"]["revenue"] == 70000
    # hanya from / hanya to
    assert (await client.get(f"/api/dashboard?from={d(10)}")).json()["kpi"]["revenue"] == 320000
    assert (await client.get(f"/api/dashboard?to={d(40)}")).json()["kpi"]["revenue"] == 100000
    # semua periode tetap total keseluruhan; snapshot (status) tidak terpengaruh rentang
    allp = (await client.get("/api/dashboard")).json()
    assert allp["kpi"]["revenue"] == 420000 and allp["range"] == {"from": "", "to": ""}
    assert (await client.get(f"/api/dashboard?from={d(1)}&to={d(1)}")).json()["kpi"]["byStatus"] == allp["kpi"]["byStatus"]
    # validasi
    assert (await client.get(f"/api/dashboard?from={d(1)}&to={d(5)}")).status_code == 422
    assert (await client.get("/api/dashboard?from=2026-13-01")).status_code == 422
    # period lama tetap jalan
    assert (await client.get("/api/dashboard?period=30")).json()["kpi"]["revenue"] == 320000


@pytest.mark.asyncio
async def test_previous_range_rules():
    from datetime import date
    from app.performance import previous_range
    assert previous_range(date(2026, 11, 1), date(2026, 11, 17)) == (date(2026, 10, 1), date(2026, 10, 17))  # MTD vs MTD
    assert previous_range(date(2026, 10, 1), date(2026, 10, 31)) == (date(2026, 9, 1), date(2026, 9, 30))  # bulan penuh
    assert previous_range(date(2026, 3, 1), date(2026, 3, 31)) == (date(2026, 2, 1), date(2026, 2, 28))  # Feb lebih pendek
    assert previous_range(date(2026, 3, 1), date(2026, 3, 30)) == (date(2026, 2, 1), date(2026, 2, 28))  # dibatasi akhir Feb
    assert previous_range(date(2026, 11, 11), date(2026, 11, 17)) == (date(2026, 11, 4), date(2026, 11, 10))  # 7 hari
    assert previous_range(date(2026, 9, 1), date(2026, 11, 30)) == (date(2026, 6, 1), date(2026, 8, 31))  # 3 bulan


@pytest.mark.asyncio
async def test_performance_week_and_month(client):
    from datetime import date as D
    from app.performance import series
    t = D(2026, 11, 17)  # Selasa
    ords = [{"resellerId": "a", "date": "2026-11-16", "amount": 100, "qty": 1},   # Senin minggu ini
            {"resellerId": "b", "date": "2026-11-17", "amount": 300, "qty": 2},   # Selasa minggu ini
            {"resellerId": "a", "date": "2026-11-09", "amount": 200, "qty": 1},   # Senin minggu lalu (to-date)
            {"resellerId": "a", "date": "2026-11-14", "amount": 999, "qty": 9},   # Sabtu minggu lalu (di luar to-date)
            {"resellerId": "c", "date": "2026-10-05", "amount": 500, "qty": 5}]
    ld = lambda x: (x or "")[:10]
    w = series(ords, [], "week", 2, t, ld)
    cur = w[-1]
    assert cur["from"] == "2026-11-16" and cur["partial"] and cur["compareTo"] == "2026-11-10"
    assert cur["revenue"] == 400 and cur["prev"]["revenue"] == 200 and cur["delta"]["revenue"]["pct"] == 100.0
    assert cur["buyers"] == 2 and cur["delta"]["buyers"]["abs"] == 1
    full = w[-2]  # minggu lalu penuh vs minggu sebelumnya penuh (tanpa order -> pct None)
    assert not full["partial"] and full["revenue"] == 1199 and full["delta"]["revenue"]["pct"] is None
    m = series(ords, [], "month", 2, t, ld)
    assert m[-1]["key"] == "2026-11" and m[-1]["compareTo"] == "2026-10-17" and m[-1]["revenue"] == 1599 and m[-1]["prev"]["revenue"] == 500
    assert m[-2]["key"] == "2026-10" and m[-2]["revenue"] == 500 and not m[-2]["partial"]


@pytest.mark.asyncio
async def test_performance_api_and_dashboard_compare(client):
    r = await make_reseller(client)
    await order(client, r["id"], 10, days_ago=0, amount=300000)
    await order(client, r["id"], 10, days_ago=8, amount=100000)
    p = (await client.get("/api/performance?granularity=week&n=4")).json()
    assert len(p["series"]) == 4 and p["series"][-1]["toDate"] == today().isoformat()
    assert sum(s["revenue"] for s in p["series"]) == 400000
    assert p["byPic"][0]["name"] == "CS 1" and p["byProduct"]
    assert (await client.get("/api/performance?granularity=year")).status_code == 422
    d = lambda n: (today() - timedelta(days=n)).isoformat()
    dash = (await client.get(f"/api/dashboard?from={d(6)}&to={d(0)}")).json()
    assert dash["compare"]["from"] == d(13) and dash["compare"]["to"] == d(7)
    assert dash["compare"]["kpi"]["revenue"] == 100000 and dash["compare"]["delta"]["revenue"]["pct"] == 200.0
    assert (await client.get("/api/dashboard")).json()["compare"] is None


@pytest.mark.asyncio
async def test_range_buckets_and_compare():
    from datetime import date as D
    from app.performance import range_buckets, compare_window
    # 5–20 Nov 2026 per minggu: Kam 5–Min 8 (dipotong), 9–15, 16–20 (dipotong)
    b = range_buckets(D(2026, 11, 5), D(2026, 11, 20), "week")
    assert [(x[0].day, x[1].day, x[2]) for x in b] == [(5, 8, True), (9, 15, False), (16, 20, True)]
    m = range_buckets(D(2026, 9, 15), D(2026, 11, 3), "month")
    assert [(x[0].isoformat(), x[1].isoformat(), x[2]) for x in m] == [("2026-09-15", "2026-09-30", True), ("2026-10-01", "2026-10-31", False), ("2026-11-01", "2026-11-03", True)]
    assert len(range_buckets(D(2026, 11, 1), D(2026, 11, 7), "day")) == 7
    assert compare_window(D(2026, 3, 1), D(2026, 3, 31), "month") == (D(2026, 2, 1), D(2026, 2, 28))
    assert compare_window(D(2026, 9, 15), D(2026, 9, 30), "month") == (D(2026, 8, 15), D(2026, 8, 31))
    assert compare_window(D(2026, 11, 9), D(2026, 11, 15), "week") == (D(2026, 11, 2), D(2026, 11, 8))


@pytest.mark.asyncio
async def test_performance_custom_range_api(client):
    r = await make_reseller(client)
    d = lambda n: (today() - timedelta(days=n)).isoformat()
    for n, amt in [(0, 100000), (2, 200000), (9, 50000), (20, 70000)]:
        await order(client, r["id"], 10, days_ago=n, amount=amt)
    res = (await client.get(f"/api/performance?from={d(6)}&to={d(0)}&granularity=day")).json()
    assert len(res["series"]) == 7 and sum(x["revenue"] for x in res["series"]) == 300000
    sm = res["summary"]
    assert sm["revenue"] == 300000 and sm["compareFrom"] == d(13) and sm["compareTo"] == d(7) and sm["prev"]["revenue"] == 50000
    assert sm["delta"]["revenue"]["pct"] == 500.0
    assert sum(x["cur"] for x in res["byPic"]) == 300000 and sum(x["prev"] for x in res["byPic"]) == 50000
    day0 = res["series"][-1]
    assert day0["from"] == d(0) and day0["revenue"] == 100000 and day0["compareFrom"] == d(1)
    wk = (await client.get(f"/api/performance?from={d(27)}&to={d(0)}&granularity=week")).json()
    assert sum(x["revenue"] for x in wk["series"]) == 420000 and wk["series"][0]["from"] == d(27)
    assert (await client.get(f"/api/performance?from={d(200)}&to={d(0)}&granularity=day")).status_code == 422
    assert (await client.get(f"/api/performance?from={d(0)}&to={d(5)}&granularity=day")).status_code == 422
    assert (await client.get(f"/api/performance?from={d(5)}&granularity=day")).status_code == 422


@pytest.mark.asyncio
async def test_orders_date_range(client):
    r = await make_reseller(client)
    ids = {}
    for d in ("2026-10-28", "2026-11-03", "2026-11-09"):
        ids[d] = (await client.post("/api/activities", json={"resellerId": r["id"], "type": "order", "qty": 10, "amount": 238000, "date": d})).json()["activity"]["id"]
    await client.put(f"/api/activities/{ids['2026-11-09']}", json={"status": "completed"})
    # rentang lintas bulan, batas inklusif
    o = (await client.get("/api/orders?from=2026-10-28&to=2026-11-03")).json()
    assert [x["date"] for x in o["orders"]] == ["2026-11-03", "2026-10-28"] or sorted(x["date"] for x in o["orders"]) == ["2026-10-28", "2026-11-03"]
    assert o["totals"]["orders"] == 2 and o["totals"]["revenue"] == sum(x["amount"] for x in o["orders"])
    assert o["counts"] == {"to_ship": 2, "shipping": 0, "completed": 0} and o["backlogOutside"] == 0
    assert o["range"] == {"from": "2026-10-28", "to": "2026-11-03"}
    # satu hari; pesanan belum selesai di luar rentang dilaporkan sebagai backlog
    o = (await client.get("/api/orders?from=2026-11-09&to=2026-11-09")).json()
    assert len(o["orders"]) == 1 and o["counts"]["completed"] == 1 and o["counts"]["to_ship"] == 0 and o["backlogOutside"] == 2
    # rentang + status
    o = (await client.get("/api/orders?from=2026-10-01&to=2026-11-30&status=completed")).json()
    assert len(o["orders"]) == 1 and o["counts"]["to_ship"] == 2
    # tanpa filter = semua periode; month lama tetap jalan; rentang terbalik ditolak
    o = (await client.get("/api/orders")).json()
    assert len(o["orders"]) == 3 and o["backlogOutside"] == 0
    assert len((await client.get("/api/orders?month=2026-10")).json()["orders"]) == 1
    assert (await client.get("/api/orders?from=2026-11-09&to=2026-11-01")).status_code == 422


@pytest.mark.asyncio
async def test_new_resellers_on_dashboard(client):
    from datetime import timedelta
    for n in ("Toko Lama", "Toko Tengah", "Toko Baru"):
        await make_reseller(client, name=n, phone="08" + str(abs(hash(n)))[:9])
    d = (await client.get("/api/dashboard")).json()
    assert d["newResellersTotal"] == 3 and len(d["newResellers"]) == 3
    assert all(x["joinedDate"] == today().isoformat() and x["ordersCount"] == 0 for x in d["newResellers"])
    rid = d["newResellers"][0]["id"]
    await client.post("/api/activities", json={"resellerId": rid, "type": "order", "qty": 10, "amount": 238000, "date": today().isoformat()})
    d = (await client.get(f"/api/dashboard?from={today().isoformat()}&to={today().isoformat()}")).json()
    assert d["newResellersTotal"] == 3 == d["kpi"]["newInPeriod"]
    assert next(x for x in d["newResellers"] if x["id"] == rid)["ordersCount"] == 1
    y = (today() - timedelta(days=1)).isoformat()
    d = (await client.get(f"/api/dashboard?from={y}&to={y}")).json()
    assert d["newResellers"] == [] and d["newResellersTotal"] == 0
    assert (await client.get("/api/resellers")).json()[0]["joinedDate"] == today().isoformat()
