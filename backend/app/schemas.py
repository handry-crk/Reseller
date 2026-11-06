from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .config import ROLES
from .defaults import STAGE_IDS

Role = Literal["admin", "crm", "cs", "viewer"]
ActivityType = Literal["order", "followup", "complaint", "education", "stage"]


# ---------- Auth / Users ----------
class LoginIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$")
    password: str


class UserOut(BaseModel):
    id: str
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$")
    name: str
    role: Role
    active: bool = True


class UserIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+$")
    name: str = Field(min_length=1, max_length=80)
    role: Role = "cs"
    password: Optional[str] = Field(default=None, min_length=6)
    active: bool = True

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in ROLES:
            raise ValueError("Role tidak dikenal")
        return v


class ChangePasswordIn(BaseModel):
    password: str = Field(min_length=6)


# ---------- Reseller ----------
class ResellerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = ""
    area: str = ""
    channel: str = ""
    pic: str = ""
    stage: str = "lead"
    tierManual: str = ""
    address: str = ""
    nextFollowUp: str = ""  # yyyy-mm-dd atau ""
    notes: str = ""

    @field_validator("stage")
    @classmethod
    def _stage(cls, v: str) -> str:
        if v not in STAGE_IDS:
            raise ValueError("Tahap tidak dikenal")
        return v

    @field_validator("nextFollowUp")
    @classmethod
    def _fu(cls, v: str) -> str:
        if v:
            date.fromisoformat(v)
        return v


class StageIn(BaseModel):
    stage: str

    @field_validator("stage")
    @classmethod
    def _stage(cls, v: str) -> str:
        if v not in STAGE_IDS:
            raise ValueError("Tahap tidak dikenal")
        return v


# ---------- Activity ----------
class ActivityIn(BaseModel):
    resellerId: str
    type: ActivityType
    date: str = ""  # yyyy-mm-dd, default hari ini
    qty: int = 0
    amount: int = 0
    note: str = ""
    nextFollowUp: str = ""  # hanya untuk followup

    @field_validator("date", "nextFollowUp")
    @classmethod
    def _d(cls, v: str) -> str:
        if v:
            date.fromisoformat(v)
        return v


# ---------- CMS / Settings ----------
class Tier(BaseModel):
    name: str = Field(min_length=1)
    minPacks: int = 0
    benefit: str = ""


class Education(BaseModel):
    title: str = Field(min_length=1)
    link: str = ""
    description: str = ""


class Template(BaseModel):
    name: str = Field(min_length=1)
    body: str = ""


class CmsIn(BaseModel):
    tiers: list[Tier]
    education: list[Education] = []
    templates: list[Template] = []
    benefit: str = ""
    terms: str = ""
    support: str = ""
    minFirstOrder: int = 0
    minRepeatOrder: int = 0
    pricePerPack: int = 0


class SettingsIn(BaseModel):
    pic: list[str]
    channel: list[str]
    area: list[str]
    pasifDays: int = Field(default=30, ge=1)
    churnDays: int = Field(default=90, ge=1)
    followUpDays: int = Field(default=14, ge=0)
