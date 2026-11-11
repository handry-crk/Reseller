import base64
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from .auth import CMS_ROLES, WRITE_ROLES, current_user, hash_password, make_token, require, verify_password
from .db import get_db
from .defaults import ORDER_STATUSES, STAGES
from .rules import apply_activity_rules, monthly_revenue, stage_after_order_removed, today
from .schemas import ApproveIn, ListsIn, ProofIn, RegisterIn, ActivityIn, ChangePasswordIn, CmsIn, LoginIn, OrderUpdateIn, ResellerIn, SettingsIn, StageIn, UserIn
from .service import (
    activities_by_reseller,
    enriched_reseller,
    enriched_resellers,
    get_cms,
    get_settings,
    new_id,
    next_invoice_no,
    now_iso,
    order_money,
    price_items,
    public,
)
PROOF_MIMES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
PROOF_MAX_BYTES = 2 * 1024 * 1024

ORDER_STATUS_ROLES = ("admin", "crm", "gudang")

router = APIRouter(prefix="/api")


# ================= AUTH & USERS =================
@router.post("/auth/login")
async def login(body: LoginIn):
    user = await get_db().users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(401, "Email atau kata sandi salah")
    if user.get("status") == "pending":
        raise HTTPException(401, "Akun Anda menunggu persetujuan Admin. Hubungi Admin CRK untuk aktivasi.")
    if not user.get("active", True):
        raise HTTPException(401, "Akun dinonaktifkan")
    return {"token": make_token(user), "user": public(user)}


# Akhiran domain yang sah untuk entri tanpa titik: satu label TLD (com, id, net, …) atau
# domain tingkat dua Indonesia (co.id, my.id, web.id, …). Mencegah citarasakuliner.com.evil.io.
ID_SLD = {"co", "my", "web", "biz", "ac", "or", "sch", "net", "go", "ponpes", "desa"}


def email_domain_ok(email: str, domains: list[str]) -> bool:
    """Entri "citarasakuliner" cocok dengan citarasakuliner.com / .co.id / .id; entri berisi titik harus sama persis."""
    dom = email.rsplit("@", 1)[-1].lower().strip()
    for d in domains or []:
        d = d.lower().strip().lstrip("@")
        if not d:
            continue
        if dom == d:
            return True
        if "." not in d and dom.startswith(d + "."):
            rest = dom[len(d) + 1:].split(".")
            if all(x.isalpha() and 2 <= len(x) <= 6 for x in rest) and (
                    len(rest) == 1 or (len(rest) == 2 and rest[0] in ID_SLD and rest[1] == "id")):
                return True
    return False


def domain_hint(domains: list[str]) -> str:
    return ", ".join("@" + d.lstrip("@") + ("…" if "." not in d else "") for d in domains if d.strip()) or "(belum diatur)"


@router.get("/auth/register-info")
async def register_info():
    """Info publik untuk halaman daftar: domain email yang diizinkan."""
    return {"emailDomains": (await get_settings()).get("emailDomains", [])}


@router.post("/auth/register")
async def register(body: RegisterIn):
    """Pendaftaran member baru. Akun dibuat nonaktif (pending) sampai disetujui Admin."""
    email = body.email.lower().strip()
    domains = (await get_settings()).get("emailDomains", [])
    if not email_domain_ok(email, domains):
        raise HTTPException(422, f"Pendaftaran hanya untuk email perusahaan ({domain_hint(domains)})")
    if await get_db().users.find_one({"email": email}):
        raise HTTPException(409, "Email sudah terdaftar. Silakan login, atau hubungi Admin bila lupa kata sandi.")
    doc = {"_id": new_id(), "email": email, "name": body.name.strip(), "role": "viewer", "active": False, "status": "pending",
           "passwordHash": hash_password(body.password), "createdAt": now_iso()}
    await get_db().users.insert_one(doc)
    return {"ok": True, "message": "Pendaftaran terkirim. Akun aktif setelah disetujui Admin."}


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
    domains = (await get_settings()).get("emailDomains", [])
    if not email_domain_ok(body.email, domains):
        raise HTTPException(422, f"Email user harus berdomain perusahaan ({domain_hint(domains)})")
    if await get_db().users.find_one({"email": body.email.lower()}):
        raise HTTPException(409, "Email sudah terdaftar")
    doc = {"_id": new_id(), "email": body.email.lower(), "name": body.name, "role": body.role, "active": body.active,
           "status": "approved", "passwordHash": hash_password(body.password), "createdAt": now_iso()}
    await get_db().users.insert_one(doc)
    return public(doc)


