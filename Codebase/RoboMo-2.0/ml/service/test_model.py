import sys
import os

# Add the project root to the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../")))

from ml.service.model_registry import load_models, predict_occupancy

def test_occupancy_model():
    print("Loading models...")
    load_models()
    
    print("\nTesting Occupancy Prediction...")
    # Test case 1: High values (likely occupied)
    payload_high = {
        "co2": 1000.0,
        "temp_c": 26.0,
        "rh": 65.0,
        "voc": 500.0, # Extra field to ensure it doesn't break
        "device_id": "test_device"
    }
    result_high = predict_occupancy(payload_high)
    print(f"High Input: {payload_high}")
    print(f"Result: {result_high}")

    # Test case 2: Low values (likely empty)
    payload_low = {
        "co2": 400.0,
        "temp_c": 20.0,
        "rh": 40.0,
        "device_id": "test_device"
    }
    result_low = predict_occupancy(payload_low)
    print(f"\nLow Input: {payload_low}")
    print(f"Result: {result_low}")

if __name__ == "__main__":
    test_occupancy_model()
