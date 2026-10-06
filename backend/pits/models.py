from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone


class User(models.Model):
    username = models.CharField(max_length=64, unique=True)
    password_hash = models.CharField(max_length=256)
    role = models.CharField(max_length=20, default="worker")

    def set_password(self, raw: str) -> None:
        self.password_hash = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password_hash)


class Yard(models.Model):
    name = models.CharField(max_length=120)
    village = models.CharField(max_length=120, blank=True)


class Pit(models.Model):
    STATUS_FILL = "fill"
    STATUS_TANNING = "tanning"
    STATUS_DRAINED = "drained"

    yard = models.ForeignKey(Yard, on_delete=models.CASCADE, related_name="pits")
    code = models.CharField(max_length=40)
    status = models.CharField(max_length=20, default=STATUS_FILL)
    row = models.IntegerField(default=0)
    col = models.IntegerField(default=0)

    class Meta:
        unique_together = ("yard", "code")


class LiquorSample(models.Model):
    pit = models.ForeignKey(Pit, on_delete=models.CASCADE, related_name="samples")
    taken_at = models.DateTimeField(auto_now_add=True)
    ph = models.FloatField()
    operator = models.CharField(max_length=64, blank=True)


def _today():
    return timezone.localdate()


class DrainFlag(models.Model):
    """排液渠巡渠旗：同一场地同一日只许有一面未作废旗。"""

    STATE_CLEAR = "clear"      # 畅通
    STATE_BLOCKED = "blocked"  # 淤塞

    yard = models.ForeignKey(Yard, on_delete=models.CASCADE, related_name="drain_flags")
    date = models.DateField(default=_today)
    state = models.CharField(max_length=20)
    inspector = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.CharField(max_length=64, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["yard", "date"],
                condition=models.Q(voided_at__isnull=True),
                name="uniq_active_flag_per_yard_day",
            ),
        ]

    @property
    def is_active(self) -> bool:
        return self.voided_at is None
