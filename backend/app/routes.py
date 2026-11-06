from fastapi import APIRouter, Depends, HTTPException

from .auth import CMS_ROLES, WRITE_ROLES, current_user, hash_password, make_token, require, verify_password
from .db import get_db
from .defaults import STAGES
from .rules import apply_activity_rules, today
from .schemas import ActivityIn, ChangePasswordIn, CmsIn, LoginIn, ResellerIn, SettingsIn, StageIn, UserIn
from .service import (
    activities_by_reseller,
    enriched_reseller,
    enriched_resellers,
    get_cms,
    get_settings,
    new_id,
    now_iso,
    public,
)

router = APIRouter(prefix="/api")


# ================= AUTH & USERS =================
@router.post("/auth/login")
async def login(body: LoginIn):
    user = await get_db().users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(401, "Email atau kata sandi salah")
    if not user.get("active", True):
        raise HTTPException(401, "Akun dinonaktifkan")
    return {"token": make_token(user), "user": public(user)}


@router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return public(user)


@router.post("/auth/password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(current_user)):
    await get_db().users.update_one({"_id": user["_id"]}, {"$set": {"passwordHash": hash_password(body.password)}})
    return {"ok": True}


@router.get("/users")
async def list_users(_: dict = Depends(require("admin"))):
    return [public(u) async for u in get_db().users.find({})]


@router.post("/users")
async def create_user(body: UserIn, _: dict = Depends(require("admin"))):
    if not body.password:
        raise HTTPException(422, "Kata sandi wajib diisi untuk user baru")
    if await get_db().users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Email sudah terdaftar")
    doc = {"_id": new_id(), "email": body.email.lower(), "name": body.name, "role": body.role, "active": body.active,
           "passwordHash": hash_password(body.password), "createdAt": now_iso()}
    await get_db().users.insert_one(doc)
    return public(doc)


@router.put("/users/{uid}")
async def update_user(uid: str, body: UserIn, admin: dict = Depends(require("admin"))):
    upd = {"email": body.email.lower(), "name": body.name, "role": body.role, "active": body.active}
    if uid == admin["_id"] and (body.role != "admin" or not body.active):
        raise HTTPException(400, "Tidak bisa menurunkan/menonaktifkan akun Anda sendiri")
    if body.password:
        upd["passwordHash"] = hash_password(body.password)
    res = await get_db().users.update_one({"_id": uid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "User tidak ditemukan")
    return public(await get_db().users.find_one({"_id": uid}))


@router.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require("admin"))):
    if uid == admin["_id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun Anda sendiri")
    await get_db().users.delete_one({"_id": uid})
    return {"ok": True}


# ================= META =================
@router.get("/meta")
async def meta(_: dict = Depends(current_user)):
    return {"stages": STAGES, "settings": await get_settings(), "cms": await get_cms(), "today": today().isoformat()}


# ================= RESELLERS =================
@router.get("/resellers")
async def list_resellers(_: dict = Depends(current_user)):
    rows = await enriched_resellers()
    rows.sort(key=lambda r: r.get("updatedAt", ""), reverse=True)
    return rows


@router.post("/resellers")
async def create_reseller(body: ResellerIn, _: dict = Depends(require(*WRITE_ROLES))):
    doc = {"_id": new_id(), **body.model_dump(), "createdAt": now_iso(), "updatedAt": now_iso()}
    await get_db().resellers.insert_one(doc)
    return await enriched_reseller(doc["_id"])


@router.get("/resellers/{rid}")
async def get_reseller(rid: str, _: dict = Depends(current_user)):
    r = await enriched_reseller(rid)
    if not r:
        raise HTTPException(404, "Reseller tidak ditemukan")
    acts = (await activities_by_reseller([rid])).get(rid, [])
    acts.sort(key=lambda a: (a.get("date", ""), a.get("createdAt", "")), reverse=True)
    r["activities"] = acts
    return r


