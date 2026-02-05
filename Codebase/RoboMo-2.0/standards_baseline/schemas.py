from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class BaselineReading(BaseModel):
    timestamp: datetime
    device_id: Optional[str] = None
    pm25: Optional[float] = None
    co2: Optional[float] = None
    voc: Optional[float] = None
    pm1: Optional[float] = Field(None, alias="pm01")
    pm4: Optional[float] = None
    pm10: Optional[float] = None
    temp_c: Optional[float] = None
    rh: Optional[float] = None


class BaselineRequest(BaseModel):
    device_id: Optional[str] = None
    readings: List[BaselineReading]
    volume_m3: Optional[float] = None
    ach: Optional[float] = None
    cout_ppm: Optional[float] = None
    g_per_person_m3_s: Optional[float] = Field(None, alias="g_per_person_m3_s")


class IAQPayload(BaseModel):
    iaq_score: float
    aqi_pm25: Optional[float]
    risk_pm25: float
    risk_co2: float
    risk_tvoc: float
    risk_comfort: float
    dominant_risk: float


class SmokePayload(BaseModel):
    smoke_present: bool
    reason: str
    last_nowcast_pm25: Optional[float]


class OccupancyPayload(BaseModel):
    n_estimate: float
    ach_used: Optional[float]
    note: Optional[str]


class BaselineResponse(BaseModel):
    device_id: str
    iaq: IAQPayload
    smoke: SmokePayload
    occupancy: OccupancyPayload


class ModeRequest(BaseModel):
    mode: str = Field(pattern="^(baseline|ml)$")
