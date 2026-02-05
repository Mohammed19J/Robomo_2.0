from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from standards_baseline.config import (
    COMFORT_RH_RANGE,
    COMFORT_TEMP_RANGE,
    DEFAULT_DEVICE_ACH,
    DEFAULT_DEVICE_COUT_PPM,
    DEFAULT_G_PERSON,
    DEFAULT_VOLUME_M3,
    IAQ_WEIGHTS,
    PM25_BREAKPOINTS,
    SMOKE_CLEAR_DELTA,
    SMOKE_CONSECUTIVE,
    SMOKE_MIN_RISE,
    SMOKE_TRIGGER,
    VOC_BREAKPOINTS,
    VOC_RISK_CAP,
)
from standards_baseline.device_state import DeviceState, SmokeState

logger = logging.getLogger(__name__)


@dataclass
class BaselineOptions:
    volume_m3: float = DEFAULT_VOLUME_M3
    ach: Optional[float] = None
    cout_ppm: float = DEFAULT_DEVICE_COUT_PPM
    g_person: float = DEFAULT_G_PERSON


@dataclass
class Sample:
    timestamp: datetime
    device_id: str
    pm25: Optional[float] = None
    co2: Optional[float] = None
    voc: Optional[float] = None
    pm1: Optional[float] = None
    pm4: Optional[float] = None
    pm10: Optional[float] = None
    temp_c: Optional[float] = None
    rh: Optional[float] = None

    @classmethod
    def from_mapping(cls, data: Dict) -> "Sample":
        timestamp = _parse_timestamp(data.get("timestamp"))
        device_id = data.get("device_id") or "unknown"
        return cls(
            timestamp=timestamp,
            device_id=device_id,
            pm25=_to_float(data.get("pm25")),
            co2=_to_float(data.get("co2")),
            voc=_to_float(data.get("voc")),
            pm1=_to_float(data.get("pm1") or data.get("pm01")),
            pm4=_to_float(data.get("pm4")),
            pm10=_to_float(data.get("pm10")),
            temp_c=_to_float(data.get("temp_c")),
            rh=_to_float(data.get("rh")),
        )


