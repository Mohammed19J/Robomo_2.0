# Model Analysis and Issues Fixed

## Issues Identified and Fixed

### 1. ✅ React Error Fixed

**Problem:** Objects were being rendered directly as React children
**Solution:** Added proper object handling to convert objects to strings before rendering

### 2. ✅ Occupancy Detection Issues Fixed

**Problem:** Occupancy was always showing 0.8-0.84 (high) even when lab was empty at night

**Root Cause:** The heuristic calculations were **backwards**:

- CO2 calculation: `(co2 - 420) / 800 * 0.6` gave high scores for normal CO2 levels
- Humidity calculation: `Math.abs(rh - 45) / 35 * 0.2` gave high scores for normal humidity
- Temperature calculation: `Math.abs(tempC - 22) / 8 * 0.2` gave high scores for normal temperature
- VOC calculation: `voc / 400 * 0.2` gave high scores for normal VOC levels

**Solution:** Fixed the logic to properly detect occupancy:

- **CO2:** Only signals occupancy above 600 ppm (strong above 1000 ppm)
- **Humidity:** Only signals occupancy when significantly different from 45% baseline
- **Temperature:** Only signals occupancy when significantly different from 22°C baseline
- **VOC:** Only signals occupancy above 200 ppb (strong above 400 ppb)

### 3. ✅ Smoke Detection Issues Fixed

**Problem:** Smoke detection was always showing 0.49-0.51 (moderate) even with no smoke/fire

**Root Cause:** Similar backwards logic:

- PM2.5 calculation: `pm25 / 150` gave high scores for normal PM2.5 levels
- PM10 calculation: `pm10 / 200` gave high scores for normal PM10 levels
- VOC calculation: `voc / 800 * 0.6` gave high scores for normal VOC levels

**Solution:** Fixed the logic to properly detect smoke:

- **PM2.5:** Only signals smoke above 35 µg/m³ (strong above 75 µg/m³)
- **PM10:** Only signals smoke above 50 µg/m³ (strong above 100 µg/m³)
- **VOC:** Only signals smoke above 500 ppb (strong above 1000 ppb)

## Model Performance Analysis

### Current Model Issues

1. **Heuristic Fallback Problems:**

   - The heuristic calculations were fundamentally flawed
   - They were giving high scores for normal environmental conditions
   - This caused false positives for both occupancy and smoke detection

2. **Threshold Issues:**

   - Original thresholds were too sensitive
   - Normal environmental readings were triggering alerts
   - No proper baseline establishment

3. **Weight Distribution:**
   - CO2 was weighted too heavily (0.6) compared to other factors
   - This caused CO2 to dominate occupancy calculations
   - Other factors were underweighted

### Improved Model Logic

#### Occupancy Detection:

```
CO2 Signal: co2 > 1000 ? 1.0 : co2 > 600 ? (co2 - 600) / 400 : 0
Humidity Signal: |rh - 45| > 20 ? 1.0 : |rh - 45| > 10 ? |rh - 45| / 20 : 0
Temperature Signal: |temp - 22| > 4 ? 1.0 : |temp - 22| > 2 ? |temp - 22| / 4 : 0
VOC Signal: voc > 400 ? 1.0 : voc > 200 ? (voc - 200) / 200 : 0
```

#### Smoke Detection:

```
PM2.5 Signal: pm25 > 75 ? 1.0 : pm25 > 35 ? (pm25 - 35) / 40 : 0
PM10 Signal: pm10 > 100 ? 1.0 : pm10 > 50 ? (pm10 - 50) / 50 : 0
VOC Signal: voc > 1000 ? 1.0 : voc > 500 ? (voc - 500) / 500 : 0
```

## Recommendations for Further Improvements

### 1. Machine Learning Model Enhancements

- **Training Data:** Collect more diverse environmental data
- **Feature Engineering:** Add time-based features (hour, day of week)
- **Model Validation:** Implement cross-validation and testing
- **Continuous Learning:** Update models with new data

### 2. Baseline Establishment

- **Environmental Baselines:** Establish normal ranges for each sensor
- **Adaptive Thresholds:** Adjust thresholds based on historical data
- **Seasonal Adjustments:** Account for seasonal variations

### 3. Multi-Sensor Fusion

- **Sensor Correlation:** Analyze relationships between different sensors
- **Confidence Scoring:** Weight sensors based on reliability
- **Anomaly Detection:** Identify unusual patterns across sensors

### 4. Real-Time Calibration

- **Drift Correction:** Correct for sensor drift over time
- **Calibration Validation:** Regular calibration checks
- **Quality Assurance:** Monitor sensor health and accuracy

### 5. Advanced Analytics

- **Trend Analysis:** Identify long-term patterns
- **Predictive Modeling:** Forecast environmental changes
- **Alert Optimization:** Reduce false positives and negatives

## Expected Results After Fixes

### Occupancy Detection:

- **Empty Lab (Night):** Should show "Vacant" or "Unknown"
- **Normal Activity:** Should show "Likely Occupied" or "Occupied"
- **High Activity:** Should show "Occupied" with high confidence

### Smoke Detection:

- **Normal Conditions:** Should show "Normal"
- **Elevated Particles:** Should show "Suspicious" or "Warning"
- **Actual Smoke/Fire:** Should show "Critical"

### Health Index:

- **Good Air Quality:** Should show "Excellent" or "Good"
- **Moderate Issues:** Should show "Moderate" or "Poor"
- **Critical Issues:** Should show "Critical"

## Conclusion

The main issues were in the heuristic fallback calculations, which were fundamentally flawed. The fixes implement proper threshold-based detection that should provide much more accurate results. The models should now correctly identify:

1. **Empty spaces** as vacant (not occupied)
2. **Normal environmental conditions** as normal (not smoky)
3. **Actual occupancy** when people are present
4. **Real smoke/fire** when it occurs

The system should now provide reliable, accurate environmental monitoring with proper status reporting.
