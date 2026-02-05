"""
Train the occupancy classification model using the curated dataset in
`ml/data/occupancy_train.csv`. The script performs time-aware cross-validation,
selects a decision threshold on out-of-fold predictions, evaluates a chronologically
later hold-out segment, and finally fits the model on all data before exporting it
to `ml/artifacts/occupancy_model.joblib`.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.utils.class_weight import compute_sample_weight

from common import FEATURES, build_features

CSV_PATH = Path("./ml/data/occupancy_train.csv")
ARTIFACT_PATH = Path("./ml/artifacts/occupancy_model.joblib")
METRICS_PATH = ARTIFACT_PATH.with_suffix(".metrics.json")


def load_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = build_features(df)
    df = df.dropna(subset=["timestamp", "occupied"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    df["occupied"] = df["occupied"].astype(int)
    return df


def choose_threshold(y_true: np.ndarray, proba: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, proba)
    f1 = 2 * (precision * recall) / (precision + recall + 1e-12)
    candidates = list(thresholds)

    # augment with evenly spaced quantiles to avoid degenerate 0.0 threshold
    quantiles = np.quantile(proba, np.linspace(0.05, 0.95, 19))
    candidates.extend(quantiles)
    candidates = [t for t in candidates if 0.01 <= t <= 0.99]

    best_f1 = -1.0
    best_thr = 0.5
    for thr in np.unique(np.round(candidates, 6)):
        preds = (proba >= thr).astype(int)
        if preds.min() == preds.max():
            continue  # ignore thresholds that collapse to a single class
        score = f1_score(y_true, preds, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_thr = thr

    if best_f1 < 0:  # fallback
        return float(np.clip(thresholds[np.argmax(f1)], 0.05, 0.95))
    return float(np.clip(best_thr, 0.05, 0.95))


def split_with_class_coverage(
    df: pd.DataFrame,
    target: str,
    holdout_fraction: float = 0.15,
    min_class_count: int = 50,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    holdout_size = max(200, int(len(df) * holdout_fraction))
    holdout_size = min(holdout_size, len(df) - 1)
    step = max(1, holdout_size // 4)
    last_start = len(df) - holdout_size
    best_train = df.iloc[:last_start].copy()
    best_holdout = df.iloc[last_start:].copy()
    best_counts = best_holdout[target].value_counts()

    for start in range(last_start, -1, -step):
        window = df.iloc[start : start + holdout_size]
        counts = window[target].value_counts()
        if counts.get(0, 0) >= min_class_count and counts.get(1, 0) >= min_class_count:
            return df.iloc[:start].copy(), window.copy()
        # remember the window with the highest minority count as fallback
        minority = min(counts.get(0, 0), counts.get(1, 0))
        best_minority = min(best_counts.get(0, 0), best_counts.get(1, 0))
        if minority > best_minority:
            best_counts = counts
            best_train = df.iloc[:start].copy()
            best_holdout = window.copy()

    if len(best_train) == 0:  # final fallback: keep last chunk even if imbalanced
        start = max(0, len(df) - holdout_size)
        return df.iloc[:start].copy(), df.iloc[start:].copy()
    return best_train, best_holdout


def oof_predictions(
    pipeline: Pipeline,
    X: pd.DataFrame,
    y: np.ndarray,
    sample_weight: np.ndarray,
    cv: TimeSeriesSplit,
) -> np.ndarray:
    proba = np.zeros_like(y, dtype=float)
    for fold, (train_idx, val_idx) in enumerate(cv.split(X), start=1):
        model = clone(pipeline)
        model.fit(
            X.iloc[train_idx],
            y[train_idx],
            clf__sample_weight=sample_weight[train_idx],
        )
        proba[val_idx] = model.predict_proba(X.iloc[val_idx])[:, 1]
        print(f"[CV] Fold {fold}: fitted on {len(train_idx)} rows, validated on {len(val_idx)} rows.")
    return proba


def evaluate_classification(
    y_true: np.ndarray,
    proba: np.ndarray,
    threshold: float,
) -> dict:
    pred = (proba >= threshold).astype(int)
    report = classification_report(y_true, pred, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_true, pred).tolist()

    metrics = {
        "threshold": float(threshold),
        "accuracy": float(accuracy_score(y_true, pred)),
        "precision": float(precision_score(y_true, pred, zero_division=0)),
        "recall": float(recall_score(y_true, pred, zero_division=0)),
        "f1": float(f1_score(y_true, pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, proba)),
        "pr_auc": float(average_precision_score(y_true, proba)),
        "classification_report": report,
        "confusion_matrix": cm,
    }
    return metrics


def main() -> None:
    df = load_dataset(CSV_PATH)
    print(f"Loaded {len(df):,} occupancy rows from {CSV_PATH}.")

    train_df, holdout_df = split_with_class_coverage(
        df, target="occupied", holdout_fraction=0.15, min_class_count=100
        if len(df) * 0.15 > 300
        else 25,
    )

    X_train = train_df[FEATURES]
    y_train = train_df["occupied"].to_numpy()

    X_holdout = holdout_df[FEATURES]
    y_holdout = holdout_df["occupied"].to_numpy()

    preprocessor = ColumnTransformer(
        transformers=[("num", SimpleImputer(strategy="median"), FEATURES)],
        remainder="drop",
    )

    classifier = HistGradientBoostingClassifier(
        max_depth=None,
        max_leaf_nodes=31,
        learning_rate=0.05,
        l2_regularization=0.1,
        min_samples_leaf=20,
        validation_fraction=None,
        random_state=42,
    )

    pipeline = Pipeline(
        steps=[
            ("pre", preprocessor),
            ("clf", classifier),
        ]
    )

    cv = TimeSeriesSplit(n_splits=5, gap=24)
    sample_weight = compute_sample_weight(class_weight="balanced", y=y_train)

    print("Running time-series cross-validation...")
    oof_proba = oof_predictions(pipeline, X_train, y_train, sample_weight, cv)
    threshold = choose_threshold(y_train, oof_proba)
    cv_metrics = evaluate_classification(y_train, oof_proba, threshold)
    print("[CV] Metrics:", json.dumps(cv_metrics, indent=2))

    print("Fitting model on training portion and evaluating hold-out window...")
    holdout_model = clone(pipeline)
    holdout_model.fit(X_train, y_train, clf__sample_weight=sample_weight)
    holdout_proba = holdout_model.predict_proba(X_holdout)[:, 1]
    holdout_metrics = evaluate_classification(y_holdout, holdout_proba, threshold)
    print("[Holdout] Metrics:", json.dumps(holdout_metrics, indent=2))

    print("Refitting model on the full dataset for export...")
    full_X = df[FEATURES]
    full_y = df["occupied"].to_numpy()
    full_weights = compute_sample_weight(class_weight="balanced", y=full_y)
    pipeline.fit(full_X, full_y, clf__sample_weight=full_weights)

    metadata = {
        "model_type": "HistGradientBoostingClassifier",
        "features": FEATURES,
        "threshold": threshold,
        "cv": {
            "strategy": "TimeSeriesSplit",
            "n_splits": 5,
            "gap": 24,
            "metrics": cv_metrics,
        },
        "holdout": {
            "size": len(holdout_df),
            "metrics": holdout_metrics,
            "start": holdout_df["timestamp"].iloc[0],
            "end": holdout_df["timestamp"].iloc[-1],
        },
        "model_version": "v3",
    }

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "pipeline": pipeline,
            "threshold": float(threshold),
            "metadata": metadata,
        },
        ARTIFACT_PATH,
        compress=("xz", 3),
    )
    with METRICS_PATH.open("w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)

    print(f"Saved model artifact to {ARTIFACT_PATH}")
    print(f"Saved training metadata to {METRICS_PATH}")


if __name__ == "__main__":
    main()
