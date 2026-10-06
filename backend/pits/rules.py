"""鞣坑状态门槛：放液看酸碱度；鞣制中改注液看当日排液渠畅通旗。"""

from django.utils import timezone

from pits.models import DitchFlag, Pit

MIN_PH = 3.5
MAX_PH = 5.0


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def active_ditch_flag(yard, on_date=None) -> DitchFlag | None:
    """某场某日唯一有效（未作废）渠旗；没有返回 None。"""
    on_date = on_date or timezone.localdate()
    return yard.ditch_flags.filter(check_date=on_date, voided_at__isnull=True).first()


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status == Pit.STATUS_FILL and pit.status == Pit.STATUS_TANNING:
        flag = active_ditch_flag(pit.yard)
        if flag is None:
            raise RuleError("今日尚无巡渠畅通旗，不能注液")
        if flag.state == DitchFlag.STATE_SILTED:
            raise RuleError("今日排液渠淤塞，不能注液")
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")
