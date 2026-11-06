import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import hash_password
from .config import ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, FRONTEND_URL
from .db import ensure_indexes, get_db
from .routes import router
from .service import new_id, now_iso

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")


async def ensure_admin() -> None:
    db = get_db()
    if await db.users.count_documents({}) == 0:
        await db.users.insert_one({"_id": new_id(), "email": ADMIN_EMAIL.lower(), "name": ADMIN_NAME, "role": "admin",
                                   "active": True, "passwordHash": hash_password(ADMIN_PASSWORD), "createdAt": now_iso()})


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Jangan matikan server bila database belum siap: healthcheck tetap jalan, error tampil di log.
    try:
        await ensure_indexes()
        await ensure_admin()
        app.state.db_ok = True
    except Exception as exc:  # noqa: BLE001
        app.state.db_ok = False
        app.state.db_error = f"{type(exc).__name__}: {exc}"
        logging.error("DATABASE TIDAK TERHUBUNG. Periksa MONGO_URL dan Network Access di Atlas. Detail: %s", app.state.db_error)
    yield


app = FastAPI(title="CRK Reseller Hub API", version="1.0.0", lifespan=lifespan)

origins = [o.strip() for o in FRONTEND_URL.split(",")] if FRONTEND_URL != "*" else ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/api/health")
async def health():
    ok = getattr(app.state, "db_ok", False)
    if not ok:
        try:
            await get_db().command("ping")
            await ensure_indexes(); await ensure_admin()
            app.state.db_ok = ok = True
        except Exception as exc:  # noqa: BLE001
            app.state.db_error = f"{type(exc).__name__}: {exc}"
    return {"ok": True, "database": "terhubung" if ok else "GAGAL: " + getattr(app.state, "db_error", "")}


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"Terjadi kesalahan server: {type(exc).__name__}"})


# Bila frontend sudah di-build ke backend/static, backend melayani SPA-nya (deploy satu layanan).
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        file = os.path.join(STATIC_DIR, path)
        if path and os.path.isfile(file):
            return FileResponse(file)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