def _parse_timestamp(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if value is None:
        raise ValueError("timestamp missing")
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value)
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    for fmt in (None, "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            return datetime.fromisoformat(text) if fmt is None else datetime.strptime(text, fmt)
        except ValueError:
            continue
    raise ValueError(f"invalid timestamp: {value}")


def _to_float(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(value, high))


def _moving_average(values: Sequence[float], window: int = 3) -> List[float]:
    """
    Compute a simple trailing moving average for causal smoothing.
    """
    if window <= 1:
        return list(values)
    averaged: List[float] = []
    for idx, _ in enumerate(values):
        start = max(0, idx - window + 1)
        segment = values[start : idx + 1]
        averaged.append(sum(segment) / len(segment))
    return averaged


def compute_nowcast_pm25(values: Sequence[float]) -> Optional[float]:
    tail = [v for v in values if v is not None]
    if not tail:
        return None
    if len(tail) == 1:
        return tail[0]
    tail = tail[-12:]
    c_max = max(tail)
    c_min = min(tail)
    denom = max(c_max, 1e-6)
    weight = max(0.5, 1.0 - (c_max - c_min) / denom)
    numerator = 0.0
    denom_sum = 0.0
    for i, value in enumerate(reversed(tail)):
        w = weight ** i
        numerator += w * value
        denom_sum += w
    return numerator / denom_sum if denom_sum else tail[-1]


def compute_nowcast_series(pm25_values: Sequence[Tuple[datetime, Optional[float]]]) -> List[Tuple[datetime, float]]:
    tail: List[float] = []
    history: List[Tuple[datetime, float]] = []
    for ts, value in sorted(pm25_values, key=lambda x: x[0]):
        if value is not None:
            tail.append(value)
        if len(tail) > 12:
            tail = tail[-12:]
        nowcast = compute_nowcast_pm25(tail)
        if nowcast is not None:
            history.append((ts, nowcast))
    return history


# Scientific rationale: 2023 EPA PM2.5 AQI table provides the reference risk curve.
def pm25_aqi(nowcast: Optional[float]) -> Optional[float]:
    """
    Convert a PM2.5 NowCast value (µg/m³) into an EPA-style AQI (EPA-derived).
    """
    if nowcast is None:
        return None
    c = nowcast
    for c_lo, c_hi, i_lo, i_hi in PM25_BREAKPOINTS:
        if c_lo <= c <= c_hi:
            ratio = (i_hi - i_lo) / (c_hi - c_lo)
            return ratio * (c - c_lo) + i_lo
    return PM25_BREAKPOINTS[-1][3]


# Scientific rationale: ventilation studies (Table 8) prefer smooth sigmoid CO₂ penalties.
def co2_penalty(co2_ppm: Optional[float]) -> float:
    """
    Apply a logistic penalty centered at 800 ppm to mirror ventilation health guidance.
    """
    if co2_ppm is None:
        return 0.0
    max_penalty = 100.0
    penalty = max_penalty / (1.0 + math.exp(-0.018 * (co2_ppm - 800.0)))
    return clamp(penalty, 0.0, max_penalty)


# Scientific rationale: 2023 healthy building guidance recommends non-linear TVOC ramps.
def tvoc_penalty(voc: Optional[float]) -> float:
    """
    Apply a two-stage quadratic TVOC penalty based on 2023 exposure guidelines.
    """
    if voc is None:
        return 0.0
    b1, b2, b3 = VOC_BREAKPOINTS
    cap = VOC_RISK_CAP
    if voc <= b1:
        return 0.0
    if voc <= b2:
        fraction = (voc - b1) / max(b2 - b1, 1e-6)
        return (cap * 0.5) * (fraction ** 2)
    if voc <= b3:
        fraction = (voc - b2) / max(b3 - b2, 1e-6)
        return (cap * 0.5) + (cap * 0.5) * (fraction ** 2)
    return cap


# Scientific rationale: ASHRAE 55 favors quadratic penalties outside the comfort band.
def comfort_penalty(temp_c: Optional[float], rh: Optional[float]) -> float:
    """
    Penalize thermal comfort using quadratic (temperature) and 1.5 power (humidity) ramps.
    """
    penalty = 0.0
    temp_low, temp_high = COMFORT_TEMP_RANGE
    rh_low, rh_high = COMFORT_RH_RANGE
    if temp_c is not None:
        if temp_c < temp_low:
            delta = temp_low - temp_c
            penalty += (delta ** 2) * 2.0
        elif temp_c > temp_high:
            delta = temp_c - temp_high
            penalty += (delta ** 2) * 2.0
    if rh is not None:
        if rh < rh_low:
            delta = rh_low - rh
            penalty += delta ** 1.5
        elif rh > rh_high:
            delta = rh - rh_high
            penalty += delta ** 1.5
    return clamp(penalty, 0.0, 100.0)


# Scientific rationale: Multi-pollutant IAQ aggregation per 2023 academic consensus.
def build_iaq(nowcast_pm25: Optional[float],
              co2_ppm: Optional[float],
              voc: Optional[float],
              temp_c: Optional[float],
              rh: Optional[float]) -> Dict[str, float]:
    """
    Combine pollutant and comfort penalties into a 0–100 IAQ score (custom non-linear).
    """
    weights = IAQ_WEIGHTS

    aqi_pm25 = pm25_aqi(nowcast_pm25)
    risk_pm25 = min(100.0, (aqi_pm25 or 0.0) / 5.0) if aqi_pm25 is not None else 0.0
    risk_co2 = co2_penalty(co2_ppm)
    risk_tvoc = tvoc_penalty(voc)
    risk_comfort = comfort_penalty(temp_c, rh)

    weighted_sum = (
        risk_pm25 * weights.pm25
        + risk_co2 * weights.co2
        + risk_tvoc * weights.voc
        + risk_comfort * weights.comfort
    )
    weighted_risk = clamp(weighted_sum, 0.0, 100.0)
    iaq_score = clamp(100.0 - weighted_risk, 0.0, 100.0)
    dominant_risk = max(risk_co2, risk_pm25, risk_tvoc, risk_comfort)

    return {
        "iaq_score": iaq_score,
        "aqi_pm25": aqi_pm25,
        "risk_pm25": risk_pm25,
        "risk_co2": risk_co2,
        "risk_tvoc": risk_tvoc,
        "risk_comfort": risk_comfort,
        "risk_weighted": weighted_risk,
        "dominant_risk": dominant_risk,
        "weights": {
            "co2": weights.co2,
            "pm25": weights.pm25,
            "voc": weights.voc,
            "comfort": weights.comfort,
        },
    }


# Deprecated: legacy smoke detector retained for backward compatibility.
def assess_smoke(nowcast_series: List[Tuple[datetime, float]], state: Optional[SmokeState]) -> Tuple[Dict, SmokeState]:
    """
    Deprecated heuristic smoke detector; logic retained for compatibility until replaced.
    """
    state = state or SmokeState()
    if not nowcast_series:
        info = {
            "smoke_present": False,
            "reason": "insufficient",
            "last_nowcast_pm25": None,
            "raw_probability": 0.0,
            "thresholds_used": {
                "trigger": SMOKE_TRIGGER,
                "min_rise": SMOKE_MIN_RISE,
                "clear_threshold": SMOKE_TRIGGER - SMOKE_CLEAR_DELTA,
                "hysteresis_required": SMOKE_CONSECUTIVE,
            },
        }
        return info, state

    nowcast_series = sorted(nowcast_series, key=lambda x: x[0])
    latest_ts, latest_val = nowcast_series[-1]

    ten_minutes = latest_ts - timedelta(minutes=10)
    previous = None
    for ts, val in reversed(nowcast_series):
        if ts <= ten_minutes:
            previous = val
            break
    if previous is None:
        previous = nowcast_series[0][1]

    rise = latest_val - previous
    trigger = SMOKE_TRIGGER
    clear_threshold = trigger - SMOKE_CLEAR_DELTA

    active = state.active
    consecutive_below = state.consecutive_below
    reason = state.last_reason

    trigger_met = latest_val >= trigger and rise >= SMOKE_MIN_RISE

    if trigger_met:
        active = True
        consecutive_below = 0
        reason = "rapid_rise"
    elif active:
        if latest_val <= clear_threshold:
            consecutive_below += 1
            if consecutive_below >= SMOKE_CONSECUTIVE:
                active = False
                consecutive_below = 0
                reason = "clearing"
            else:
                reason = "hysteresis_hold"
        else:
            consecutive_below = 0
            reason = "hysteresis_hold"
    else:
        consecutive_below = 0
        reason = "below_threshold"

    raw_probability = clamp((latest_val - clear_threshold) / max(trigger - clear_threshold, 1e-6), 0.0, 1.0)

    updated_state = SmokeState(active=active, consecutive_below=consecutive_below, last_reason=reason)
    info = {
        "smoke_present": active,
        "reason": reason,
        "last_nowcast_pm25": latest_val,
        "raw_probability": raw_probability,
        "thresholds_used": {
            "trigger": trigger,
            "min_rise": SMOKE_MIN_RISE,
            "clear_threshold": clear_threshold,
            "hysteresis_required": SMOKE_CONSECUTIVE,
        },
    }
    return info, updated_state


def _regression_slope(x: Sequence[float], y: Sequence[float]) -> Optional[float]:
    n = len(x)
    if n < 2:
        return None
    sum_x = sum(x)
    sum_y = sum(y)
    sum_xy = sum(a * b for a, b in zip(x, y))
    sum_x2 = sum(a * a for a in x)
    denom = n * sum_x2 - sum_x * sum_x
    if denom == 0:
        return None
    return (n * sum_xy - sum_x * sum_y) / denom


def estimate_ach(times: Sequence[datetime], co2_ppm: Sequence[float], cout_ppm: float) -> Optional[float]:
    if len(times) < 3:
        return None
    values = [(t - times[0]).total_seconds() for t in times]
    co2 = [max(v - cout_ppm, 1e-6) for v in co2_ppm]
    if any(v <= 0 for v in co2):
        return None

    logs = [math.log(v) for v in co2]
    slope = _regression_slope(values, logs)
    if slope is None or slope >= 0:
        return None
    return -slope * 3600.0


# Scientific rationale: CO₂ mass-balance with MA(3) smoothing for real-time occupancy.
def compute_occupancy(samples: List[Sample],
                      *,
                      options: BaselineOptions,
                      ach_origin: str,
                      allow_estimate: bool,
                      cached_state: Optional[DeviceState]) -> Tuple[Dict[str, float], Dict[str, Optional[float]]]:
    """
    Estimate occupant count via CO₂ mass balance with ACH context (custom real-time model).
    """
    co2_samples = [(s.timestamp, s.co2) for s in samples if s.co2 is not None]
    updates: Dict[str, Optional[float]] = {}
    if len(co2_samples) < 1:
        return {
            "n_estimate": 0.0,
            "ach_used": options.ach or DEFAULT_DEVICE_ACH,
            "ach_source": ach_origin,
            "note": "insufficient CO2 data",
        }, updates

    co2_samples.sort(key=lambda x: x[0])
    times = [ts for ts, _ in co2_samples]
    values = [val for _, val in co2_samples]
    smoothed_values = _moving_average(values, window=3)

    ach_used = options.ach if options.ach is not None else DEFAULT_DEVICE_ACH
    ach_source = ach_origin
    notes = [f"ach_source={ach_origin}", "ma3_co2_smoothing"]

    if allow_estimate:
        ach_est = estimate_ach(times, values, options.cout_ppm)
        if ach_est and ach_est > 0.1:
            ach_used = ach_est
            ach_source = "decay_estimate"
            updates["ach"] = ach_est
            updates["ach_source"] = ach_source
            notes.append("ach_estimated_from_decay")

    V = options.volume_m3
    Q = ach_used * V / 3600.0
    cout_frac = options.cout_ppm / 1e6
    g = max(options.g_person or DEFAULT_G_PERSON, 1e-9)

    estimate = 0.0
    derivative_estimate: Optional[float] = None
    if len(smoothed_values) >= 2:
        c_t = smoothed_values[-1] / 1e6
        c_prev = smoothed_values[-2] / 1e6
        dt = (times[-1] - times[-2]).total_seconds()
        if dt > 0:
            dc_dt = (c_t - c_prev) / dt
            # Mass-balance derivative term follows standard well-mixed-room modeling practices.
            derivative_estimate = (V * dc_dt + Q * (c_t - cout_frac)) / g
            if abs(dc_dt) < 1e-6:
                notes.append("steady_state")
    if derivative_estimate is not None and math.isfinite(derivative_estimate):
        estimate = derivative_estimate
    else:
        c_t = smoothed_values[-1] / 1e6
        estimate = Q * (c_t - cout_frac) / g
        notes.append("steady_state_estimate")

    return {
        "n_estimate": max(0.0, estimate),
        "ach_used": ach_used,
        "ach_source": ach_source,
        "note": "; ".join(notes),
    }, updates


def compute_baseline(device_id: str,
                     samples: Iterable[Sample],
                     options: BaselineOptions,
                     *,
                     device_state: Optional[DeviceState] = None,
                     ach_origin: str = "default",
                     allow_update: bool = True) -> Tuple[Dict, Dict]:
    samples = sorted(samples, key=lambda s: s.timestamp)
    now = samples[-1].timestamp

    pm_series = [(s.timestamp, s.pm25) for s in samples if s.pm25 is not None]
    nowcasts = compute_nowcast_series(pm_series)
    nowcast_latest = nowcasts[-1][1] if nowcasts else None

    latest = samples[-1]
    iaq = build_iaq(nowcast_latest, latest.co2, latest.voc, latest.temp_c, latest.rh)

    smoke_state = device_state.smoke if device_state else None
    smoke_info, updated_smoke_state = assess_smoke(nowcasts, smoke_state)

    occupancy_info, occ_updates = compute_occupancy(
        samples,
        options=options,
        ach_origin=ach_origin,
        allow_estimate=allow_update,
        cached_state=device_state,
    )

    result = {
        "device_id": device_id,
        "iaq": iaq,
        "smoke": smoke_info,
        "occupancy": occupancy_info,
    }

    updates = {
        "timestamp": now,
        "nowcast_pm25": nowcast_latest,
        "volume_m3": options.volume_m3,
        "cout_ppm": options.cout_ppm,
        "smoke_state": updated_smoke_state,
    }
    updates.update(occ_updates)

    logger.debug(
        "Baseline result for %s: IAQ=%s, smoke=%s, occupancy=%s",
        device_id,
        iaq,
        smoke_info,
        occupancy_info,
    )

    return result, updates