@router.put("/resellers/{rid}")
async def update_reseller(rid: str, body: ResellerIn, _: dict = Depends(require(*WRITE_ROLES))):
    res = await get_db().resellers.update_one({"_id": rid}, {"$set": {**body.model_dump(), "updatedAt": now_iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Reseller tidak ditemukan")
    return await enriched_reseller(rid)


@router.post("/resellers/{rid}/stage")
async def move_stage(rid: str, body: StageIn, user: dict = Depends(require(*WRITE_ROLES))):
    r = await get_db().resellers.find_one({"_id": rid})
    if not r:
        raise HTTPException(404, "Reseller tidak ditemukan")
    label = next(s["label"] for s in STAGES if s["id"] == body.stage)
    await get_db().resellers.update_one({"_id": rid}, {"$set": {"stage": body.stage, "updatedAt": now_iso()}})
    await get_db().activities.insert_one({"_id": new_id(), "resellerId": rid, "type": "stage", "date": today().isoformat(),
                                          "note": f"Pindah ke tahap: {label}", "by": user["name"], "createdAt": now_iso()})
    return await enriched_reseller(rid)


@router.delete("/resellers/{rid}")
async def delete_reseller(rid: str, _: dict = Depends(require("admin", "crm"))):
    await get_db().activities.delete_many({"resellerId": rid})
    res = await get_db().resellers.delete_one({"_id": rid})
    if not res.deleted_count:
        raise HTTPException(404, "Reseller tidak ditemukan")
    return {"ok": True}


# ================= ACTIVITIES =================
@router.get("/activities")
async def list_activities(type: str | None = None, _: dict = Depends(current_user)):
    q = {"type": type} if type else {}
    rows = [public(a) async for a in get_db().activities.find(q)]
    names = {r["_id"]: r["name"] async for r in get_db().resellers.find({}, {"name": 1})}
    for a in rows:
        a["resellerName"] = names.get(a["resellerId"], "")
    rows.sort(key=lambda a: (a.get("date", ""), a.get("createdAt", "")), reverse=True)
    return rows


@router.post("/activities")
async def create_activity(body: ActivityIn, user: dict = Depends(require(*WRITE_ROLES))):
    r = await get_db().resellers.find_one({"_id": body.resellerId})
    if not r:
        raise HTTPException(404, "Reseller tidak ditemukan")
    if body.type == "order" and body.qty <= 0:
        raise HTTPException(422, "Jumlah pack harus lebih dari 0")
    doc = {"_id": new_id(), "resellerId": body.resellerId, "type": body.type, "date": body.date or today().isoformat(),
           "qty": body.qty, "amount": body.amount, "note": body.note, "by": user["name"], "createdAt": now_iso()}
    if body.type == "complaint":
        doc["status"] = "open"
    await get_db().activities.insert_one(doc)
    orders_after = await get_db().activities.count_documents({"resellerId": body.resellerId, "type": "order"})
    changes = apply_activity_rules(r, {**doc, "nextFollowUp": body.nextFollowUp}, orders_after, await get_settings())
    if changes:
        await get_db().resellers.update_one({"_id": body.resellerId}, {"$set": {**changes, "updatedAt": now_iso()}})
    return {"activity": public(doc), "reseller": await enriched_reseller(body.resellerId)}


@router.post("/activities/{aid}/resolve")
async def resolve_complaint(aid: str, _: dict = Depends(require(*WRITE_ROLES))):
    res = await get_db().activities.update_one({"_id": aid, "type": "complaint"},
                                               {"$set": {"status": "resolved", "resolvedAt": today().isoformat()}})
    if not res.matched_count:
        raise HTTPException(404, "Complaint tidak ditemukan")
    return {"ok": True}


@router.delete("/activities/{aid}")
async def delete_activity(aid: str, _: dict = Depends(require(*WRITE_ROLES))):
    res = await get_db().activities.delete_one({"_id": aid})
    if not res.deleted_count:
        raise HTTPException(404, "Aktivitas tidak ditemukan")
    return {"ok": True}


# ================= CMS & SETTINGS =================
@router.get("/cms")
async def read_cms(_: dict = Depends(current_user)):
    return await get_cms()


@router.put("/cms")
async def write_cms(body: CmsIn, _: dict = Depends(require(*CMS_ROLES))):
    data = body.model_dump()
    data["tiers"] = sorted(data["tiers"], key=lambda t: t["minPacks"])
    await get_db().config.update_one({"_id": "cms"}, {"$set": data}, upsert=True)
    return await get_cms()


@router.get("/settings")
async def read_settings(_: dict = Depends(current_user)):
    return await get_settings()


@router.put("/settings")
async def write_settings(body: SettingsIn, _: dict = Depends(require("admin"))):
    data = body.model_dump()
    for k in ("pic", "channel", "area"):
        data[k] = [s.strip() for s in data[k] if s.strip()]
    await get_db().config.update_one({"_id": "settings"}, {"$set": data}, upsert=True)
    return await get_settings()


# ================= DASHBOARD =================
@router.get("/dashboard")
async def dashboard(period: str = "all", _: dict = Depends(current_user)):
    rows = await enriched_resellers()
    cms = await get_cms()
    t = today().isoformat()
    days = {"30": 30, "90": 90, "365": 365}.get(period)
    cutoff = ""
    if days:
        from datetime import timedelta
        cutoff = (today() - timedelta(days=days)).isoformat()
    all_acts = [public(a) async for a in get_db().activities.find({"type": "order"})]
    orders_p = [a for a in all_acts if not cutoff or a.get("date", "") >= cutoff]
    revenue = sum(int(a.get("amount") or 0) for a in orders_p)
    buyers = [r for r in rows if r["ordersCount"] > 0]
    repeat = [r for r in rows if r["isRepeat"]]
    by_status = {s: sum(1 for r in rows if r["status"] == s) for s in ("Lead", "Aktif", "Pasif", "Churn")}
    kpi = {
        "total": len(rows),
        "newInPeriod": sum(1 for r in rows if not cutoff or r.get("createdAt", "")[:10] >= cutoff),
        "byStatus": by_status,
        "buyers": len(buyers),
        "repeat": len(repeat),
        "repeatRate": round(len(repeat) / len(buyers), 4) if buyers else 0,
        "revenue": revenue,
        "orders": len(orders_p),
        "aov": round(revenue / len(orders_p)) if orders_p else 0,
        "openComplaints": sum(r["openComplaints"] for r in rows),
    }
    main_ids = [s["id"] for s in STAGES if not s.get("side")]
    stage_counts = [{"stage": s["id"], "label": s["label"], "owner": s["owner"], "side": bool(s.get("side")),
                     "count": sum(1 for r in rows if r.get("stage", "lead") == s["id"])} for s in STAGES]
    from .rules import stage_index
    funnel = [{"stage": sid, "label": next(s["label"] for s in STAGES if s["id"] == sid),
               "count": sum(1 for r in rows if stage_index(r.get("stage", "lead")) >= i)}
              for i, sid in enumerate(main_ids)]
    tiers = [{"tier": tname, "count": sum(1 for r in buyers if r["tier"] == tname)} for tname in [x["name"] for x in cms.get("tiers", [])]]
    pics: dict[str, dict] = {}
    for r in rows:
        p = pics.setdefault(r.get("pic") or "(tanpa PIC)", {"pic": r.get("pic") or "(tanpa PIC)", "resellers": 0, "repeat": 0, "revenue": 0})
        p["resellers"] += 1
        p["repeat"] += 1 if r["isRepeat"] else 0
        p["revenue"] += r["totalRevenue"]
    todo = []
    for r in rows:
        if r["openComplaints"]:
            todo.append({"id": r["id"], "name": r["name"], "pic": r.get("pic", ""), "kind": "complaint", "text": f"{r['openComplaints']} complaint open"})
        if r.get("nextFollowUp") and r["nextFollowUp"] <= t:
            todo.append({"id": r["id"], "name": r["name"], "pic": r.get("pic", ""), "kind": "followup", "text": f"Follow-up jatuh tempo {r['nextFollowUp']}"})
        elif r["status"] == "Pasif":
            todo.append({"id": r["id"], "name": r["name"], "pic": r.get("pic", ""), "kind": "pasif", "text": f"Pasif {r['daysSinceLastOrder']} hari, perlu reaktivasi"})
    top = sorted(buyers, key=lambda r: r["totalRevenue"], reverse=True)[:10]
    return {"kpi": kpi, "stages": stage_counts, "funnel": funnel, "tiers": tiers,
            "pics": sorted(pics.values(), key=lambda p: p["resellers"], reverse=True), "todo": todo,
            "top": [{k: r[k] for k in ("id", "name", "area", "tier", "ordersCount", "totalPacks", "totalRevenue", "lastOrderDate")} for r in top],
            "today": t}


# ================= DATA (seed / wipe) =================
@router.post("/admin/seed")
async def seed(_: dict = Depends(require("admin"))):
    from datetime import timedelta
    from random import Random

    rnd = Random(7)
    settings, cms = await get_settings(), await get_cms()
    price = cms.get("pricePerPack") or 35000
    names = [("Toko Frozen Bu Rina", "Bandung", "WhatsApp"), ("Warung Dapur Kiki", "Cimahi", "Instagram"),
             ("Snack Corner Depok", "Jabodetabek", "Shopee"), ("Rere Frozen Food", "Bandung", "TikTok"),
             ("Kios Jajan Ceu Imas", "Bandung", "Walk-in"), ("Reseller Bekasi Asep", "Jabodetabek", "Referral"),
             ("Frozen Mart Dago", "Bandung", "Instagram"), ("Dapur Mamah Bogor", "Jabodetabek", "WhatsApp")]
    stages = ["lead", "form", "order1", "repeat", "education", "tier", "support", "retention"]
    t = today()
    for i, (n, area, ch) in enumerate(names):
        rid = new_id()
        created = (t - timedelta(days=60 - i * 7)).isoformat()
        await get_db().resellers.insert_one({"_id": rid, "name": n, "phone": f"08{1200000000 + i * 7351}", "area": area, "channel": ch,
                                             "pic": settings["pic"][i % len(settings["pic"])], "stage": stages[i], "tierManual": "",
                                             "address": "", "nextFollowUp": "", "notes": "Data contoh", "createdAt": created, "updatedAt": now_iso()})
        n_orders = 0 if i < 2 else 1 if i < 3 else i + 1
        for k in range(n_orders):
            qty = 10 + k * 5 + i * 3
            d = (t - timedelta(days=(n_orders - 1 - k) * 9 + 2 + i)).isoformat()
            await get_db().activities.insert_one({"_id": new_id(), "resellerId": rid, "type": "order", "date": d, "qty": qty,
                                                  "amount": qty * price, "note": "Cimol Bojot AA Frozen", "by": "seed", "createdAt": now_iso()})
        if i == 4:
            await get_db().activities.insert_one({"_id": new_id(), "resellerId": rid, "type": "complaint", "date": t.isoformat(), "status": "open",
                                                  "note": "Packaging penyok saat pengiriman", "by": "seed", "createdAt": now_iso()})
        if i == 2:
            await get_db().resellers.update_one({"_id": rid}, {"$set": {"nextFollowUp": (t - timedelta(days=2)).isoformat()}})
    return {"ok": True, "inserted": len(names)}


@router.post("/admin/wipe")
async def wipe(_: dict = Depends(require("admin"))):
    await get_db().activities.delete_many({})
    await get_db().resellers.delete_many({})
    return {"ok": True}
