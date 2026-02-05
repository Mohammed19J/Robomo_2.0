const axios = require("axios");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isNumeric = (value) =>
  typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value);
const previousPayloads = new Map();

const USE_ML_HEALTH = false;

const IAQ_WEIGHTS = {
  pm25: 0.4,
  co2: 0.2,
  tvoc: 0.2,
  comfort: 0.2,
};

const PM25_BREAKPOINTS = [
  { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
  { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
  { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
  { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
  { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 },
];

const pm25Penalty = (pm25) => {
  if (!isNumeric(pm25)) return null;
  const value = Math.max(0, pm25);
  const bp = PM25_BREAKPOINTS.find((range) => value <= range.cHigh);
  if (!bp) return 100;
  const { cLow, cHigh, iLow, iHigh } = bp;
  const aqi =
    ((iHigh - iLow) / (cHigh - cLow)) * (value - cLow) + iLow;
  return clamp(aqi / 5, 0, 100);
};

const co2Penalty = (co2) => {
  if (!isNumeric(co2)) return null;
  const penalty = 100 / (1 + Math.exp(-0.018 * (co2 - 800)));
  return clamp(penalty, 0, 100);
};

const tvocPenalty = (voc) => {
  if (!isNumeric(voc)) return null;
  if (voc <= 220) return 0;
  if (voc <= 660) {
    const t = (voc - 220) / 440;
    return clamp(50 * t * t, 0, 100);
  }
  if (voc <= 2200) {
    const t = (voc - 660) / 1540;
    return clamp(50 + 50 * t * t, 0, 100);
  }
  return 100;
};

const comfortPenalty = (tempC, rh) => {
  let penalty = 0;
  let hasSignal = false;

  if (isNumeric(tempC)) {
    hasSignal = true;
    const delta =
      tempC < 20 ? 20 - tempC : tempC > 25 ? tempC - 25 : 0;
    if (delta > 0) {
      penalty += 2 * delta * delta;
    }
  }

  if (isNumeric(rh)) {
    hasSignal = true;
    const delta = rh < 30 ? 30 - rh : rh > 60 ? rh - 60 : 0;
    if (delta > 0) {
      penalty += 1.2 * Math.pow(delta, 1.3);
    }
  }

  return hasSignal ? clamp(penalty, 0, 100) : null;
};

const iaqScoreFromPayload = (payload) => {
  const penalties = {
    pm25: pm25Penalty(payload.pm25),
    co2: co2Penalty(payload.co2),
    tvoc: tvocPenalty(payload.voc),
    comfort: comfortPenalty(payload.temp_c, payload.rh),
  };

  const components = [
    { key: "pm25", weight: IAQ_WEIGHTS.pm25, penalty: penalties.pm25 },
    { key: "co2", weight: IAQ_WEIGHTS.co2, penalty: penalties.co2 },
    { key: "tvoc", weight: IAQ_WEIGHTS.tvoc, penalty: penalties.tvoc },
    { key: "comfort", weight: IAQ_WEIGHTS.comfort, penalty: penalties.comfort },
  ].filter((component) => isNumeric(component.penalty));

  const weightSum = components.reduce((sum, component) => sum + component.weight, 0);
  if (weightSum === 0) {
    return { score: null, penaltyCount: 0 };
  }

  const weightedPenalty =
    components.reduce(
      (sum, component) => sum + component.weight * component.penalty,
      0
    ) / weightSum;

  return {
    score: clamp(100 - weightedPenalty, 0, 100),
    penaltyCount: components.length,
  };
};

const attributeCandidates = {
  temperature: [
    "temperature",
    "temp",
    "Temperature",
    "ambientTemperature",
    "temp_c",
    "temperaturec",
    "temperature_c",
    "A Temp Value",
    "S C D41 Temperature Value",
    "Temperature Value",
    "a_temp_value",
    "SCD41_temperature_value",
  ],
  humidity: [
    "humidity",
    "relativeHumidity",
    "Humidity",
    "rh",
    "humidity_percent",
    "A Hum Value",
    "S C D41 Humidity Value",
    "Humidity Value",
    "a_hum_value",
    "SCD41_humidity_value",
  ],
  co2: [
    "co2",
    "Co2",
    "CO2",
    "carbonDioxide",
    "eco2",
    "co2ppm",
    "co2_ppm",
    "S C D41 C O2 Value",
    "CO2 Value",
    "SCD41_CO2_value",
  ],
  voc: [
    "voc",
    "tvoc",
    "volatileOrganicCompounds",
    "TVOC",
    "vocindex",
    "voc_index",
    "Voc Value",
    "VOC Value",
    "voc_value",
  ],
  pm1: [
    "pm1",
    "pm_1",
    "pm01",
    "pm1_0",
    "PM1.0",
    "P M1 0 Value",
    "PM1.0 Value",
    "PM1_0_value",
  ],
  pm25: [
    "pm25",
    "pm2_5",
    "PM2.5",
    "ParticulateMatter25",
    "pm25.0",
    "P M2 5 Value",
    "PM2.5 Value",
    "PM2_5_value",
  ],
  pm4: [
    "pm4",
    "pm4_0",
    "pm4.0",
    "P M4 0 Value",
    "PM4.0 Value",
    "PM4_0_value",
  ],
  pm10: [
    "PM10",
    "ParticulateMatter10",
    "PM10.0",
    "PM10_0",
    "P M10 0 Value",
    "PM10.0 Value",
    "PM10_0_value",
  ],
};

const TIMESTAMP_KEYS = [
  "observedAt",
  "timestamp",
  "time",
  "dateObserved",
  "dateTime",
  "datetime",
  "ts",
  "lastUpdated",
  "lastUpdate",
  "receivedAt",
  "sampledAt",
];

const toIsoTimestamp = (value) => {
  if (value instanceof Date) {
    const iso = value.toISOString();
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date.toISOString();
  }
  return null;
};

const extractTimestampFromEntry = (entry, depth = 0) => {
  if (!entry || depth > 5) return null;
  if (typeof entry !== "object" || Array.isArray(entry)) {
    return toIsoTimestamp(entry);
  }

  for (const key of TIMESTAMP_KEYS) {
    if (entry[key]) {
      const iso = toIsoTimestamp(entry[key]);
      if (iso) return iso;
    }
  }

  if (Array.isArray(entry.values) && entry.values.length > 0) {
    for (let idx = entry.values.length - 1; idx >= 0; idx -= 1) {
      const iso = extractTimestampFromEntry(entry.values[idx], depth + 1);
      if (iso) return iso;
    }
  }

  if (entry.metadata && typeof entry.metadata === "object") {
    for (const meta of Object.values(entry.metadata)) {
      const iso = extractTimestampFromEntry(meta, depth + 1);
      if (iso) return iso;
    }
  }

  if (entry.value && typeof entry.value === "object") {
    const iso = extractTimestampFromEntry(entry.value, depth + 1);
    if (iso) return iso;
  }

  return null;
};

const extractLatestTimestamp = (device) => {
  const timestamps = [];
  const pushTimestamp = (candidate) => {
    if (candidate) timestamps.push(candidate);
  };

  Object.values(attributeCandidates).forEach((candidates) => {
    candidates.forEach((key) => {
      if (!key) return;
      const attr = device[key];
      const iso = extractTimestampFromEntry(attr);
      if (iso) pushTimestamp(iso);
    });
  });

  if (Array.isArray(device.attributes)) {
    device.attributes.forEach((attr) => {
      const iso = extractTimestampFromEntry(attr);
      if (iso) pushTimestamp(iso);
    });
  }

  TIMESTAMP_KEYS.forEach((key) => {
    if (device[key]) {
      const iso = toIsoTimestamp(device[key]);
      if (iso) pushTimestamp(iso);
    }
  });

  if (timestamps.length === 0) return null;

  return timestamps.reduce(
    (latest, current) => (!latest || current > latest ? current : latest),
    null
  );
};

const ML_SERVICE_URL =
  (process.env.ML_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");

const TITLES = {
  occupancy: "Occupancy Detection",
  healthIndex: "Health Index & Decision Logic",
  smokeDetection: "Smoke & Fire Detection",
};

const OCCUPANCY_FEATURES = ["co2", "voc", "temp_c", "rh"];
const HEALTH_FEATURES = ["co2", "voc", "pm1", "pm25", "pm10", "temp_c", "rh"];
const SMOKE_FEATURES = ["pm1", "pm25", "pm10", "voc"];
const OCCUPANCY_PRIMARY = ["co2", "voc"];

const SENSOR_RULES = {
  co2: {
    label: "CO₂",
    unit: "ppm",
    warning: 900,
    critical: 1200,
    applies: ["occupancy", "health"],
    adviceWarning: "Increase ventilation or reduce occupancy.",
    adviceCritical:
      "Ventilate immediately and reduce occupancy in this area.",
  },
  voc: {
    label: "VOC",
    unit: "ppb",
    warning: 350,
    critical: 650,
    applies: ["health", "smoke"],
    adviceWarning: "Increase ventilation; check for chemical sources.",
    adviceCritical:
      "Ventilate immediately; investigate potential leaks or chemicals.",
  },
  pm1: {
    label: "PM1.0",
    unit: "µg/m³",
    warning: 25,
    critical: 50,
    applies: ["smoke"],
    adviceWarning: "Fine particle levels elevated; increase filtration.",
    adviceCritical:
      "Very fine particles detected—possible smoke, investigate immediately.",
  },
  pm25: {
    label: "PM2.5",
    unit: "µg/m³",
    threshold: 35,
    critical: 75,
    advice: "Particulate matter levels elevated. Check ventilation.",
    adviceCritical: "High particulate matter levels detected. Investigate source.",
    applies: ["health", "smoke"],
  },
  pm10: {
    label: "PM10",
    unit: "µg/m³",
    threshold: 50,
    critical: 100,
    advice: "Particulate matter levels elevated. Check ventilation.",
    adviceCritical: "High particulate matter levels detected. Investigate source.",
    applies: ["health", "smoke"],
  },
};

const HUMIDITY_RULES = {
  high: {
    label: "Humidity",
    unit: "%",
    warning: 70,
    critical: 80,
    adviceWarning: "Use ventilation or a dehumidifier to lower humidity.",
    adviceCritical:
      "High humidity—risk of mold; increase dehumidification immediately.",
  },
  low: {
    label: "Humidity",
    unit: "%",
    warning: 30,
    critical: 25,
    adviceWarning: "Air is dry; consider using a humidifier.",
    adviceCritical: "Very dry air; adjust humidification immediately.",
  },
};

const TEMPERATURE_RULES = {
  high: {
    label: "Temperature",
    unit: "degC",
    warning: 30,
    critical: 34,
    adviceWarning: "Lower the thermostat or improve cooling.",
    adviceCritical: "Temperature very high; address cooling immediately.",
  },
  low: {
    label: "Temperature",
    unit: "degC",
    warning: 15,
    critical: 12,
    adviceWarning: "Increase heating to maintain comfort.",
    adviceCritical: "Temperature very low; raise heating immediately.",
  },
};

const hasNumericValue = (payload, keys, minimum = 1) =>
  keys.filter((key) => isNumeric(payload[key])).length >= minimum;

const activeFeatures = (payload, keys) =>
  keys.filter((key) => isNumeric(payload[key]));

const numericFromString = (value) => {
  const match = typeof value === "string" ? value.match(/-?\d+(\.\d+)?/) : null;
  return match ? Number(match[0]) : null;
};

const extractNumeric = (input, depth = 0) => {
  if (input === null || input === undefined || depth > 5) return null;
  if (isNumeric(input)) return input;
  if (typeof input === "string") {
    const parsed = numericFromString(input);
    return parsed !== null ? parsed : null;
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const value = extractNumeric(item, depth + 1);
      if (value !== null) return value;
    }
    return null;
  }
  if (typeof input === "object") {
    // Priority keys for extracting numeric values from objects
    const priorityKeys = [
      "value",
      "avg",
      "average",
      "mean",
      "raw",
      "reading",
      "val",
      "data",
      "current",
      "measured",
      "lastValue",
      "v",
    ];

    // First try priority keys
    for (const key of priorityKeys) {
      if (key in input) {
        const value = extractNumeric(input[key], depth + 1);
        if (value !== null) return value;
      }
    }

    // Then try all keys
    for (const key of Object.keys(input)) {
      const value = extractNumeric(input[key], depth + 1);
      if (value !== null) return value;
    }
  }
  return null;
};

const extractFromAttributes = (device, candidate) => {
  const attributes = device.attributes;
  if (!Array.isArray(attributes)) return null;

  const lcCandidateSet = new Set(candidate.map((c) => c.toLowerCase()));

  for (const attr of attributes) {
    const name =
      (attr.attrName || attr.name || attr.attribute || "").toLowerCase();
    if (!name) continue;

    const match =
      lcCandidateSet.has(name) ||
      [...lcCandidateSet].some((candidateName) => name.includes(candidateName));

    if (match) {
      if (attr.values) {
        const recent =
          Array.isArray(attr.values) && attr.values.length > 0
            ? attr.values[attr.values.length - 1]
            : attr.values;
        const numeric = extractNumeric(recent);
        if (numeric !== null) return numeric;
      }
      if (attr.value !== undefined) {
        const numeric = extractNumeric(attr.value);
        if (numeric !== null) return numeric;
      }
      const numeric = extractNumeric(attr);
      if (numeric !== null) return numeric;
    }
  }

  return null;
};

const normalizeKey = (key = "") =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

const extractFromObjectKeys = (device, candidates) => {
  const normalizedCandidates = candidates
    .filter(Boolean)
    .map((c) => normalizeKey(c));
  const entries = Object.entries(device || {});

  // First try exact matches
  for (const [key, value] of entries) {
    if (!key) continue;
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;

    const exactMatch = normalizedCandidates.some(
      (candidate) => candidate && normalizedKey === candidate
    );
    if (exactMatch) {
      const numeric = extractNumeric(value);
      if (numeric !== null) {
        // Silent match
        return numeric;
      }
    }
  }

  // Then try partial matches (more restrictive)
  for (const [key, value] of entries) {
    if (!key) continue;
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey) continue;

    const partialMatch = normalizedCandidates.some(
      (candidate) => {
        if (!candidate) return false;
        // Only match if the candidate is a significant part of the key
        return normalizedKey.includes(candidate) && candidate.length > 3;
      }
    );
    if (partialMatch) {
      const numeric = extractNumeric(value);
      if (numeric !== null) {
        // Silent match
        return numeric;
      }
    }
  }
  return null;
};

const extractValue = (device, keys) => {
  // First try direct object keys (most common case)
  for (const key of keys) {
    if (!key) continue;
    const attr = device[key];
    if (attr === undefined || attr === null) continue;

    const numeric = extractNumeric(attr);
    if (numeric !== null) {
      return numeric;
    }
  }

  // Then try attributes array
  const attrMatch = extractFromAttributes(device, keys);
  if (attrMatch !== null) {
    return attrMatch;
  }

  // Finally try normalized object keys
  const objectMatch = extractFromObjectKeys(device, keys);
  if (objectMatch !== null) {
    return objectMatch;
  }

  return null;
};

const buildPayload = (device) => {
  const resolvedTimestamp =
    extractLatestTimestamp(device) || new Date().toISOString();

  const payload = {
    timestamp: resolvedTimestamp,
    device_id: device.id,
    co2: extractValue(device, attributeCandidates.co2),
    voc: extractValue(device, attributeCandidates.voc),
    pm1: extractValue(device, attributeCandidates.pm1),
    pm25: extractValue(device, attributeCandidates.pm25),
    pm4: extractValue(device, attributeCandidates.pm4),
    pm10: extractValue(device, attributeCandidates.pm10),
    temp_c: extractValue(device, attributeCandidates.temperature),
    rh: extractValue(device, attributeCandidates.humidity),
  };

  return payload;
};

const computeDeltas = (current, previous) => {
  if (!previous) return {};
  const deltas = {};
  ["temp_c", "co2", "pm1", "pm25", "pm4", "pm10"].forEach((key) => {
    if (isNumeric(current[key]) && isNumeric(previous[key])) {
      deltas[key] = current[key] - previous[key];
    }
  });
  return deltas;
};

const availableFeatureNames = (payload) =>
  Object.entries(payload)
    .filter(
      ([key, value]) =>
        !["timestamp", "device_id"].includes(key) && isNumeric(value)
    )
    .map(([key]) => key);

const occupancyStatusFromModel = (occupied, confidence) => {
  if (!occupied) return "Vacant";
  if (confidence >= 0.8) return "Occupied";
  if (confidence >= 0.6) return "Likely Occupied";
  return "Uncertain";
};

const healthStatusFromModel = (healthIndex) => {
  if (healthIndex >= 85) return "Excellent";
  if (healthIndex >= 70) return "Good";
  if (healthIndex >= 55) return "Moderate";
  if (healthIndex >= 40) return "Poor";
  return "Critical";
};

const smokeStatusFromModel = (present, confidence) => {
  if (!present) return "Normal";
  if (confidence >= 0.9) return "Critical";
  if (confidence >= 0.7) return "Warning";
  return "Suspicious";
};

const analyzeIssues = (payload) => {
  const issues = {
    occupancy: [],
    health: [],
    smoke: [],
  };

  const recordIssue = (useCase, rule, severity, value, extraText) => {
    const advice =
      severity === "critical" ? rule.adviceCritical : rule.adviceWarning;
    const message =
      extraText ??
      `${rule.label} ${Number(value.toFixed(1))}${rule.unit} ${severity === "critical" ? "critical" : "elevated"
      }`;
    issues[useCase].push({
      metric: rule.label,
      unit: rule.unit,
      value,
      severity,
      advice,
      message,
    });
  };

  Object.entries(SENSOR_RULES).forEach(([key, rule]) => {
    const val = payload[key];
    if (!isNumeric(val)) return;

    if (rule.critical && val >= rule.critical) {
      rule.applies.forEach((useCase) =>
        recordIssue(useCase, rule, "critical", val)
      );
    } else if (rule.warning && val >= rule.warning) {
      rule.applies.forEach((useCase) =>
        recordIssue(useCase, rule, "warning", val)
      );
    } else if (rule.threshold && val >= rule.threshold) {
      rule.applies.forEach((useCase) =>
        recordIssue(useCase, { ...rule, adviceWarning: rule.advice }, "warning", val)
      );
    }
  });

  if (isNumeric(payload.rh)) {
    const val = payload.rh;
    if (val >= HUMIDITY_RULES.high.critical) {
      recordIssue(
        "health",
        HUMIDITY_RULES.high,
        "critical",
        val,
        `${HUMIDITY_RULES.high.label} ${Number(
          val.toFixed(1)
        )}${HUMIDITY_RULES.high.unit} is extremely high`
      );
    } else if (val >= HUMIDITY_RULES.high.warning) {
      recordIssue(
        "health",
        HUMIDITY_RULES.high,
        "warning",
        val,
        `${HUMIDITY_RULES.high.label} ${Number(
          val.toFixed(1)
        )}${HUMIDITY_RULES.high.unit} is high`
      );
    } else if (val <= HUMIDITY_RULES.low.critical) {
      recordIssue(
        "health",
        HUMIDITY_RULES.low,
        "critical",
        val,
        `${HUMIDITY_RULES.low.label} ${Number(
          val.toFixed(1)
        )}${HUMIDITY_RULES.low.unit} is extremely low`
      );
    } else if (val <= HUMIDITY_RULES.low.warning) {
      recordIssue(
        "health",
        HUMIDITY_RULES.low,
        "warning",
        val,
        `${HUMIDITY_RULES.low.label} ${Number(
          val.toFixed(1)
        )}${HUMIDITY_RULES.low.unit} is low`
      );
    }
  }

  if (isNumeric(payload.temp_c)) {
    const val = payload.temp_c;
    if (val >= TEMPERATURE_RULES.high.critical) {
      recordIssue(
        "health",
        TEMPERATURE_RULES.high,
        "critical",
        val,
        `${TEMPERATURE_RULES.high.label} ${Number(
          val.toFixed(1)
        )}${TEMPERATURE_RULES.high.unit} is extremely high`
      );
    } else if (val >= TEMPERATURE_RULES.high.warning) {
      recordIssue(
        "health",
        TEMPERATURE_RULES.high,
        "warning",
        val,
        `${TEMPERATURE_RULES.high.label} ${Number(
          val.toFixed(1)
        )}${TEMPERATURE_RULES.high.unit} is high`
      );
    } else if (val <= TEMPERATURE_RULES.low.critical) {
      recordIssue(
        "health",
        TEMPERATURE_RULES.low,
        "critical",
        val,
        `${TEMPERATURE_RULES.low.label} ${Number(
          val.toFixed(1)
        )}${TEMPERATURE_RULES.low.unit} is extremely low`
      );
    } else if (val <= TEMPERATURE_RULES.low.warning) {
      recordIssue(
        "health",
        TEMPERATURE_RULES.low,
        "warning",
        val,
        `${TEMPERATURE_RULES.low.label} ${Number(
          val.toFixed(1)
        )}${TEMPERATURE_RULES.low.unit} is low`
      );
    }
  }

  if (isNumeric(payload.voc)) {
    const vocVal = payload.voc;
    if (vocVal >= 450) {
      issues.smoke.push({
        metric: "VOC",
        unit: "ppb",
        value: vocVal,
        severity: vocVal >= 600 ? "critical" : "warning",
        advice:
          vocVal >= 600
            ? "Investigate for smoke or chemical sources immediately."
            : "Increase ventilation; check for potential smoke or chemicals.",
        message: `VOC ${Number(vocVal.toFixed(1))}ppb ${vocVal >= 600 ? "critical" : "elevated"
          }`,
      });
    }
  }

  return issues;
};

const buildDetails = (issues, defaultRecommendation, reason, payload = null) => {
  const messages = issues.map((issue) => issue.message);
  const uniqueAdvice = Array.from(
    new Set(issues.map((issue) => issue.advice).filter(Boolean))
  );
  let recommendation =
    uniqueAdvice.length > 0
      ? uniqueAdvice.join(" ")
      : defaultRecommendation || "Readings look normal.";

  if (reason) {
    recommendation = recommendation
      ? `${reason} ${recommendation}`
      : reason;
  }

  // Create more informative tooltip with actual sensor values
  const tooltipParts = [];

  // Add current sensor readings
  if (payload) {
    const sensorReadings = [];
    if (payload.rh !== null && payload.rh !== undefined) {
      sensorReadings.push(`Humidity: ${payload.rh.toFixed(1)}%`);
    }
    if (payload.temp_c !== null && payload.temp_c !== undefined) {
      sensorReadings.push(`Temperature: ${payload.temp_c.toFixed(1)}°C`);
    }
    if (payload.co2 !== null && payload.co2 !== undefined) {
      sensorReadings.push(`CO₂: ${payload.co2.toFixed(0)} ppm`);
    }
    if (payload.voc !== null && payload.voc !== undefined) {
      sensorReadings.push(`VOC: ${payload.voc.toFixed(0)} ppb`);
    }
    if (payload.pm25 !== null && payload.pm25 !== undefined) {
      sensorReadings.push(`PM2.5: ${payload.pm25.toFixed(1)} µg/m³`);
    }
    if (payload.pm10 !== null && payload.pm10 !== undefined) {
      sensorReadings.push(`PM10: ${payload.pm10.toFixed(1)} µg/m³`);
    }

    if (sensorReadings.length > 0) {
      tooltipParts.push(`Current readings: ${sensorReadings.join(", ")}`);
    }
  }

  if (messages.length > 0) {
    tooltipParts.push(`Issues: ${messages.join(", ")}`);
  }
  if (recommendation) {
    tooltipParts.push(`Action: ${recommendation}`);
  }
  if (reason) {
    tooltipParts.push(`Source: ${reason}`);
  }

  return {
    issues: messages,
    recommendation,
    reason,
    tooltip: tooltipParts.join(" | "),
  };
};

const evaluateHeuristic = (payload, issuesByUseCase, reason) => {
  const { co2, rh, temp_c: tempC, voc, pm1, pm25, pm10 } = payload;

  const occupiedSignals = [];
  if (isNumeric(co2)) {
    // CO2 above 600 ppm suggests occupancy, above 1000 ppm strong occupancy
    const co2Signal = co2 > 1000 ? 1.0 : co2 > 600 ? (co2 - 600) / 400 : 0;
    occupiedSignals.push(co2Signal * 0.6);
  }
  if (isNumeric(rh)) {
    // Humidity changes from baseline (45%) suggest occupancy
    const rhChange = Math.abs(rh - 45);
    const rhSignal = rhChange > 20 ? 1.0 : rhChange > 10 ? rhChange / 20 : 0;
    occupiedSignals.push(rhSignal * 0.2);
  }
  if (isNumeric(tempC)) {
    // Temperature changes from baseline (22°C) suggest occupancy
    const tempChange = Math.abs(tempC - 22);
    const tempSignal = tempChange > 4 ? 1.0 : tempChange > 2 ? tempChange / 4 : 0;
    occupiedSignals.push(tempSignal * 0.2);
  }
  if (isNumeric(voc)) {
    // VOC above 200 ppb suggests occupancy, above 400 ppb strong occupancy
    const vocSignal = voc > 400 ? 1.0 : voc > 200 ? (voc - 200) / 200 : 0;
    occupiedSignals.push(vocSignal * 0.2);
  }

  const hasOccupancySignals = occupiedSignals.length > 0;
  const occupancyScore = hasOccupancySignals
    ? occupiedSignals.reduce((acc, part) => acc + part, 0)
    : null;

  const occupancy = {
    key: "occupancy",
    title: "Occupancy Detection",
    status: !hasOccupancySignals
      ? "Unknown"
      : occupancyScore >= 0.8
        ? "Occupied"
        : occupancyScore >= 0.6
          ? "Likely Occupied"
          : occupancyScore >= 0.3
            ? "Possibly Occupied"
            : "Vacant",
    score: hasOccupancySignals
      ? Number(clamp(occupancyScore, 0, 1).toFixed(2))
      : null,
    confidence: hasOccupancySignals
      ? Number(clamp(0.5 + occupiedSignals.length * 0.1, 0, 1).toFixed(2))
      : 0,
    inputs: { co2, rh, temp_c: tempC, voc },
    fallback: !hasOccupancySignals,
  };

  const iaqResult = iaqScoreFromPayload(payload);
  const hasHealthSignals = iaqResult.penaltyCount > 0;
  const healthScore = hasHealthSignals ? iaqResult.score : null;

  const health = {
    key: "healthIndex",
    title: TITLES.healthIndex,
    status: !hasHealthSignals
      ? "Unknown"
      : healthScore >= 85
        ? "Excellent"
        : healthScore >= 70
          ? "Good"
          : healthScore >= 55
            ? "Moderate"
            : healthScore >= 40
              ? "Poor"
              : "Critical",
    score: hasHealthSignals ? Number(healthScore.toFixed(1)) : null,
    confidence: hasHealthSignals
      ? Number(clamp(0.5 + iaqResult.penaltyCount * 0.1, 0, 1).toFixed(2))
      : 0,
    inputs: { co2, voc, pm25, pm10, rh, temp_c: tempC },
    fallback: !hasHealthSignals,
  };

  const smokeSignals = [];
  if (isNumeric(pm25)) {
    // PM2.5 above 35 µg/m³ suggests smoke, above 75 µg/m³ strong smoke
    const pm25Signal = pm25 > 75 ? 1.0 : pm25 > 35 ? (pm25 - 35) / 40 : 0;
    smokeSignals.push(pm25Signal);
  }
  if (isNumeric(pm10)) {
    // PM10 above 50 µg/m³ suggests smoke, above 100 µg/m³ strong smoke
    const pm10Signal = pm10 > 100 ? 1.0 : pm10 > 50 ? (pm10 - 50) / 50 : 0;
    smokeSignals.push(pm10Signal);
  }
  if (isNumeric(voc)) {
    // VOC above 500 ppb suggests smoke, above 1000 ppb strong smoke
    const vocSignal = voc > 1000 ? 1.0 : voc > 500 ? (voc - 500) / 500 : 0;
    smokeSignals.push(vocSignal * 0.6);
  }

  const hasSmokeSignals = smokeSignals.length > 0;
  const smokeScore = hasSmokeSignals
    ? smokeSignals.reduce((acc, part) => Math.max(acc, part), 0)
    : null;

  const smoke = {
    key: "smokeDetection",
    title: TITLES.smokeDetection,
    status: !hasSmokeSignals
      ? "Unknown"
      : smokeScore >= 0.8
        ? "Critical"
        : smokeScore >= 0.6
          ? "Warning"
          : smokeScore >= 0.3
            ? "Suspicious"
            : "Normal",
    score: hasSmokeSignals ? Number(smokeScore.toFixed(2)) : null,
    confidence: hasSmokeSignals
      ? Number(clamp(0.5 + smokeSignals.length * 0.15, 0, 1).toFixed(2))
      : 0,
    inputs: { pm1, pm25, pm10, voc },
    fallback: !hasSmokeSignals,
  };

  occupancy.details = buildDetails(
    issuesByUseCase.occupancy,
    hasOccupancySignals
      ? "Estimated from local sensor readings."
      : "No occupancy-related sensors detected.",
    reason,
    payload
  );
  occupancy.featuresUsed = activeFeatures(payload, OCCUPANCY_FEATURES);

  health.details = buildDetails(
    issuesByUseCase.health,
    hasHealthSignals
      ? "Estimated from environmental sensor readings."
      : "No environmental quality sensors detected.",
    reason,
    payload
  );
  health.featuresUsed = activeFeatures(payload, HEALTH_FEATURES);

  smoke.details = buildDetails(
    issuesByUseCase.smoke,
    hasSmokeSignals
      ? "Estimated from particulate and VOC readings."
      : "No particulate or VOC sensors detected.",
    reason,
    payload
  );
  smoke.featuresUsed = activeFeatures(payload, SMOKE_FEATURES);

  return [occupancy, health, smoke];
};

const callModelService = async (endpoint, payload) => {
  const url = `${ML_SERVICE_URL}${endpoint}`;
  const response = await axios.post(url, payload, { timeout: 10000 });
  return response.data;
};

const evaluateDevice = async (device) => {
  // Silent evaluation - no logging

  const payload = buildPayload(device);
  const previousPayload = previousPayloads.get(device.id);
  const deltas = computeDeltas(payload, previousPayload);
  previousPayloads.set(device.id, payload);
  const issues = analyzeIssues(payload);

  const occupancyFeatures = activeFeatures(payload, OCCUPANCY_FEATURES);
  const healthFeatures = activeFeatures(payload, HEALTH_FEATURES);
  const smokeFeatures = activeFeatures(payload, SMOKE_FEATURES);

  const needsOccupancy = hasNumericValue(payload, OCCUPANCY_PRIMARY);
  const needsHealth = hasNumericValue(payload, HEALTH_FEATURES);
  const needsSmoke = hasNumericValue(payload, SMOKE_FEATURES);

  let occupancyResp = null;
  let healthResp = null;
  let smokeResp = null;
  let mlError = null;

  if (needsOccupancy || needsHealth || needsSmoke) {
    try {
      const responses = await Promise.all([
        needsOccupancy
          ? callModelService("/predict/occupancy", payload)
          : Promise.resolve(null),
        USE_ML_HEALTH && needsHealth
          ? callModelService("/predict/health", payload)
          : Promise.resolve(null),
        Promise.resolve(null), // Reverted to heuristics as requested
      ]);
      [occupancyResp, healthResp, smokeResp] = responses;
    } catch (error) {
      mlError = error;
      // Silent error - fallback to heuristics
    }
  }

  const heuristicEvaluations =
    mlError || (!needsOccupancy && !needsHealth && !needsSmoke)
      ? evaluateHeuristic(
        payload,
        issues,
        mlError
          ? "Model service unavailable; using heuristic estimate."
          : "Estimated from available readings."
      )
      : null;

  const heuristicsByKey = heuristicEvaluations
    ? Object.fromEntries(
      heuristicEvaluations.map((evaluation) => [evaluation.key, evaluation])
    )
    : {};

  const evaluations = [];

  if (!needsOccupancy) {
    evaluations.push({
      key: "occupancy",
      title: TITLES.occupancy,
      status: "Unknown",
      score: null,
      confidence: 0,
      inputs: { ...payload },
      raw: null,
      details: buildDetails(
        [],
        "No occupancy-related sensors are available for this device.",
        "No occupancy-related sensors are available for this device.",
        payload
      ),
      featuresUsed: [],
    });
  } else if (mlError || !occupancyResp) {
    evaluations.push(
      heuristicsByKey.occupancy ||
      evaluateHeuristic(
        payload,
        issues,
        "Estimated from available occupancy readings."
      )[0]
    );
  } else {
    const nEstimate = occupancyResp.n_estimate !== undefined ? occupancyResp.n_estimate : 0;
    const roundedEstimate = Math.round(nEstimate);
    const minCount = Math.max(0, roundedEstimate - 2);
    const maxCount = roundedEstimate + 2;
    const countRange = `${minCount}-${maxCount}`;

    const details = buildDetails(
      issues.occupancy,
      "Occupancy indicators are within expected range.",
      null,
      payload
    );
    evaluations.push({
      key: "occupancy",
      title: TITLES.occupancy,
      status: occupancyStatusFromModel(
        occupancyResp.occupied,
        occupancyResp.confidence ?? 0
      ),
      score: Number((occupancyResp.confidence ?? 0).toFixed(2)),
      confidence: Number((occupancyResp.confidence ?? 0).toFixed(2)),
      countRange: countRange, // Pass the calculated range
      inputs: { ...payload },
      raw: occupancyResp,
      details,
      featuresUsed: occupancyFeatures,
    });
  }

  if (!needsHealth) {
    evaluations.push({
      key: "healthIndex",
      title: TITLES.healthIndex,
      status: "Unknown",
      score: null,
      confidence: 0,
      inputs: { ...payload },
      raw: null,
      details: buildDetails(
        [],
        "No environmental quality sensors are available for this device.",
        "No environmental quality sensors are available for this device.",
        payload
      ),
      featuresUsed: [],
    });
  } else if (!USE_ML_HEALTH || mlError || !healthResp) {
    evaluations.push(
      heuristicsByKey.healthIndex ||
      evaluateHeuristic(
        payload,
        issues,
        "Estimated using MDPI IAQ formula."
      )[1]
    );
  } else {
    const details = buildDetails(
      issues.health,
      "Air quality metrics are within the expected range.",
      null,
      payload
    );
    evaluations.push({
      key: "healthIndex",
      title: TITLES.healthIndex,
      status: healthStatusFromModel(healthResp.health_index ?? 0),
      score: Number((healthResp.health_index ?? 0).toFixed(1)),
      confidence: Number(
        clamp((healthResp.health_index ?? 0) / 100, 0, 1).toFixed(2)
      ),
      inputs: { ...payload },
      raw: healthResp,
      details,
      featuresUsed: healthFeatures,
    });
  }

  if (!needsSmoke) {
    evaluations.push({
      key: "smokeDetection",
      title: TITLES.smokeDetection,
      status: "Unknown",
      score: null,
      confidence: 0,
      inputs: { ...payload },
      raw: null,
      details: buildDetails(
        [],
        "No particulate or VOC sensors are available for this device.",
        "No smoke-detection sensors are available for this device.",
        payload
      ),
      featuresUsed: [],
    });
  } else if (mlError || !smokeResp) {
    evaluations.push(
      heuristicsByKey.smokeDetection ||
      evaluateHeuristic(
        payload,
        issues,
        "Estimated from available particulate readings."
      )[2]
    );
  } else {
    const details = buildDetails(
      issues.smoke,
      "No smoke indicators detected.",
      null,
      payload
    );
    evaluations.push({
      key: "smokeDetection",
      title: TITLES.smokeDetection,
      status: smokeStatusFromModel(
        smokeResp.smoke_present,
        smokeResp.confidence ?? 0
      ),
      score: Number((smokeResp.confidence ?? 0).toFixed(2)),
      confidence: Number((smokeResp.confidence ?? 0).toFixed(2)),
      inputs: { ...payload },
      raw: smokeResp,
      details,
      featuresUsed: smokeFeatures,
    });
  }

  const applyDeviceOverrides = (baseEvaluations) => {
    // Devices where smoke/fire alerts should be hidden entirely
    const removeSmokeFor = [
      "urn:ngsi-ld:AirQualitySensor:GMW87:001",
      "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:003",
    ];
    if (removeSmokeFor.includes(device.id)) {
      return baseEvaluations.filter(
        (evaluation) => evaluation.key !== "smokeDetection"
      );
    }

    const updated = [...baseEvaluations];
    const smokeIdx = updated.findIndex(
      (evaluation) => evaluation.key === "smokeDetection"
    );

    if (smokeIdx === -1) {
      return updated;
    }

    // Apply specific overrides based on device ID
    if (device.id === "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002") {
      // 3D Printer
      const smokeEval = updated[smokeIdx];
      const pmSpike =
        (isNumeric(payload.pm1) && payload.pm1 >= 50) ||
        (isNumeric(payload.pm25) && payload.pm25 >= 75) ||
        (isNumeric(payload.pm10) && payload.pm10 >= 150);
      const printingDetected = pmSpike;

      const printingScoreParts = [];
      if (isNumeric(payload.pm1)) printingScoreParts.push(clamp(payload.pm1 / 100, 0, 1));
      if (isNumeric(payload.pm25)) printingScoreParts.push(clamp(payload.pm25 / 150, 0, 1));
      if (isNumeric(payload.pm10)) printingScoreParts.push(clamp(payload.pm10 / 200, 0, 1));
      if (smokeEval.score !== null && smokeEval.score !== undefined) {
        printingScoreParts.push(clamp(smokeEval.score, 0, 1));
      }
      const printingScore =
        printingScoreParts.length === 0
          ? 0
          : Number(Math.max(...printingScoreParts).toFixed(2));

      updated[smokeIdx] = {
        ...smokeEval,
        title: "3D Printing Emissions",
        status: printingDetected ? "3D printing in process" : "Normal",
        score: printingDetected ? printingScore || 0.1 : 0,
        details: {
          recommendation: printingDetected
            ? "3D printing likely—keep ventilation running to clear particulates."
            : "Particulate levels are normal near the 3D printers.",
          tooltip: printingDetected
            ? "Particulate spike consistent with 3D printing activity."
            : "No particulate flare-ups detected.",
        },
      };

      // Update Health Index for 3D Printer
      const healthIdx = updated.findIndex(
        (evaluation) => evaluation.key === "healthIndex"
      );
      if (healthIdx !== -1 && printingDetected) {
        updated[healthIdx] = {
          ...updated[healthIdx],
          details: {
            ...updated[healthIdx].details,
            recommendation: "Air quality affected by 3D printing emissions. Check ventilation.",
          },
        };
      }
    } else if (device.id === "urn:ngsi-ld:AirQualitySensor:GMW87:002") {
      // Welding Station
      const smokeEval = updated[smokeIdx];
      const tempRise =
        isNumeric(deltas.temp_c) && deltas.temp_c >= 2 ? deltas.temp_c : null;
      const co2Rise =
        isNumeric(deltas.co2) && deltas.co2 >= 150 ? deltas.co2 : null;
      const particulateRise =
        (isNumeric(payload.pm25) && payload.pm25 >= 35) ||
        (isNumeric(payload.pm10) && payload.pm10 >= 50);

      const smokeSignal =
        smokeEval.status &&
        !["Normal", "Unknown"].includes(smokeEval.status || "");

      const weldingDetected =
        Boolean(tempRise) || Boolean(co2Rise) || particulateRise || smokeSignal;

      const weldingScoreParts = [];
      if (tempRise) weldingScoreParts.push(clamp(tempRise / 5, 0, 1));
      if (co2Rise) weldingScoreParts.push(clamp(co2Rise / 500, 0, 1));
      if (isNumeric(payload.pm25)) weldingScoreParts.push(clamp(payload.pm25 / 150, 0, 1));
      if (isNumeric(payload.pm10)) weldingScoreParts.push(clamp(payload.pm10 / 200, 0, 1));
      if (smokeEval.score !== null && smokeEval.score !== undefined) {
        weldingScoreParts.push(clamp(smokeEval.score, 0, 1));
      }
      const weldingScore =
        weldingScoreParts.length === 0
          ? 0
          : Number(Math.max(...weldingScoreParts).toFixed(2));

      const reasons = [];
      if (tempRise) reasons.push(`sudden temperature rise of ${tempRise.toFixed(1)}°C`);
      if (co2Rise) reasons.push(`CO₂ spike of ${co2Rise.toFixed(0)} ppm`);
      if (particulateRise) reasons.push("elevated particulates near weld bay");
      if (smokeSignal) reasons.push("existing smoke alarm signal");

      updated[smokeIdx] = {
        ...smokeEval,
        title: "Welding Activity",
        status: weldingDetected ? "Welding in process" : "Idle",
        score: weldingScore,
        details: {
          recommendation: weldingDetected
            ? "Welding detected—ensure fume extraction and PPE."
            : "No welding indicators detected.",
          tooltip:
            weldingDetected && reasons.length
              ? `Welding indicators: ${reasons.join(", ")}`
              : "No welding indicators detected.",
        },
      };
    } else if (device.id === "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:002") {
      // Duplicate block removed
    }

    return updated;
  };

  let finalEvaluations = applyDeviceOverrides(evaluations);

  // Filter out generic "Smoke" use case unless it was renamed (i.e., it is a specific device)
  finalEvaluations = finalEvaluations.filter(item => {
    if (item.key === "smoke") {
      // Keep it only if it's NOT the generic title
      return item.title !== TITLES.smokeDetection;
    }
    return true;
  });

  return {
    generatedAt: new Date().toISOString(),
    evaluations: finalEvaluations,
    model: mlError ? "heuristic" : "ml_service",
    fallback: Boolean(mlError),
    inputs: payload,
  };
};

module.exports = { evaluateDevice };
