import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import matplotlib.pyplot as plt

NUM = ["co2","voc","pm1","pm25","pm4","pm10","temp_c","rh"]
TARGET = "health_index"

COLUMN_ALIASES = {
    "co2 (ppm)": "co2",
    "voc (ppb)": "voc",
    "pm1 (?g/m?)": "pm1",
    "pm1 (ug/m3)": "pm1",
    "pm25 (?g/m?)": "pm25",
    "pm25 (ug/m3)": "pm25",
    "pm4 (?g/m?)": "pm4",
    "pm4 (ug/m3)": "pm4",
    "pm10 (?g/m?)": "pm10",
    "pm10 (ug/m3)": "pm10",
    "temp_c (?c)": "temp_c",
    "temp (c)": "temp_c",
    "rh (%)": "rh",
    "relative_humidity": "rh",
}


def canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    rename_map = {}
    for col in df.columns:
        lower = col.lower()
        if col in COLUMN_ALIASES:
            rename_map[col] = COLUMN_ALIASES[col]
            continue
        if lower in COLUMN_ALIASES:
            rename_map[col] = COLUMN_ALIASES[lower]
            continue
        if "co2" in lower:
            rename_map[col] = "co2"
        elif "voc" in lower:
            rename_map[col] = "voc"
        elif "pm10" in lower:
            rename_map[col] = "pm10"
        elif "pm25" in lower:
            rename_map[col] = "pm25"
        elif "pm4" in lower:
            rename_map[col] = "pm4"
        elif "pm1" in lower:
            rename_map[col] = "pm1"
        elif "temp" in lower:
            rename_map[col] = "temp_c"
        elif lower.startswith("rh") or "humidity" in lower:
            rename_map[col] = "rh"
        elif lower.startswith("timestamp"):
            rename_map[col] = "timestamp"
        elif lower.startswith("device"):
            rename_map[col] = "device_id"
        elif lower.startswith("health_index"):
            rename_map[col] = TARGET
    return df.rename(columns=rename_map)
import argparse
from pathlib import Path
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import matplotlib.pyplot as plt

NUM = ["co2","voc","pm1","pm25","pm4","pm10","temp_c","rh"]
TARGET = "health_index"

def coerce_types(df):
    for c in NUM + [TARGET]:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df

def drop_dupes_and_sort(df):
    df = df.drop_duplicates()
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp", "device_id"]).copy()
    df = df.sort_values(["device_id", "timestamp"])
    df = df.drop_duplicates(["device_id", "timestamp"], keep="last")
    return df

def verify_and_shift_target(df, shift_minutes=15):
    if shift_minutes == 0:
        df = df.rename(columns={TARGET: "y"})
        return df
    future = df[["device_id", "timestamp", TARGET]].copy()
    future = future.rename(columns={"timestamp": "timestamp_future", TARGET: "y"})
    df = df.copy()
    df["timestamp_future"] = df["timestamp"] + pd.Timedelta(minutes=shift_minutes)
    df = df.merge(future, how="left", on=["device_id", "timestamp_future"])
    df = df.dropna(subset=["y"]).copy()
    return df

def hampel_mask(s, window=15, n_sigmas=6.0):
    if s.isna().all():
        return pd.Series(False, index=s.index)
    x = s.copy()
    med = x.rolling(window, center=True, min_periods=1).median()
    diff = (x - med).abs()
    mad = diff.rolling(window, center=True, min_periods=1).median() * 1.4826
    mad.replace(0, np.nan, inplace=True)
    z = diff / mad
    return z > n_sigmas

def remove_spikes(df, cols=NUM, window=15, n_sigmas=6.0):
    out = []
    for _, g in df.groupby("device_id", group_keys=False):
        g = g.copy()
        for c in cols:
            if c in g.columns:
                mask = hampel_mask(g[c], window=window, n_sigmas=n_sigmas)
                g.loc[mask, c] = np.nan
        out.append(g)
    return pd.concat(out, axis=0)

def remove_flatlines(df, cols=NUM, eps=1e-6, min_minutes=60, zero_min_minutes=30):
    pieces = []
    def flag_flat(g, col):
        if col not in g.columns: 
            return pd.Series(False, index=g.index)
        x = g[col]
        t = g["timestamp"]
        same = (x.diff().abs() <= eps) | x.diff().isna()
        grp = (~same).cumsum()
        first_t = t.groupby(grp).transform("first")
        last_t  = t.groupby(grp).transform("last")
        dur = (last_t - first_t).dt.total_seconds().fillna(0) / 60.0
        is_const_long = (dur >= min_minutes)
        is_zero_long  = (x.fillna(np.inf)==0) & (dur >= zero_min_minutes)
        return is_const_long | is_zero_long
    for _, g in df.groupby("device_id"):
        g = g.copy()
        flat_any = pd.Series(False, index=g.index)
        for c in cols:
            flat_any = flat_any | flag_flat(g, c)
        pieces.append(g.loc[~flat_any])
    return pd.concat(pieces, axis=0)

