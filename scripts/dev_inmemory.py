"""Jalankan backend dengan database in-memory (tanpa MongoDB) untuk uji coba lokal.

    pip install -r backend/requirements-dev.txt
    python scripts/dev_inmemory.py            # http://localhost:8000

Data hilang saat proses dihentikan. Untuk produksi pakai MongoDB (MONGO_URL).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import uvicorn  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from app import db as dbmod  # noqa: E402

dbmod.set_db(AsyncMongoMockClient()["reseller"])

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), app_dir=os.path.join(os.path.dirname(__file__), "..", "backend"))
