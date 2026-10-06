from datetime import date as date_type

from django.db import IntegrityError, transaction
from django.utils import timezone
from ninja import NinjaAPI, Query, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import DrainFlag, Pit, User, Yard
from pits.rules import RuleError, active_flag, assert_can_set_status, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class DrainFlagIn(Schema):
    state: str
    date: date_type | None = None


class DrainFlagFilter(Schema):
    date: date_type | None = None
    state: str | None = None
    include_voided: bool = False


def require_admin(user) -> None:
    if user.role != "admin":
        raise HttpError(403, "仅管理员可巡渠与作废渠旗")


def first_yard() -> Yard:
    yard = Yard.objects.first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    return yard


def pit_json(pit: Pit) -> dict:
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
    }


def flag_json(flag: DrainFlag) -> dict:
    return {
        "id": flag.id,
        "date": flag.date.isoformat(),
        "state": flag.state,
        "inspector": flag.inspector,
        "createdAt": flag.created_at.isoformat(),
        "active": flag.is_active,
        "voidedAt": flag.voided_at.isoformat() if flag.voided_at else None,
        "voidedBy": flag.voided_by or None,
    }


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    today = active_flag(yard)
    return {
        "yard": yard.name,
        "village": yard.village,
        "today": timezone.localdate().isoformat(),
        "drainFlag": flag_json(today) if today else None,
        "pits": [pit_json(p) for p in pits],
    }


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        assert_can_set_status(pit, payload.status)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)


@api.get("/drain-flags", auth=auth)
def list_drain_flags(request, filters: DrainFlagFilter = Query(...)):
    yard = first_yard()
    qs = yard.drain_flags.all()
    if not filters.include_voided:
        qs = qs.filter(voided_at__isnull=True)
    if filters.date is not None:
        qs = qs.filter(date=filters.date)
    if filters.state is not None:
        if filters.state not in (DrainFlag.STATE_CLEAR, DrainFlag.STATE_BLOCKED):
            raise HttpError(400, "渠旗状态须为 clear 或 blocked")
        qs = qs.filter(state=filters.state)
    flags = qs.order_by("-date", "-id")
    return {
        "yard": yard.name,
        "today": timezone.localdate().isoformat(),
        "flags": [flag_json(f) for f in flags],
    }


@api.post("/drain-flags", auth=auth)
def create_drain_flag(request, payload: DrainFlagIn):
    require_admin(request.auth)
    yard = first_yard()
    if payload.state not in (DrainFlag.STATE_CLEAR, DrainFlag.STATE_BLOCKED):
        raise HttpError(400, "渠旗状态须为 clear（畅通）或 blocked（淤塞）")
    flag_day = payload.date or timezone.localdate()
    try:
        with transaction.atomic():
            flag = DrainFlag.objects.create(
                yard=yard,
                date=flag_day,
                state=payload.state,
                inspector=request.auth.username,
            )
    except IntegrityError:
        raise HttpError(409, "该场当日已有一面未作废渠旗，请先作废旧旗")
    return flag_json(flag)


@api.post("/drain-flags/{flag_id}/void", auth=auth)
def void_drain_flag(request, flag_id: int):
    require_admin(request.auth)
    flag = DrainFlag.objects.filter(id=flag_id).first()
    if flag is None:
        raise HttpError(404, "渠旗不存在")
    if flag.voided_at is not None:
        raise HttpError(400, "该渠旗已作废")
    flag.voided_at = timezone.now()
    flag.voided_by = request.auth.username
    flag.save(update_fields=["voided_at", "voided_by"])
    return flag_json(flag)
