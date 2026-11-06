from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import DB_NAME, MONGO_URL

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(MONGO_URL)
        _db = _client[DB_NAME]
    return _db


def set_db(db: AsyncIOMotorDatabase) -> None:
    """Dipakai oleh test untuk menyuntikkan database in-memory."""
    global _db
    _db = db


async def ensure_indexes() -> None:
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.resellers.create_index("stage")
    await db.resellers.create_index("pic")
    await db.activities.create_index([("resellerId", 1), ("date", -1)])
    await db.activities.create_index("type")
