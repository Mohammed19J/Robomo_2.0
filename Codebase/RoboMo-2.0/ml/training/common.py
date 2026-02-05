from __future__ import annotations
import pandas as pd, numpy as np

ROLL = 5  # 5-sample rolling window (adjust to your sampling cadence)

def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    ts = pd.to_datetime(df["timestamp"], errors="coerce")
    out = df.copy()
    out["hour"] = ts.dt.hour
    out["dow"]  = ts.dt.dayofweek
    return out

def add_rolls_and_deltas(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values("timestamp").copy()
    for col in ["co2", "pm25", "temp_c", "rh"]:
        if col in out.columns:
            out[f"{col}_roll{ROLL}"]   = out[col].rolling(ROLL, min_periods=1).mean()
            out[f"{col}_delta_5m"]     = out[col].diff().fillna(0)
    return out

FEATURES = [
    "co2","voc","pm1","pm25","pm4","pm10","temp_c","rh",
    "co2_delta_5m","pm25_delta_5m","temp_c_delta_5m","rh_delta_5m",
    "co2_roll5","pm25_roll5","temp_c_roll5","rh_roll5",
    "hour","dow"
]

def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df2 = add_time_features(df)
    df2 = add_rolls_and_deltas(df2)
    # ensure all cols exist (imputer will handle NaN)
    for f in FEATURES:
        if f not in df2.columns: df2[f] = np.nan
    return df2

# Heuristic health index (0..100) you can refine later
def rough_health_index(df: pd.DataFrame) -> pd.Series:
    co2 = df.get("co2")
    voc = df.get("voc")
    pm  = df.get("pm25")

    def scale(x, good, bad):
        x = pd.to_numeric(x, errors="coerce")
        return 100 * (1 - np.clip((x - good) / max(1,(bad-good)), 0, 1))

    parts = []
    parts.append(scale(co2, 600, 1500))   # great under ~600, poor near ~1500 ppm
    parts.append(scale(voc, 150, 1000))   # adjust to your sensor’s scale
    parts.append(scale(pm,   5,   75))    # PM2.5 rough band
    arr = np.vstack([np.nan_to_num(p, nan=70) for p in parts])
    return pd.Series(np.nanmin(arr, axis=0)).clip(0, 100)
