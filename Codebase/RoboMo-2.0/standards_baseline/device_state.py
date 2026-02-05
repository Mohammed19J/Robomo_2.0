from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from standards_baseline.config import (
    DEFAULT_DEVICE_ACH,
    DEFAULT_DEVICE_COUT_PPM,
    DEFAULT_G_PERSON,
    DEFAULT_VOLUME_M3,
)


@dataclass
class SmokeState:
    active: bool = False
    consecutive_below: int = 0
    last_reason: str = "normal"


@dataclass
class DeviceState:
    device_id: str
    volume_m3: float = DEFAULT_VOLUME_M3
    ach: Optional[float] = None
    cout_ppm: float = DEFAULT_DEVICE_COUT_PPM
    ach_source: str = "default"
    last_nowcast_pm25: Optional[float] = None
    g_person: float = DEFAULT_G_PERSON
    last_updated: Optional[datetime] = None
    smoke: SmokeState = field(default_factory=SmokeState)

    def update_context(
        self,
        *,
        ach: Optional[float] = None,
        ach_source: Optional[str] = None,
        volume_m3: Optional[float] = None,
        cout_ppm: Optional[float] = None,
        nowcast_pm25: Optional[float] = None,
        timestamp: Optional[datetime] = None,
        g_person: Optional[float] = None,
    ) -> None:
        if volume_m3 is not None:
            self.volume_m3 = volume_m3
        if cout_ppm is not None:
            self.cout_ppm = cout_ppm
        if ach is not None:
            self.ach = ach
        if ach_source is not None:
            self.ach_source = ach_source
        if nowcast_pm25 is not None:
            self.last_nowcast_pm25 = nowcast_pm25
        if timestamp is not None:
            self.last_updated = timestamp
        if g_person is not None:
            self.g_person = g_person
