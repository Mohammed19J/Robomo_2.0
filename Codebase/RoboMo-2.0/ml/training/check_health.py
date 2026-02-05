"""
Utility script to inspect the 15-minute health forecast.

It loads the saved metrics and hold-out predictions, prints a summary,
computes per-device scores, and exports diagnostic plots.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def verdict(mae: float, rmse: float, r2: float) -> str:
    if mae <= 5 and rmse <= 8 and r2 >= 0.6:
        return "Good"
    if 5 < mae <= 8 and 8 < rmse <= 12 and 0.3 <= r2 < 0.6:
        return "OK"
    if r2 <= 0.1 or mae >= 8:
        return "Poor"
    return "Mixed"


def main() -> None:
    ml_dir = Path(__file__).resolve().parents[1]
    artifacts_dir = ml_dir / "artifacts"

    metrics_path = artifacts_dir / "health_model.metrics.json"
    holdout_path = artifacts_dir / "health_holdout_pred_vs_actual.csv"
    per_device_path = artifacts_dir / "health_per_device_metrics.csv"

    metrics = json.loads(metrics_path.read_text())
    holdout_metrics = metrics["holdout"]
    baseline_metrics = metrics["baseline"]

    # Load predictions
    df = pd.read_csv(holdout_path, parse_dates=["timestamp"])
    y_true = df["health_index_15min"].to_numpy()
    y_pred = df["predicted_health_index_15min"].to_numpy()
    residuals = y_pred - y_true

    mae = mean_absolute_error(y_true, y_pred)
    rmse = mean_squared_error(y_true, y_pred) ** 0.5
    r2 = r2_score(y_true, y_pred)

    assert np.isclose(mae, holdout_metrics["mae"])
    assert np.isclose(rmse, holdout_metrics["rmse"])
    assert np.isclose(r2, holdout_metrics["r2"])

    mae_improvement = (baseline_metrics["mae"] - mae) / baseline_metrics["mae"] * 100
    rmse_improvement = (baseline_metrics["rmse"] - rmse) / baseline_metrics["rmse"] * 100

    print("=== Health Forecast (15 min ahead) ===")
    print(
        f"Hold-out  MAE: {mae:.3f}   RMSE: {rmse:.3f}   R²: {r2:.3f} "
        "(health points on 0–100 scale)"
    )
    print(
        f"Baseline  MAE: {baseline_metrics['mae']:.3f}   "
        f"RMSE: {baseline_metrics['rmse']:.3f}   R²: {baseline_metrics['r2']:.3f}"
    )
    print(
        f"Improvement vs baseline — MAE: {mae_improvement:.1f}%   "
        f"RMSE: {rmse_improvement:.1f}%"
    )
    print(f"Verdict: {verdict(mae, rmse, r2)}")
    print(
        f"Residual mean: {residuals.mean():.3f}, std: {residuals.std(ddof=1):.3f}"
    )

    # Per-device metrics
    rows = []
    for device_id, group in df.groupby("device_id"):
        gt = group["health_index_15min"].to_numpy()
        pred = group["predicted_health_index_15min"].to_numpy()
        rows.append(
            {
                "device_id": device_id,
                "mae": mean_absolute_error(gt, pred),
                "rmse": mean_squared_error(gt, pred) ** 0.5,
                "r2": r2_score(gt, pred),
            }
        )

    per_device = pd.DataFrame(rows).sort_values("mae").reset_index(drop=True)
    per_device.to_csv(per_device_path, index=False)
    print("\nPer-device metrics:")
    print(per_device.to_string(index=False, float_format=lambda x: f"{x:.3f}"))

    flagged = per_device[(per_device["mae"] > 5) | (per_device["r2"] < 0.3)]
    if not flagged.empty:
        print("\nDevices needing attention (MAE > 5 or R² < 0.3):")
        print(flagged.to_string(index=False, float_format=lambda x: f"{x:.3f}"))

    # Plots
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    plt.figure(figsize=(6, 6))
    plt.scatter(y_true, y_pred, alpha=0.6, edgecolor="none")
    lims = [
        min(y_true.min(), y_pred.min()),
        max(y_true.max(), y_pred.max()),
    ]
    plt.plot(lims, lims, "k--", linewidth=1)
    plt.xlabel("Actual health index (future)")
    plt.ylabel("Predicted health index")
    plt.title("Health forecast: true vs predicted")
    plt.tight_layout()
    plt.savefig(artifacts_dir / "health_scatter_true_vs_pred.png", dpi=150)
    plt.close()

    plt.figure(figsize=(6, 4))
    plt.hist(residuals, bins=30, color="#1f77b4", alpha=0.8)
    plt.axvline(0, color="k", linestyle="--")
    plt.xlabel("Residual (prediction − actual)")
    plt.ylabel("Count")
    plt.title("Health forecast residuals")
    plt.tight_layout()
    plt.savefig(artifacts_dir / "health_residual_hist.png", dpi=150)
    plt.close()

    plt.figure(figsize=(6, 4))
    plt.bar(per_device["device_id"], per_device["mae"], color="#ff7f0e")
    plt.ylabel("MAE (health points)")
    plt.title("MAE by device (15 min forecast)")
    plt.xticks(rotation=45, ha="right")
    plt.tight_layout()
    plt.savefig(artifacts_dir / "health_mae_by_device.png", dpi=150)
    plt.close()


if __name__ == "__main__":
    main()