def estimate_interp_limit_per_device(g, max_minutes=30):
    dt = g["timestamp"].diff().dt.total_seconds().dropna() / 60.0
    if len(dt) == 0:
        return 0
    med = np.median(dt)
    if med <= 0 or np.isnan(med):
        return 0
    return int(np.floor(max_minutes / med))

def interpolate_short_gaps(df, cols=NUM, max_minutes=30):
    out = []
    for _, g in df.groupby("device_id", group_keys=False):
        g = g.sort_values("timestamp").copy()
        limit = estimate_interp_limit_per_device(g, max_minutes=max_minutes)
        if limit <= 0:
            out.append(g); continue
        for c in cols:
            if c in g.columns:
                g[c] = g[c].interpolate(limit=limit, limit_direction="both")
        out.append(g)
    return pd.concat(out, axis=0)

def build_time_features(df):
    df["hour"] = df["timestamp"].dt.hour
    df["dow"] = df["timestamp"].dt.dayofweek
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    return df

def join_lag(df, src_col, minutes):
    lag = df[["device_id","timestamp",src_col]].copy()
    lag["timestamp"] = lag["timestamp"] + pd.Timedelta(minutes=minutes) * (-1)
    lag = lag.rename(columns={src_col: f"{src_col}_lag_{minutes}m"})
    return df.merge(lag, on=["device_id","timestamp"], how="left")

def rolling_stats(df, cols=NUM, windows=("30min","60min")):
    pieces = []
    for _, g in df.groupby("device_id"):
        g = g.set_index("timestamp")
        for c in cols:
            if c in g.columns:
                for w in windows:
                    g[f"{c}_mean_{w}"] = g[c].rolling(w, min_periods=2).mean()
                    g[f"{c}_std_{w}"]  = g[c].rolling(w, min_periods=2).std()
        pieces.append(g.reset_index())
    return pd.concat(pieces, axis=0)

def ratio_features(df):
    if "voc" in df.columns and "pm25" in df.columns:
        df["voc_pm25_ratio"] = df["voc"] / (df["pm25"].abs() + 1e-3)
    if "pm10" in df.columns and "pm25" in df.columns:
        df["pm10_pm25_ratio"] = df["pm10"] / (df["pm25"].abs() + 1e-3)
    return df

def per_device_time_split(df, val_frac=0.2):
    df = df.sort_values(["device_id","timestamp"]).copy()
    df["split"] = "train"
    for _, g in df.groupby("device_id"):
        n = len(g); k = int(np.ceil(n * (1 - val_frac)))
        df.loc[g.index[k:], "split"] = "val"
    return df

