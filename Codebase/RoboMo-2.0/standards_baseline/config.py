"""
Configuration helpers for the standards baseline engine.

Values can be overridden via environment variables so operators can tune the
formulas without changing code.  All numeric overrides are parsed as floats.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Tuple

DEFAULT_CO2_WEIGHT = 0.2
DEFAULT_PM25_WEIGHT = 0.4
DEFAULT_VOC_WEIGHT = 0.2
DEFAULT_COMFORT_WEIGHT = 0.2

# 2023 health guidance (EPA + WHO) for TVOC inflection points, expressed in ppb.
DEFAULT_VOC_BREAKPOINTS = (220.0, 660.0, 2200.0)
DEFAULT_VOC_RISK_CAP = 65.0

# 2023 US EPA PM2.5 AQI breakpoints (µg/m³ -> AQI). Each tuple is (c_lo, c_hi, i_lo, i_hi).
#   0.0–12.0   µg/m³ ->   0–50 AQI   (Good)
#  12.1–35.4   µg/m³ ->  51–100 AQI  (Moderate)
#  35.5–55.4   µg/m³ -> 101–150 AQI  (Unhealthy for SG)
#  55.5–150.4  µg/m³ -> 151–200 AQI  (Unhealthy)
# 150.5–250.4  µg/m³ -> 201–300 AQI  (Very Unhealthy)
# 250.5–500.4  µg/m³ -> 301–500 AQI  (Hazardous)
DEFAULT_PM25_BREAKPOINTS = (
    (0.0, 12.0, 0.0, 50.0),
    (12.1, 35.4, 51.0, 100.0),
    (35.5, 55.4, 101.0, 150.0),
    (55.5, 150.4, 151.0, 200.0),
    (150.5, 250.4, 201.0, 300.0),
    (250.5, 500.4, 301.0, 500.0),
)

# ASHRAE 55 comfort band expressed as (min, max).
DEFAULT_COMFORT_TEMP_RANGE = (20.0, 25.0)
DEFAULT_COMFORT_RH_RANGE = (30.0, 60.0)

DEFAULT_SMOKE_TRIGGER = 35.0  # µg/m³
DEFAULT_SMOKE_MIN_RISE = 10.0  # µg/m³ over the lookback window
DEFAULT_SMOKE_CLEAR_DELTA = 5.0  # hysteresis margin below trigger
DEFAULT_SMOKE_CONSECUTIVE = 2  # samples required below clear threshold

DEFAULT_COUT_PPM = 420.0
DEFAULT_ACH = 1.0
DEFAULT_VOLUME_M3 = 250.0
DEFAULT_G_PERSON = 4.0e-6


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _env_tuple(name: str, default: Tuple[float, ...]) -> Tuple[float, ...]:
    raw = os.getenv(name)
    if not raw:
        return default
    parts = []
    for token in raw.replace(";", ",").split(","):
        token = token.strip()
        if not token:
            continue
        try:
            parts.append(float(token))
        except ValueError:
            continue
    return tuple(parts) if parts else default


def _env_breakpoint_table(name: str, default: Tuple[Tuple[float, ...], ...]) -> Tuple[Tuple[float, ...], ...]:
    """
    Parse semicolon-separated breakpoint rows such as "0,12,0,50;12.1,35.4,51,100".
    """
    raw = os.getenv(name)
    if not raw:
        return default
    rows = []
    for chunk in raw.replace("|", ";").split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        parts = [token.strip() for token in chunk.split(",")]
        if len(parts) != 4:
            continue
        try:
            rows.append(tuple(float(value) for value in parts))
        except ValueError:
            continue
    return tuple(rows) if rows else default


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class IAQWeights:
    co2: float = _env_float("BASELINE_IAQ_WEIGHT_CO2", DEFAULT_CO2_WEIGHT)
    pm25: float = _env_float("BASELINE_IAQ_WEIGHT_PM25", DEFAULT_PM25_WEIGHT)
    voc: float = _env_float("BASELINE_IAQ_WEIGHT_VOC", DEFAULT_VOC_WEIGHT)
    comfort: float = _env_float("BASELINE_IAQ_WEIGHT_COMFORT", DEFAULT_COMFORT_WEIGHT)

    @property
    def total(self) -> float:
        return self.co2 + self.pm25 + self.voc + self.comfort


IAQ_WEIGHTS = IAQWeights()

VOC_BREAKPOINTS = _env_tuple(
    "BASELINE_VOC_BREAKPOINTS", DEFAULT_VOC_BREAKPOINTS
)  # (good, mid, high)
VOC_RISK_CAP = _env_float("BASELINE_VOC_RISK_CAP", DEFAULT_VOC_RISK_CAP)

PM25_BREAKPOINTS = _env_breakpoint_table(
    "BASELINE_PM25_BREAKPOINTS", DEFAULT_PM25_BREAKPOINTS
)
# Comfort ranges remain configurable to align with adaptive thermal comfort studies.
COMFORT_TEMP_RANGE = _env_tuple(
    "BASELINE_COMFORT_TEMP_RANGE", DEFAULT_COMFORT_TEMP_RANGE
)
COMFORT_RH_RANGE = _env_tuple(
    "BASELINE_COMFORT_RH_RANGE", DEFAULT_COMFORT_RH_RANGE
)

SMOKE_TRIGGER = _env_float("BASELINE_SMOKE_TRIGGER", DEFAULT_SMOKE_TRIGGER)
SMOKE_MIN_RISE = _env_float("BASELINE_SMOKE_MIN_RISE", DEFAULT_SMOKE_MIN_RISE)
SMOKE_CLEAR_DELTA = _env_float(
    "BASELINE_SMOKE_CLEAR_DELTA", DEFAULT_SMOKE_CLEAR_DELTA
)
SMOKE_CONSECUTIVE = _env_int(
    "BASELINE_SMOKE_CLEAR_CONSECUTIVE", DEFAULT_SMOKE_CONSECUTIVE
)

DEFAULT_DEVICE_COUT_PPM = _env_float("BASELINE_DEFAULT_COUT_PPM", DEFAULT_COUT_PPM)
DEFAULT_DEVICE_ACH = _env_float("BASELINE_DEFAULT_ACH", DEFAULT_ACH)
DEFAULT_VOLUME_M3 = _env_float("BASELINE_DEFAULT_VOLUME_M3", DEFAULT_VOLUME_M3)
DEFAULT_G_PERSON = _env_float("BASELINE_DEFAULT_G_PERSON", DEFAULT_G_PERSON)
