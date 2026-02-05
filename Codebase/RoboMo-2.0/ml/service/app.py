import logging
from fastapi import FastAPI
from ml.service.schemas import SensorPayload
from ml.service.model_registry import (
    load_models,
    predict_occupancy,
    predict_health,
    predict_smoke,
)

# from standards_baseline.api import router as baseline_router
# from standards_baseline.switch import (
#     compute_from_payload as baseline_compute,
#     get_mode as baseline_get_mode,
# )

# Suppress all logging
logging.getLogger("uvicorn").setLevel(logging.CRITICAL)
logging.getLogger("uvicorn.access").setLevel(logging.CRITICAL)
logging.getLogger("fastapi").setLevel(logging.CRITICAL)
logging.getLogger().setLevel(logging.CRITICAL)

app = FastAPI(title="Robomo ML Service", docs_url=None, redoc_url=None)
# app.include_router(baseline_router)


@app.on_event("startup")
def _startup():
    load_models()
    print("ML Service running on http://0.0.0.0:8000")


# def _baseline_result(payload: dict) -> dict:
#     return baseline_compute(payload)


@app.post("/predict/occupancy")
def occupancy(p: SensorPayload):
    payload = p.dict(by_alias=True)
    # if baseline_get_mode() == "baseline":
    #     baseline = _baseline_result(payload)
    #     occ = baseline["occupancy"]
    #     estimate = occ.get("n_estimate", 0.0)
    #     confidence = min(1.0, estimate / 5.0)
    #     return {
    #         "occupied": estimate >= 1.0,
    #         "confidence": confidence,
    #         "probability": confidence,
    #         "n_estimate": estimate,
    #         "ach_used": occ.get("ach_used"),
    #         "note": occ.get("note"),
    #         "mode": "baseline",
    #     }
    return predict_occupancy(payload)


@app.post("/predict/health")
def health(p: SensorPayload):
    payload = p.dict(by_alias=True)
    # if baseline_get_mode() == "baseline":
    #     baseline = _baseline_result(payload)
    #     iaq = baseline["iaq"]
    #     return {
    #         "health_index": iaq.get("iaq_score"),
    #         "action": "BASELINE",
    #         "components": iaq,
    #         "mode": "baseline",
    #     }
    return predict_health(payload)


@app.post("/predict/smoke")
def smoke(p: SensorPayload):
    payload = p.dict(by_alias=True)
    # if baseline_get_mode() == "baseline":
    #     baseline = _baseline_result(payload)
    #     smoke_info = baseline["smoke"]
    #     confidence = 1.0 if smoke_info.get("smoke_present") else 0.0
    #     return {
    #         "smoke_present": smoke_info.get("smoke_present"),
    #         "confidence": confidence,
    #         "probability": confidence,
    #         "raw_probability": confidence,
    #         "threshold": 0.0,
    #         "reason": smoke_info.get("reason"),
    #         "mode": "baseline",
    #     }
    return predict_smoke(payload)