def metrics(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = mean_squared_error(y_true, y_pred) ** 0.5
    r2 = r2_score(y_true, y_pred)
    return dict(mae=float(mae), rmse=float(rmse), r2=float(r2))

def plot_residuals(y_true, y_pred, outpath):
    resid = y_true - y_pred
    plt.figure()
    plt.scatter(y_pred, resid, s=8, alpha=0.5)
    plt.axhline(0, linestyle="--")
    plt.xlabel("Predicted")
    plt.ylabel("Residual")
    plt.title("Residuals vs Predicted")
    plt.tight_layout()
    plt.savefig(outpath)
    plt.close()

def run_pipeline(csv, outdir, shift_minutes=15, val_frac=0.2,
                 flatline_minutes=60, zero_flatline_minutes=30,
                 hampel_window=15, hampel_sigmas=6.0, max_interp_minutes=30,
                 learning_rate=0.05, n_estimators=500, num_leaves=64,
                 min_data_in_leaf=50, feature_fraction=0.8):
    outdir = Path(outdir)
    (outdir / "reports").mkdir(parents=True, exist_ok=True)

    df = canonicalize_columns(pd.read_csv(csv))
    df = drop_dupes_and_sort(df)
    df = coerce_types(df)
    df = verify_and_shift_target(df, shift_minutes=shift_minutes)
    df = remove_spikes(df, cols=NUM, window=hampel_window, n_sigmas=hampel_sigmas)
    df = remove_flatlines(df, cols=NUM, min_minutes=flatline_minutes, zero_min_minutes=zero_flatline_minutes)
    df = interpolate_short_gaps(df, cols=NUM, max_minutes=max_interp_minutes)

    df = build_time_features(df)
    df = ratio_features(df)
    df = rolling_stats(df, cols=NUM, windows=("30min","60min"))
    df = join_lag(df, TARGET, 5)
    df = join_lag(df, TARGET, 10)

    feat_cols = [c for c in df.columns if c not in ["timestamp","timestamp_future","device_id","y"]]
    feat_cols = [c for c in feat_cols if df[c].dtype.kind in "fci"]
    df = df.dropna(subset=["y"]).copy()
    df["nan_frac"] = df[feat_cols].isna().mean(axis=1)
    df = df[df["nan_frac"] <= 0.3].copy().drop(columns=["nan_frac"])

    for _, g in df.groupby("device_id"):
        med = g[feat_cols].median(numeric_only=True)
        idx = g.index
        df.loc[idx, feat_cols] = g[feat_cols].fillna(med)

    df = per_device_time_split(df, val_frac=val_frac)
    X_train = df.loc[df["split"]=="train", feat_cols]
    y_train = df.loc[df["split"]=="train", "y"]
    X_val   = df.loc[df["split"]=="val", feat_cols]
    y_val   = df.loc[df["split"]=="val", "y"]

    model = lgb.LGBMRegressor(
        objective="rmse",
        learning_rate=learning_rate,
        n_estimators=n_estimators,
        num_leaves=num_leaves,
        min_data_in_leaf=min_data_in_leaf,
        feature_fraction=feature_fraction,
        random_state=42,
        n_jobs=-1
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        eval_metric="rmse",
        callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False)]
    )

    pred_val = model.predict(X_val, num_iteration=model.best_iteration_)
    global_metrics = metrics(y_val, pred_val)

    per_dev = []
    for dev, g in df[df["split"]=="val"].groupby("device_id"):
        if len(g)==0: 
            continue
        yp = model.predict(g[feat_cols], num_iteration=model.best_iteration_)
        m = metrics(g["y"], yp); m["device_id"] = dev
        per_dev.append(m)
        plot_residuals(g["y"].values, yp, outdir / "reports" / f"residuals_{dev}.png")
    per_dev_df = pd.DataFrame(per_dev).sort_values("mae")
    per_dev_df.to_csv(outdir / "reports" / "per_device_metrics.csv", index=False)

    try:
        importances = pd.Series(model.feature_importances_, index=feat_cols).sort_values(ascending=False)
        (outdir / "reports" / "feature_importance.csv").write_text(importances.to_csv(header=["importance"]))
    except Exception:
        pass

    import joblib
    joblib.dump({"model": model, "features": feat_cols}, outdir / "health_lgbm.joblib")
    (outdir / "reports" / "global_metrics.json").write_text(pd.Series(global_metrics).to_json(indent=2))

    print("GLOBAL:", global_metrics)
    print(f"Per-device metrics written to {outdir/'reports'/'per_device_metrics.csv'}")
    print(f"Model saved to {outdir/'health_lgbm.joblib'}")
    return global_metrics

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--outdir", default="ml/artifacts_health")
    ap.add_argument("--shift_minutes", type=int, default=15)
    ap.add_argument("--val_frac", type=float, default=0.2)
    ap.add_argument("--flatline_minutes", type=int, default=60)
    ap.add_argument("--zero_flatline_minutes", type=int, default=30)
    ap.add_argument("--hampel_window", type=int, default=15)
    ap.add_argument("--hampel_sigmas", type=float, default=6.0)
    ap.add_argument("--max_interp_minutes", type=int, default=30)
    ap.add_argument("--learning_rate", type=float, default=0.05)
    ap.add_argument("--n_estimators", type=int, default=500)
    ap.add_argument("--num_leaves", type=int, default=64)
    ap.add_argument("--min_data_in_leaf", type=int, default=50)
    ap.add_argument("--feature_fraction", type=float, default=0.8)
    args = ap.parse_args()
    run_pipeline(
        csv=args.csv,
        outdir=args.outdir,
        shift_minutes=args.shift_minutes,
        val_frac=args.val_frac,
        flatline_minutes=args.flatline_minutes,
        zero_flatline_minutes=args.zero_flatline_minutes,
        hampel_window=args.hampel_window,
        hampel_sigmas=args.hampel_sigmas,
        max_interp_minutes=args.max_interp_minutes,
        learning_rate=args.learning_rate,
        n_estimators=args.n_estimators,
        num_leaves=args.num_leaves,
        min_data_in_leaf=args.min_data_in_leaf,
        feature_fraction=args.feature_fraction,
    )
