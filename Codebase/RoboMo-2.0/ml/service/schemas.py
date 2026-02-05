from pydantic import BaseModel, Field
from typing import Optional

class SensorPayload(BaseModel):
    model_config = dict(populate_by_name=True)

    timestamp: str
    device_id: Optional[str] = None
    co2: Optional[float] = None
    voc: Optional[float] = None
    pm1: Optional[float] = Field(None, alias="pm01")
    pm25: Optional[float] = None
    pm4: Optional[float] = None
    pm10: Optional[float] = None
    temp_c: Optional[float] = None
    rh: Optional[float] = None
