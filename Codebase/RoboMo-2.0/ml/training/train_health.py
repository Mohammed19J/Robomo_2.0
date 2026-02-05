"""
Train the health-index forecaster to predict 15 minutes ahead.

This script aligns the target per device, uses the shared feature builder,
evaluates via a chronological hold-out and time-series CV, and exports both
artifacts and diagnostic files.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
)
from sklearn.model_selection import TimeSeriesSplit, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from common import FEATURES, build_features

TARGET = "health_index_15min"
FORECAST_HORIZON = pd.Timedelta(minutes=15)

COLUMN_MAP = {
    "co2 (ppm)": "co2",
    "voc (ppb)": "voc",
    "pm1 (�g/m3)": "pm1",
    "pm25 (�g/m3)": "pm25",
    "pm4 (�g/m3)": "pm4",
    "pm10 (�g/m3)": "pm10",
    "temp_c (�C)": "temp_c",
    "rh (%)": "rh",
}


def main() -> None:
    ml_dir = Path(__file__).resolve().parents[1]
    data_path = ml_dir / "data" / "health_train.csv"
    artifacts_dir = ml_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(data_path, parse_dates=["timestamp"])

    def _canonical(col: str) -> str:
        lower = col.lower()
        if "co2" in lower:
            return "co2"
        if "voc" in lower:
            return "voc"
        if "pm10" in lower:
            return "pm10"
        if "pm25" in lower:
            return "pm25"
        if "pm4" in lower:
            return "pm4"
        if "pm1" in lower:
            return "pm1"
        if "temp" in lower:
            return "temp_c"
        if "rh" in lower:
            return "rh"
        return col

    df = df.rename(columns={col: _canonical(col) for col in df.columns})
    numeric_cols = [
        "co2",
        "voc",
        "pm1",
        "pm25",
        "pm4",
        "pm10",
        "temp_c",
        "rh",
        "health_index",
    ]
    df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric, errors="coerce")

    df = df.sort_values(["device_id", "timestamp"]).reset_index(drop=True)

    future = df[["device_id", "timestamp", "health_index"]].copy()
    future["timestamp"] = future["timestamp"] - FORECAST_HORIZON
    future = future.rename(columns={"health_index": TARGET})
    df = df.merge(future, on=["device_id", "timestamp"], how="left")
    df = df.dropna(subset=[TARGET]).reset_index(drop=True)

    feature_df = build_features(df)
    X, y = feature_df[FEATURES], df[TARGET]

    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
            (
                "model",
                RandomForestRegressor(
                    n_estimators=300,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )

    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    pipeline.fit(X_train, y_train)

    holdout_pred = pipeline.predict(X_test)
    baseline_pred = np.full_like(y_test, np.median(y_train), dtype=float)

    holdout_mae = float(mean_absolute_error(y_test, holdout_pred))
    holdout_rmse = float(np.sqrt(mean_squared_error(y_test, holdout_pred)))
    holdout_r2 = float(r2_score(y_test, holdout_pred))

    baseline_mae = float(mean_absolute_error(y_test, baseline_pred))
    baseline_rmse = float(np.sqrt(mean_squared_error(y_test, baseline_pred)))
    baseline_r2 = float(r2_score(y_test, baseline_pred))

    metrics: dict[str, dict[str, float]] = {
        "holdout": {"mae": holdout_mae, "rmse": holdout_rmse, "r2": holdout_r2},
        "baseline": {"mae": baseline_mae, "rmse": baseline_rmse, "r2": baseline_r2},
    }

    holdout_df = df.iloc[split_idx:].copy()
    holdout_df = holdout_df.assign(
        predicted_health_index_15min=holdout_pred,
        actual_health_index_15min=y_test.to_numpy(),
    )
    holdout_df[
        ["timestamp", "device_id", TARGET, "predicted_health_index_15min"]
    ].to_csv(artifacts_dir / "health_holdout_pred_vs_actual.csv", index=False)

    tscv = TimeSeriesSplit(n_splits=5)
    cv = cross_validate(
        pipeline,
        X,
        y,
        cv=tscv,
        scoring=(
            "neg_mean_absolute_error",
            "neg_root_mean_squared_error",
            "r2",
        ),
        n_jobs=-1,
        return_train_score=False,
    )
    metrics["cv"] = {
        "mae_mean": float(np.mean([-v for v in cv["test_neg_mean_absolute_error"]])),
        "mae_std": float(np.std([-v for v in cv["test_neg_mean_absolute_error"]])),
        "rmse_mean": float(np.mean([-v for v in cv["test_neg_root_mean_squared_error"]])),
        "rmse_std": float(np.std([-v for v in cv["test_neg_root_mean_squared_error"]])),
        "r2_mean": float(np.mean(cv["test_r2"])),
        "r2_std": float(np.std(cv["test_r2"])),
    }

    joblib.dump(pipeline, artifacts_dir / "health_model.joblib")
    (artifacts_dir / "health_model.metrics.json").write_text(
        json.dumps(metrics, indent=2)
    )

    print(
        f"== Holdout == MAE {holdout_mae:.2f} | RMSE {holdout_rmse:.2f} | R² {holdout_r2:.3f}"
    )
    print(
        f"== Baseline == MAE {baseline_mae:.2f} | RMSE {baseline_rmse:.2f} | R² {baseline_r2:.3f}"
    )
    print("Artifacts saved to:", artifacts_dir)


if __name__ == "__main__":
    main()
