from __future__ import annotations

import logging
from collections import defaultdict, deque
from datetime import datetime
from typing import Deque, Dict, List, Optional, Tuple

from standards_baseline.config import (
    DEFAULT_DEVICE_ACH,
    DEFAULT_DEVICE_COUT_PPM,
    DEFAULT_VOLUME_M3,
)
from standards_baseline.device_state import DeviceState
from standards_baseline.engine import BaselineOptions, Sample, compute_baseline
from standards_baseline.schemas import BaselineReading, BaselineRequest

logger = logging.getLogger(__name__)

_MODE: str = "baseline"
_HISTORY: Dict[str, Deque[dict]] = defaultdict(lambda: deque(maxlen=288))
_DEVICE_STATE: Dict[str, DeviceState] = {}
_LAST_RESULTS: Dict[str, dict] = {}


def get_mode() -> str:
    return _MODE


def set_mode(mode: str) -> str:
    global _MODE
    _MODE = "baseline" if mode == "baseline" else "ml"
    logger.info("Baseline mode set to %s", _MODE)
    return _MODE


def _history_for(device_id: str) -> Deque[dict]:
    return _HISTORY[device_id]


def _state_for(device_id: str) -> DeviceState:
    state = _DEVICE_STATE.get(device_id)
    if state is None:
        state = DeviceState(device_id=device_id)
        _DEVICE_STATE[device_id] = state
    return state


def record_history(reading: BaselineReading) -> None:
    device_id = reading.device_id or "unknown"
    entry = reading.model_dump(by_alias=True, exclude_none=True)
    entry["timestamp"] = reading.timestamp.isoformat()
    _history_for(device_id).append(entry)


def build_request_from_history(device_id: str) -> Optional[BaselineRequest]:
    history = list(_history_for(device_id))
    if not history:
        return None
    readings = [BaselineReading(**entry) for entry in history]
    return BaselineRequest(device_id=device_id, readings=readings)


def _samples_from_request(request: BaselineRequest) -> List[Sample]:
    samples: List[Sample] = []
    for reading in request.readings:
        try:
            samples.append(Sample.from_mapping(reading.model_dump(by_alias=True)))
        except ValueError:
            logger.debug("Skipping invalid reading for %s", request.device_id or "unknown")
    return samples


def _resolve_options(device_id: str,
                     request: BaselineRequest,
                     *,
                     volume_m3: Optional[float] = None,
                     ach: Optional[float] = None,
                     cout_ppm: Optional[float] = None,
                     g_per_person: Optional[float] = None) -> Tuple[BaselineOptions, str]:
    state = _state_for(device_id)

    resolved_volume = volume_m3 or request.volume_m3 or state.volume_m3 or DEFAULT_VOLUME_M3
    resolved_cout = cout_ppm or request.cout_ppm or state.cout_ppm or DEFAULT_DEVICE_COUT_PPM

    if ach is not None:
        resolved_ach = ach
        ach_origin = "provided"
    elif request.ach is not None:
        resolved_ach = request.ach
        ach_origin = "provided"
    elif state.ach is not None:
        resolved_ach = state.ach
        ach_origin = state.ach_source or "cached"
    else:
        resolved_ach = DEFAULT_DEVICE_ACH
        ach_origin = "default"

    options = BaselineOptions(
        volume_m3=resolved_volume,
        ach=resolved_ach,
        cout_ppm=resolved_cout,
        g_person=g_per_person or request.g_per_person_m3_s or state.g_person,
    )
    return options, ach_origin


def _compute(request: BaselineRequest,
             *,
             volume_m3: Optional[float] = None,
             ach: Optional[float] = None,
             cout_ppm: Optional[float] = None,
             g_per_person: Optional[float] = None,
             update_state: bool) -> dict:
    device_id = request.device_id or "unknown"
    state = _state_for(device_id)

    options, ach_origin = _resolve_options(
        device_id,
        request,
        volume_m3=volume_m3,
        ach=ach,
        cout_ppm=cout_ppm,
        g_per_person=g_per_person,
    )

    samples = _samples_from_request(request)
    if not samples:
        raise ValueError("No valid readings provided")

    logger.debug(
        "Baseline compute for %s (ACH %.2f [%s], volume %.1f, cout %.1f) using %d samples",
        device_id,
        options.ach if options.ach is not None else DEFAULT_DEVICE_ACH,
        ach_origin,
        options.volume_m3,
        options.cout_ppm,
        len(samples),
    )

    result, updates = compute_baseline(
        device_id,
        samples,
        options,
        device_state=state,
        ach_origin=ach_origin,
        allow_update=update_state,
    )

    if update_state:
        state.update_context(
            ach=updates.get("ach") or state.ach,
            ach_source=updates.get("ach_source") or state.ach_source,
            volume_m3=updates.get("volume_m3") or state.volume_m3,
            cout_ppm=updates.get("cout_ppm") or state.cout_ppm,
            nowcast_pm25=updates.get("nowcast_pm25"),
            timestamp=updates.get("timestamp") or datetime.utcnow(),
            g_person=options.g_person,
        )
        smoke_state = updates.get("smoke_state")
        if smoke_state is not None:
            state.smoke = smoke_state

    _LAST_RESULTS[device_id] = result
    return result


def compute_from_payload(payload: dict,
                          volume_m3: Optional[float] = None,
                          ach: Optional[float] = None,
                          cout_ppm: Optional[float] = None,
                          g_per_person: Optional[float] = None) -> dict:
    reading = BaselineReading(**payload)
    record_history(reading)
    device_id = reading.device_id or "unknown"
    request = build_request_from_history(device_id) or BaselineRequest(device_id=device_id, readings=[reading])
    return _compute(
        request,
        volume_m3=volume_m3,
        ach=ach,
        cout_ppm=cout_ppm,
        g_per_person=g_per_person,
        update_state=False,
    )


def compute_request_payload(payload: dict) -> dict:
    request = BaselineRequest(**payload)
    result = _compute(request, update_state=True)
    record_manual_request(request, result)
    return result


def record_manual_request(request: BaselineRequest, result: dict) -> None:
    device_id = request.device_id or result.get("device_id") or "unknown"
    history = _history_for(device_id)
    history.clear()
    for reading in request.readings:
        entry = reading.model_dump(by_alias=True, exclude_none=True)
        entry["timestamp"] = reading.timestamp.isoformat()
        history.append(entry)

    _LAST_RESULTS[device_id] = result


def get_last(device_id: str) -> Optional[dict]:
    return _LAST_RESULTS.get(device_id)


def list_cached_devices() -> List[dict]:
    devices = []
    for device_id, state in _DEVICE_STATE.items():
        devices.append(
            {
                "device_id": device_id,
                "ach": state.ach,
                "ach_source": state.ach_source,
                "cout_ppm": state.cout_ppm,
                "volume_m3": state.volume_m3,
                "last_nowcast_pm25": state.last_nowcast_pm25,
                "last_updated": state.last_updated.isoformat() if state.last_updated else None,
            }
        )
    return devices
