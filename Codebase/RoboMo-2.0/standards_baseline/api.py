from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse

from .schemas import BaselineRequest, BaselineResponse, ModeRequest
from .switch import (
    compute_from_payload,
    compute_request_payload,
    get_last,
    get_mode,
    list_cached_devices,
    set_mode,
)

router = APIRouter(prefix="/baseline", tags=["baseline"])
WIDGET_PATH = Path(__file__).resolve().parent / "widget.html"


@router.post("/compute", response_model=BaselineResponse)
def compute_endpoint(request: BaselineRequest):
    if not request.readings and not request.device_id:
        raise HTTPException(status_code=400, detail="device_id required")
    result = compute_request_payload(
        request.model_dump(by_alias=True, exclude_none=True)
    )
    return result


@router.get("/last", response_model=BaselineResponse)
def get_last_result(device_id: str = Query(..., description="Device identifier")):
    result = get_last(device_id)
    if result is None:
        raise HTTPException(status_code=404, detail="No cached result for device")
    return result


@router.get("/mode")
def read_mode():
    return {"mode": get_mode()}


@router.post("/mode")
def update_mode(mode: ModeRequest):
    new_mode = set_mode(mode.mode)
    return {"mode": new_mode}


@router.get("/devices")
def list_devices():
    return {"devices": list_cached_devices()}


@router.get("/widget", response_class=HTMLResponse)
def baseline_widget():
    if not WIDGET_PATH.exists():
        raise HTTPException(status_code=404, detail="Widget not found")
    return HTMLResponse(WIDGET_PATH.read_text(encoding="utf-8"))
