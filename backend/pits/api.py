from datetime import date

from django.db import IntegrityError
from django.utils import timezone
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import DitchFlag, Pit, User, Yard
from pits.rules import RuleError, active_ditch_flag, assert_can_set_status, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class DitchFlagIn(Schema):
    state: str
    check_date: date | None = None


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


def flag_json(flag: DitchFlag) -> dict:
    return {
        "id": flag.id,
        "yardId": flag.yard_id,
        "yard": flag.yard.name,
        "checkDate": flag.check_date.isoformat(),
        "state": flag.state,
        "inspector": flag.inspector,
        "voidedAt": flag.voided_at.isoformat() if flag.voided_at else None,
        "voidedBy": flag.voided_by or None,
    }


def require_admin(user: User) -> None:
    if user.role != "admin":
        raise HttpError(403, "仅管理员可巡渠与作废")


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
    flag = active_ditch_flag(yard)
    return {
        "yard": yard.name,
        "village": yard.village,
        "today": timezone.localdate().isoformat(),
        "ditch": None if flag is None else flag_json(flag),
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


@api.get("/ditch-flags", auth=auth)
def list_ditch_flags(request, day: date | None = None, state: str | None = None, valid: bool | None = None):
    flags = DitchFlag.objects.select_related("yard").order_by("-check_date", "-id")
    if day is not None:
        flags = flags.filter(check_date=day)
    if state is not None:
        flags = flags.filter(state=state)
    if valid is True:
        flags = flags.filter(voided_at__isnull=True)
    elif valid is False:
        flags = flags.filter(voided_at__isnull=False)
    return {"flags": [flag_json(f) for f in flags[:200]]}


@api.post("/ditch-flags", auth=auth)
def create_ditch_flag(request, payload: DitchFlagIn):
    require_admin(request.auth)
    if payload.state not in (DitchFlag.STATE_CLEAR, DitchFlag.STATE_SILTED):
        raise HttpError(400, "渠况只能是畅通或淤塞")
    yard = Yard.objects.first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    try:
        flag = DitchFlag.objects.create(
            yard=yard,
            check_date=payload.check_date or timezone.localdate(),
            state=payload.state,
            inspector=request.auth.username,
        )
    except IntegrityError:
        raise HttpError(409, "该场当日已有一面有效渠旗，须先作废再新建")
    return flag_json(flag)


@api.post("/ditch-flags/{flag_id}/void", auth=auth)
def void_ditch_flag(request, flag_id: int):
    require_admin(request.auth)
    flag = DitchFlag.objects.filter(id=flag_id).first()
    if flag is None:
        raise HttpError(404, "渠旗不存在")
    if flag.voided_at is None:
        flag.voided_at = timezone.now()
        flag.voided_by = request.auth.username
        flag.save(update_fields=["voided_at", "voided_by"])
    return flag_json(flag)
