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
