"""鞣坑作业门槛。

- 放液：最近一次浸液酸碱度须在 3.5～5.0。
- 改回注液：仅「鞣制中 → 注液」要读当日排液渠旗，须有一面当日有效畅通旗；
  无旗或淤塞旗一律挡住。已放液改回注液不读渠旗，登记酸碱度、放液也不读。
"""

from django.utils import timezone

from pits.models import DrainFlag, Pit

MIN_PH = 3.5
MAX_PH = 5.0


class RuleError(ValueError):
    pass


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def active_flag(yard, date=None):
    """某场某日的有效（未作废）渠旗，无则 None。"""
    if date is None:
        date = timezone.localdate()
    return (
        DrainFlag.objects.filter(yard=yard, date=date, voided_at__isnull=True)
        .order_by("-id")
        .first()
    )


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")

    if new_status == Pit.STATUS_DRAINED:
        ph = latest_ph(pit)
        if ph is None:
            raise RuleError("该坑尚无浸液酸碱记录，不能放液")
        if ph < MIN_PH or ph > MAX_PH:
            raise RuleError(f"最近酸碱度 {ph} 不在 {MIN_PH}～{MAX_PH}，不能放液")
        return

    # 只有鞣制中拨回注液才查当日渠旗。
    if pit.status == Pit.STATUS_TANNING and new_status == Pit.STATUS_FILL:
        flag = active_flag(pit.yard)
        if flag is None:
            raise RuleError("今日排液渠尚无巡渠旗，不能改回注液")
        if flag.state != DrainFlag.STATE_CLEAR:
            raise RuleError("今日排液渠旗为淤塞，不能改回注液")
