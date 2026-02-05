import logging
import joblib, pandas as pd
import xgboost as xgb
import os

# allow both local and docker imports
try:
    from ml.training.common import build_features, FEATURES
except Exception:
    from training.common import build_features, FEATURES

ARTIFACTS = {
    "occupancy": "./ml/artifacts/occupancy_model.json",
    "health":    "./ml/artifacts/health_model.joblib",
    "smoke":     "./ml/artifacts/smoke_model.joblib",
}
MODELS = {}
LOGGER = logging.getLogger(__name__)

def load_models():
    for name, path in ARTIFACTS.items():
        try:
            if not os.path.exists(path):
                MODELS[name] = None
                continue

            if path.endswith(".json"):
                model = xgb.Booster()
                model.load_model(path)
                MODELS[name] = {"model": model, "type": "xgboost"}
            else:
                artifact = joblib.load(path)
                if isinstance(artifact, dict):
                    pipeline = artifact.get("pipeline")
                else:
                    pipeline = artifact
                    artifact = {"pipeline": pipeline}
                if pipeline is not None and hasattr(pipeline, "steps"):
                    step_name, estimator = pipeline.steps[-1]
                    if hasattr(estimator, "n_jobs"):
                        pipeline.set_params(**{f"{step_name}__n_jobs": 1})
                MODELS[name] = artifact
            # Silent loading
        except Exception as e:
            # Silent error handling
            MODELS[name] = None

def _df(payload: dict) -> pd.DataFrame:
    df = pd.DataFrame([payload])
    df = df.rename(columns={"pm01": "pm1"})
    return build_features(df)

def _to_number(value):
    try:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None

def predict_occupancy(p: dict):
    if MODELS["occupancy"] is None:
        return {"occupied": False, "confidence": 0.0, "error": "Model not loaded"}
    try:
        model_info = MODELS["occupancy"]
        
        if model_info.get("type") == "xgboost":
            # XGBoost prediction logic
            co2 = _to_number(p.get("co2"))
            temp_c = _to_number(p.get("temp_c"))
            rh = _to_number(p.get("rh"))
            
            # Handle missing values if necessary, or let XGBoost handle them (it handles NaNs)
            # Construct DataFrame with specific feature order expected by the model
            features = pd.DataFrame([[co2, temp_c, rh]], columns=["co2", "temp_c", "rh"])
            dmatrix = xgb.DMatrix(features)
            
            model = model_info["model"]
            n_estimate = float(model.predict(dmatrix)[0])
            
            # Logic to determine occupancy status and confidence
            # Assuming n_estimate is the number of people
            occupied = n_estimate >= 0.5 # Threshold for occupied
            confidence = min(1.0, max(0.0, n_estimate / 5.0)) # Simple confidence scaling
            if n_estimate < 0: n_estimate = 0.0

            return {
                "occupied": occupied,
                "confidence": confidence,
                "probability": confidence,
                "n_estimate": n_estimate,
                "raw_prediction": n_estimate
            }
        else:
            # Legacy pipeline logic
            df = _df(p)
            pipe = model_info["pipeline"]
            raw_proba = float(pipe.predict_proba(df[FEATURES])[0, 1])

            adjusted = raw_proba
            co2 = _to_number(p.get("co2"))
            voc = _to_number(p.get("voc"))
            temp_c = _to_number(p.get("temp_c"))
            rh = _to_number(p.get("rh"))

            supporting_signals = 0
            if co2 is not None and co2 > 750:
                supporting_signals += 1
            if voc is not None and voc > 320:
                supporting_signals += 1
            if temp_c is not None and temp_c > 25:
                supporting_signals += 1
            if rh is not None and rh > 60:
                supporting_signals += 1

            if supporting_signals == 0:
                adjusted = min(adjusted, 0.35)
                if raw_proba >= 0.7:
                    LOGGER.debug(
                        "Occupancy probability %.3f reduced to %.3f for device %s because supporting signals are absent (co2=%s, voc=%s, temp_c=%s, rh=%s)",
                        raw_proba,
                        adjusted,
                        p.get("device_id"),
                        co2,
                        voc,
                        temp_c,
                        rh,
                    )

            threshold = 0.9
            occupied = adjusted >= threshold
            return {
                "occupied": occupied,
                "confidence": adjusted,
                "probability": adjusted,
                "raw_probability": raw_proba,
                "threshold": threshold,
                "supporting_signals": supporting_signals,
            }
    except Exception as e:
        return {"occupied": False, "confidence": 0.0, "error": str(e)}

def predict_health(p: dict):
    if MODELS["health"] is None:
        return {"health_index": 50.0, "action": "UNKNOWN", "error": "Model not loaded"}
    try:
        df = _df(p)
        pipe = MODELS["health"]["pipeline"]
        val = float(pipe.predict(df[FEATURES])[0])
        if val < 60: action = "VENTILATE_OR_PURIFY"
        elif val < 80: action = "MONITOR"
        else: action = "GOOD"
        return {"health_index": max(0,min(100,val)), "action": action}
    except Exception as e:
        return {"health_index": 50.0, "action": "UNKNOWN", "error": str(e)}

def predict_smoke(p: dict):
    if MODELS["smoke"] is None:
        return {"smoke_present": False, "confidence": 0.0, "error": "Model not loaded"}
    try:
        df = _df(p)
        pipe = MODELS["smoke"]["pipeline"]
        raw_proba = float(pipe.predict_proba(df[FEATURES])[0, 1])

        adjusted = raw_proba
        pm25 = _to_number(p.get("pm25"))
        pm1 = _to_number(p.get("pm1"))
        voc = _to_number(p.get("voc"))

        if (
            (pm25 is None or pm25 < 35)
            and (voc is None or voc < 400)
            and (pm1 is None or pm1 < 20)
        ):
            if raw_proba >= 0.6:
                LOGGER.debug(
                    "Smoke probability %.3f reduced due to clean baseline readings (pm25=%s, voc=%s, pm1=%s) for device %s",
                    raw_proba,
                    pm25,
                    voc,
                    pm1,
                    p.get("device_id"),
                )
            adjusted = min(adjusted, 0.25)

        threshold = 0.8
        smoke_present = adjusted >= threshold
        return {
            "smoke_present": smoke_present,
            "confidence": adjusted,
            "probability": adjusted,
            "raw_probability": raw_proba,
            "threshold": threshold,
        }
    except Exception as e:
        return {"smoke_present": False, "confidence": 0.0, "error": str(e)}
