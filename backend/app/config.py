import os

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017/?serverSelectionTimeoutMS=5000")
DB_NAME = os.getenv("DB_NAME", "reseller")
JWT_SECRET = os.getenv("JWT_SECRET", "ganti-secret-ini-di-production")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "72"))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@crk.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_NAME = os.getenv("ADMIN_NAME", "Admin CRK")
FRONTEND_URL = os.getenv("FRONTEND_URL", "*")
TZ = os.getenv("TZ", "Asia/Jakarta")

ROLES = ["admin", "crm", "cs", "gudang", "viewer"]