@router.put("/users/{uid}")
async def update_user(uid: str, body: UserIn, admin: dict = Depends(require("admin"))):
    cur = await get_db().users.find_one({"_id": uid})
    if not cur:
        raise HTTPException(404, "User tidak ditemukan")
    upd = {"email": body.email.lower(), "name": body.name, "role": body.role, "active": body.active}
    if body.active:
        upd["status"] = "approved"
    if upd["email"] != cur.get("email"):
        domains = (await get_settings()).get("emailDomains", [])
        if not email_domain_ok(upd["email"], domains):
            raise HTTPException(422, f"Email user harus berdomain perusahaan ({domain_hint(domains)})")
    if uid == admin["_id"] and (body.role != "admin" or not body.active):
        raise HTTPException(400, "Tidak bisa menurunkan/menonaktifkan akun Anda sendiri")
    if body.password:
        upd["passwordHash"] = hash_password(body.password)
    if await get_db().users.find_one({"email": body.email.lower(), "_id": {"$ne": uid}}):
        raise HTTPException(409, "Email sudah dipakai user lain")
    res = await get_db().users.update_one({"_id": uid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "User tidak ditemukan")
    return public(await get_db().users.find_one({"_id": uid}))


@router.post("/users/{uid}/approve")
async def approve_user(uid: str, body: ApproveIn, admin: dict = Depends(require("admin"))):
    res = await get_db().users.update_one({"_id": uid, "status": "pending"},
                                          {"$set": {"status": "approved", "active": True, "role": body.role,
                                                    "approvedBy": admin["name"], "approvedAt": now_iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Pendaftar tidak ditemukan atau sudah diproses")
    return public(await get_db().users.find_one({"_id": uid}))


@router.delete("/users/{uid}")
async def delete_user(uid: str, admin: dict = Depends(require("admin"))):
    if uid == admin["_id"]:
        raise HTTPException(400, "Tidak bisa menghapus akun Anda sendiri")
    await get_db().users.delete_one({"_id": uid})
    return {"ok": True}


# ================= META =================
@router.get("/meta")
async def meta(user: dict = Depends(current_user)):
    pending = await get_db().users.count_documents({"status": "pending"}) if user["role"] == "admin" else 0
    return {"stages": STAGES, "orderStatuses": ORDER_STATUSES, "settings": await get_settings(), "cms": await get_cms(),
            "today": today().isoformat(), "pendingUsers": pending}


# ================= RESELLERS =================
@router.get("/resellers")
async def list_resellers(_: dict = Depends(current_user)):
    rows = await enriched_resellers()
    rows.sort(key=lambda r: r.get("updatedAt", ""), reverse=True)
    return rows


@router.post("/resellers")
async def create_reseller(body: ResellerIn, _: dict = Depends(require(*WRITE_ROLES))):
    data = normalize_reseller(body.model_dump())
    # Pengaman klik ganda / data ganda: nama + no. WA yang sama tidak boleh dibuat dua kali.
    if data["phone"]:
        dup = await get_db().resellers.find_one({"name": {"$regex": f"^{re.escape(data['name'])}$", "$options": "i"}, "phone": data["phone"]})
        if dup:
            raise HTTPException(409, f"Reseller \"{data['name']}\" dengan no. WA yang sama sudah ada")
    doc = {"_id": new_id(), **data, "createdAt": now_iso(), "updatedAt": now_iso()}
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
    r["monthly"] = monthly_revenue(acts)
    return r


@router.put("/resellers/{rid}")
async def update_reseller(rid: str, body: ResellerIn, user: dict = Depends(require(*WRITE_ROLES))):
    r = await get_db().resellers.find_one({"_id": rid})
    if not r:
        raise HTTPException(404, "Reseller tidak ditemukan")
    data = normalize_reseller(body.model_dump())
    await get_db().resellers.update_one({"_id": rid}, {"$set": {**data, "updatedAt": now_iso()}})
    if data["stage"] != r.get("stage", "lead"):
        await log_stage(rid, r.get("stage", "lead"), data["stage"], user["name"], auto=False)
    return await enriched_reseller(rid)


def normalize_reseller(d: dict) -> dict:
    d["name"] = d["name"].strip()
    d["phone"] = re.sub(r"\D", "", d.get("phone") or "")
    return d


async def log_stage(rid: str, from_stage: str, to_stage: str, by: str, auto: bool, date_: str | None = None) -> None:
    label = next(s["label"] for s in STAGES if s["id"] == to_stage)
    await get_db().activities.insert_one({"_id": new_id(), "resellerId": rid, "type": "stage", "date": date_ or today().isoformat(),
                                          "fromStage": from_stage, "toStage": to_stage, "auto": auto,
                                          "note": ("Otomatis pindah ke tahap: " if auto else "Pindah ke tahap: ") + label, "by": by, "createdAt": now_iso()})


@router.post("/resellers/{rid}/stage")
async def move_stage(rid: str, body: StageIn, user: dict = Depends(require(*WRITE_ROLES))):
    r = await get_db().resellers.find_one({"_id": rid})
    if not r:
        raise HTTPException(404, "Reseller tidak ditemukan")
    if body.stage == r.get("stage", "lead"):
        return await enriched_reseller(rid)
    await get_db().resellers.update_one({"_id": rid}, {"$set": {"stage": body.stage, "updatedAt": now_iso()}})
    await log_stage(rid, r.get("stage", "lead"), body.stage, user["name"], auto=False)
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
    items: list[dict] = []
    if body.type == "order" and body.items:
        try:
            items, total_qty, total_amount = price_items([i.model_dump() for i in body.items], (await get_cms()).get("products", []))
        except ValueError as e:
            raise HTTPException(422, str(e))
        body.qty, body.amount = total_qty, total_amount  # total selalu dihitung server dari item
    money: dict = {}
    if body.type == "order":
        try:
            money = order_money(body.amount, body.discount, body.shippingFee)
        except ValueError as e:
            raise HTTPException(422, str(e))
        body.amount = money["amount"]
    if body.type == "order" and body.qty <= 0:
        raise HTTPException(422, "Jumlah pack harus lebih dari 0")
    doc = {"_id": new_id(), "resellerId": body.resellerId, "type": body.type, "date": body.date or today().isoformat(),
           "qty": body.qty, "amount": body.amount, "note": body.note, "by": user["name"], "createdAt": now_iso()}
    if body.type == "complaint":
        doc["status"] = "open"
    if body.type == "order":
        doc["items"] = items
        doc.update({k: money[k] for k in ("subtotal", "discount", "shippingFee")})
        doc["status"] = body.status or "to_ship"
        doc["receivedDate"] = body.receivedDate
        doc["invoiceNo"] = await next_invoice_no(doc["date"][:7])
    await get_db().activities.insert_one(doc)
    orders_after = await get_db().activities.count_documents({"resellerId": body.resellerId, "type": "order"})
    changes = apply_activity_rules(r, {**doc, "nextFollowUp": body.nextFollowUp}, orders_after, await get_settings())
    if changes:
        await get_db().resellers.update_one({"_id": body.resellerId}, {"$set": {**changes, "updatedAt": now_iso()}})
        if changes.get("stage") and changes["stage"] != r.get("stage"):
            await log_stage(body.resellerId, r.get("stage", "lead"), changes["stage"], user["name"], auto=True, date_=doc["date"])
    return {"activity": public(doc), "reseller": await enriched_reseller(body.resellerId)}


@router.post("/activities/{aid}/resolve")
async def resolve_complaint(aid: str, _: dict = Depends(require(*WRITE_ROLES))):
    res = await get_db().activities.update_one({"_id": aid, "type": "complaint"},
                                               {"$set": {"status": "resolved", "resolvedAt": today().isoformat()}})
    if not res.matched_count:
        raise HTTPException(404, "Complaint tidak ditemukan")
    return {"ok": True}


@router.get("/activities/{aid}")
async def get_activity(aid: str, _: dict = Depends(current_user)):
    """Detail satu aktivitas (dipakai halaman invoice), termasuk data reseller & perusahaan."""
    a = await get_db().activities.find_one({"_id": aid})
    if not a:
        raise HTTPException(404, "Aktivitas tidak ditemukan")
    r = await get_db().resellers.find_one({"_id": a["resellerId"]})
    return {"activity": public(a), "reseller": public(r) if r else None, "company": (await get_settings())["company"],
            "cms": {"pricePerPack": (await get_cms()).get("pricePerPack", 0)}}


@router.put("/activities/{aid}")
async def update_order(aid: str, body: OrderUpdateIn, user: dict = Depends(require(*WRITE_ROLES, "gudang"))):
    a = await get_db().activities.find_one({"_id": aid, "type": "order"})
    if not a:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if user["role"] == "gudang":
        data = {k: v for k, v in data.items() if k in ("status", "receivedDate")}
    if "status" in data and user["role"] not in ORDER_STATUS_ROLES:
        raise HTTPException(403, "Status pesanan hanya bisa diubah oleh Admin, CRM, atau Gudang")
    if data.get("status") == "completed" and not (data.get("receivedDate") or a.get("receivedDate")):
        data["receivedDate"] = today().isoformat()
    if "status" in data and data["status"] != "completed":
        data["receivedDate"] = ""
    if "date" in data and a.get("invoiceNo") and data["date"][:7] != a.get("date", "")[:7]:
        raise HTTPException(422, "Tanggal pesanan tidak bisa dipindah ke bulan lain karena nomor invoice sudah terbit")
    if "items" in data:
        if not data["items"]:
            raise HTTPException(422, "Pesanan minimal berisi satu produk")
        try:
            data["items"], data["qty"], data["subtotal"] = price_items(data["items"], (await get_cms()).get("products", []))
        except ValueError as e:
            raise HTTPException(422, str(e))
    if any(k in data for k in ("items", "discount", "shippingFee")):
        cur = public(a)
        try:
            money = order_money(int(data.get("subtotal", cur["subtotal"])), int(data.get("discount", cur["discount"])),
                                int(data.get("shippingFee", cur["shippingFee"])))
        except ValueError as e:
            raise HTTPException(422, str(e))
        data.update(money)
    elif a.get("items") and ("qty" in data or "amount" in data):
        raise HTTPException(422, "Pesanan berisi rincian produk: ubah lewat daftar produk, bukan total")
    if "qty" in data and data["qty"] <= 0:
        raise HTTPException(422, "Jumlah pack harus lebih dari 0")
    data["updatedAt"] = now_iso()
    data["updatedBy"] = user["name"]
    await get_db().activities.update_one({"_id": aid}, {"$set": data})
    return public(await get_db().activities.find_one({"_id": aid}))


@router.get("/stage-history")
async def stage_history(month: str | None = None, _: dict = Depends(current_user)):
    """Riwayat perpindahan tahap (manual & otomatis). month = YYYY-MM."""
    labels = {s["id"]: s["label"] for s in STAGES}
    rows = [public(a) async for a in get_db().activities.find({"type": "stage"})]
    if month:
        rows = [a for a in rows if a.get("date", "").startswith(month)]
    names = {r["_id"]: r async for r in get_db().resellers.find({}, {"name": 1, "pic": 1})}
    for a in rows:
        r = names.get(a["resellerId"], {})
        a["resellerName"] = r.get("name", "(terhapus)")
        a["pic"] = r.get("pic", "")
        a["fromLabel"] = labels.get(a.get("fromStage"), "") if a.get("fromStage") else ""
        a["toLabel"] = labels.get(a.get("toStage"), "") or (a.get("note", "").split(": ", 1)[-1] if a.get("note") else "")
    rows.sort(key=lambda a: (a.get("date", ""), a.get("createdAt", "")), reverse=True)
    per_stage = [{"stage": s["id"], "label": s["label"], "count": sum(1 for a in rows if (a.get("toStage") or "") == s["id"] or (not a.get("toStage") and a["toLabel"] == s["label"])) } for s in STAGES]
    return {"rows": rows, "perStage": per_stage, "total": len(rows), "resellers": len({a["resellerId"] for a in rows})}


@router.get("/orders")
async def list_orders(month: str | None = None, status: str | None = None, _: dict = Depends(current_user)):
    """Daftar pesanan untuk monitoring gudang/admin. month = YYYY-MM."""
    q: dict = {"type": "order"}
    if status:
        q["status"] = status if status != "completed" else {"$in": ["completed", None]}
    rows = [public(a) async for a in get_db().activities.find(q)]
    if month:
        rows = [a for a in rows if a.get("date", "").startswith(month)]
    names = {r["_id"]: r async for r in get_db().resellers.find({}, {"name": 1, "phone": 1, "area": 1, "pic": 1})}
    for a in rows:
        r = names.get(a["resellerId"], {})
        a["resellerName"] = r.get("name", "(terhapus)")
        a["resellerPhone"] = r.get("phone", "")
        a["resellerArea"] = r.get("area", "")
        a["pic"] = r.get("pic", "")
    rows.sort(key=lambda a: (a.get("date", ""), a.get("createdAt", "")), reverse=True)
    all_orders = [public(a) async for a in get_db().activities.find({"type": "order"})]
    counts = {st["id"]: sum(1 for a in all_orders if a.get("status") == st["id"]) for st in ORDER_STATUSES}
    per_product: dict[str, dict] = {}
    for a in rows:
        lines = a.get("items") or [{"product": "(tanpa rincian produk)", "qty": a.get("qty", 0), "subtotal": a.get("amount", 0)}]
        for it in lines:
            p = per_product.setdefault(it["product"], {"product": it["product"], "packs": 0, "revenue": 0})
            p["packs"] += int(it.get("qty") or 0)
            p["revenue"] += int(it.get("subtotal") or 0)
    return {"orders": rows, "counts": counts, "monthly": monthly_revenue(all_orders), "statuses": ORDER_STATUSES,
            "products": sorted(per_product.values(), key=lambda p: p["packs"], reverse=True),
            "totals": {"orders": len(rows), "packs": sum(a.get("qty", 0) for a in rows), "revenue": sum(a.get("amount", 0) for a in rows),
                       "shipping": sum(a.get("shippingFee", 0) for a in rows), "discount": sum(a.get("discount", 0) for a in rows),
                       "totalPaid": sum(a.get("totalPaid", 0) for a in rows),
                       "withProof": sum(1 for a in rows if a.get("paymentProof"))}}


@router.delete("/activities/{aid}")
async def delete_activity(aid: str, user: dict = Depends(require("admin", "crm"))):
    a = await get_db().activities.find_one({"_id": aid})
    if not a:
        raise HTTPException(404, "Aktivitas tidak ditemukan")
    if a.get("type") == "stage":
        raise HTTPException(403, "Riwayat tahap tidak bisa dihapus")
    await get_db().activities.delete_one({"_id": aid})
    await get_db().proofs.delete_one({"_id": aid})
    if a.get("type") == "order":
        r = await get_db().resellers.find_one({"_id": a["resellerId"]})
        if r:
            left = await get_db().activities.count_documents({"resellerId": a["resellerId"], "type": "order"})
            changes = stage_after_order_removed(r, left)
            if changes:
                await get_db().resellers.update_one({"_id": r["_id"]}, {"$set": {**changes, "updatedAt": now_iso()}})
                if changes.get("stage"):
                    await log_stage(r["_id"], r.get("stage", "lead"), changes["stage"], user["name"], auto=True)
    return {"ok": True}


# ================= CMS & SETTINGS =================
@router.get("/cms")
async def read_cms(_: dict = Depends(current_user)):
    return await get_cms()


@router.put("/cms")
async def write_cms(body: CmsIn, _: dict = Depends(require(*CMS_ROLES))):
    data = body.model_dump()
    data["tiers"] = sorted(data["tiers"], key=lambda t: t["minPacks"])
    seen = set()
    for p in data.get("products", []):
        p["name"] = p["name"].strip()
        if p["name"].lower() in seen:
            raise HTTPException(422, f"Produk \"{p['name']}\" tercantum dua kali")
        seen.add(p["name"].lower())
    await get_db().config.update_one({"_id": "cms"}, {"$set": data}, upsert=True)
    return await get_cms()


@router.post("/activities/{aid}/proof")
async def upload_proof(aid: str, body: ProofIn, user: dict = Depends(require(*WRITE_ROLES))):
    """Upload / ganti bukti transfer sebuah pesanan (gambar JPG/PNG/WebP atau PDF, maks 2 MB)."""
    a = await get_db().activities.find_one({"_id": aid, "type": "order"})
    if not a:
        raise HTTPException(404, "Pesanan tidak ditemukan")
    if body.mime not in PROOF_MIMES:
        raise HTTPException(422, "Format file harus JPG, PNG, WebP, atau PDF")
    try:
        raw = base64.b64decode(body.data, validate=True)
    except Exception:
        raise HTTPException(422, "File tidak terbaca")
    if not raw:
        raise HTTPException(422, "File kosong")
    if len(raw) > PROOF_MAX_BYTES:
        raise HTTPException(422, "Ukuran file maksimal 2 MB")
    sig = {"image/jpeg": raw[:3] == b"\xff\xd8\xff", "image/png": raw[:8] == b"\x89PNG\r\n\x1a\n",
           "image/webp": raw[:4] == b"RIFF" and raw[8:12] == b"WEBP", "application/pdf": raw[:5] == b"%PDF-"}[body.mime]
    if not sig:
        raise HTTPException(422, "Isi file tidak sesuai formatnya")
    meta_ = {"name": body.name[:200], "mime": body.mime, "size": len(raw), "uploadedAt": now_iso(), "uploadedBy": user["name"]}
    await get_db().proofs.replace_one({"_id": aid}, {"_id": aid, "data": body.data, **meta_}, upsert=True)
    await get_db().activities.update_one({"_id": aid}, {"$set": {"paymentProof": meta_}})
    return public(await get_db().activities.find_one({"_id": aid}))


@router.get("/activities/{aid}/proof")
async def get_proof(aid: str, _: dict = Depends(current_user)):
    p = await get_db().proofs.find_one({"_id": aid})
    if not p:
        raise HTTPException(404, "Bukti transfer belum diupload")
    return Response(content=base64.b64decode(p["data"]), media_type=p["mime"],
                    headers={"Content-Disposition": f'inline; filename="bukti-{aid}"', "X-Content-Type-Options": "nosniff",
                             "Cache-Control": "private, max-age=300"})


@router.delete("/activities/{aid}/proof")
async def delete_proof(aid: str, _: dict = Depends(require("admin", "crm"))):
    await get_db().proofs.delete_one({"_id": aid})
    await get_db().activities.update_one({"_id": aid}, {"$set": {"paymentProof": None}})
    return {"ok": True}


@router.put("/settings/lists")
async def write_lists(body: ListsIn, _: dict = Depends(require(*WRITE_ROLES))):
    """CS, CRM, dan Admin boleh mengubah daftar PIC, channel, dan area."""
    data = {}
    for k in ("pic", "channel", "area"):
        vals, seen = [], set()
        for x in getattr(body, k):
            x = x.strip()
            if x and x.lower() not in seen:
                seen.add(x.lower()); vals.append(x)
        if not vals:
            raise HTTPException(422, {"pic": "Daftar PIC", "channel": "Daftar channel", "area": "Daftar area"}[k] + " minimal berisi satu")
        data[k] = vals
    await get_db().config.update_one({"_id": "settings"}, {"$set": data}, upsert=True)
    return await get_settings()


@router.get("/settings")
async def read_settings(_: dict = Depends(current_user)):
    return await get_settings()


@router.put("/settings")
async def write_settings(body: SettingsIn, _: dict = Depends(require("admin"))):
    data = body.model_dump()
    for k in ("pic", "channel", "area"):
        data[k] = [x.strip() for x in data[k] if x.strip()]
    data["emailDomains"] = [d.strip().lower().lstrip("@") for d in data.get("emailDomains", []) if d.strip()]
    if not data["emailDomains"]:
        raise HTTPException(422, "Minimal satu domain email harus diisi")
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
    order_counts = {st["id"]: sum(1 for a in all_acts if a.get("status") == st["id"]) for st in ORDER_STATUSES}
    return {"kpi": kpi, "stages": stage_counts, "funnel": funnel, "tiers": tiers, "monthly": monthly_revenue(all_acts),
            "orderCounts": order_counts,
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
    prods = cms.get("products") or []
    price = (prods[0]["price"] if prods else cms.get("pricePerPack")) or 23800
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
            last = k == n_orders - 1
            await get_db().activities.insert_one({"_id": new_id(), "resellerId": rid, "type": "order", "date": d, "qty": qty,
                                                  "amount": qty * price, "note": "Data contoh", "by": "seed", "createdAt": now_iso(),
                                                  "items": [{"product": prods[(i + k) % len(prods)]["name"], "qty": qty, "price": price, "subtotal": qty * price}] if prods else [],
                                                  "status": "to_ship" if last and i % 3 == 0 else "shipping" if last and i % 3 == 1 else "completed",
                                                  "receivedDate": "" if last and i % 3 != 2 else d, "invoiceNo": await next_invoice_no(d[:7])})
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
