from django.utils import timezone

from pits.models import DrainFlag, LiquorSample, Pit, User, Yard


def seed_demo() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()
    if Yard.objects.exists():
        return
    yard = Yard.objects.create(name="南冈鞣场", village="青皮村")
    layout = [
        ("东-1", Pit.STATUS_TANNING, 0, 0, 4.2),
        ("东-2", Pit.STATUS_FILL, 0, 1, None),
        ("中-1", Pit.STATUS_DRAINED, 1, 0, 4.6),
        ("中-2", Pit.STATUS_TANNING, 1, 1, 6.1),
        ("西-1", Pit.STATUS_FILL, 2, 0, None),
        ("西-2", Pit.STATUS_DRAINED, 2, 1, 3.8),
    ]
    for code, status, row, col, ph in layout:
        pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
        if ph is not None:
            LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
    # 当日一面淤塞旗：鞣制中的坑想拨回注液会被挡住。
    DrainFlag.objects.create(
        yard=yard,
        date=timezone.localdate(),
        state=DrainFlag.STATE_BLOCKED,
        inspector="admin",
    )
