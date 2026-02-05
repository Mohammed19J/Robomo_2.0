const axios = require("axios");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { evaluateDevice } = require("../UseCaseEngine/predictor");
const SensorReading = require("../Models/SensorReading");
const {
  ensureDatabaseConnection,
  hasActiveConnection,
} = require("../Database/connect");

const isVerboseLogging = process.env.DEBUG_LOGS === "true";
const debugLog = (...args) => {
  if (isVerboseLogging) {
    console.log(...args);
  }
};

let cachedData = null;
let totalDataSent = 0; // Track total data sent for speed calculation
const USE_MOCK_DATA = process.env.USE_MOCK_DATA === "true";
const SENSOR_PERSIST_INTERVAL_MS =
  Number(process.env.SENSOR_PERSIST_INTERVAL_MS) || 60000;

let isDataCollectionEnabled = false; // Default to OFF

const setDataCollectionEnabled = (enabled) => {
  isDataCollectionEnabled = !!enabled;
  debugLog(`Data collection set to: ${isDataCollectionEnabled}`);
};

const getDataCollectionEnabled = () => {
  return isDataCollectionEnabled;
};

// Disabled devices management
let disabledDevices = new Set();

// Permanently excluded devices - these will NEVER have data collected
const PERMANENTLY_EXCLUDED_DEVICES = new Set([
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:016",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:006",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:013",
  "urn:ngsi-ld:AirQualitySensor:Sen5X_SCD41:005",
]);

const toggleDeviceEnabled = (deviceId) => {
  if (disabledDevices.has(deviceId)) {
    disabledDevices.delete(deviceId);
    debugLog(`Device ${deviceId} enabled`);
  } else {
    disabledDevices.add(deviceId);
    debugLog(`Device ${deviceId} disabled`);
  }
};

const getDisabledDevices = () => {
  return Array.from(disabledDevices);
};

const isDeviceDisabled = (deviceId) => {
  // Check both permanent blacklist and user-disabled devices
  return PERMANENTLY_EXCLUDED_DEVICES.has(deviceId) || disabledDevices.has(deviceId);
};

let mockDevices = null;
const getMockDevices = () => {
  if (mockDevices) {
    return mockDevices;
  }
  const mockPath = path.join(__dirname, "mockData", "devices.json");
  try {
    const raw = fs.readFileSync(mockPath, "utf8");
    mockDevices = JSON.parse(raw);
  } catch (err) {
    debugLog(
      "Mock devices file not found or invalid. Falling back to empty list."
    );
    mockDevices = [];
  }
  return mockDevices;
};

const getProxyOrigin = () => {
  if (process.env.CORS_PROXY_ORIGIN) {
    return process.env.CORS_PROXY_ORIGIN;
  }

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const port =
    process.env.CORS_PROXY_PORT ||
    process.env.ACTIVE_SERVER_PORT ||
    process.env.PORT ||
    5000;

  return `${protocol}://localhost:${port}`;
};

// If DIRECT_API_ACCESS is true, skip the CORS proxy and call the API directly
// This is useful when running in Docker with direct VPN access to the sensor network
const DIRECT_API_ACCESS = process.env.DIRECT_API_ACCESS === "true";

const buildProxyUrl = (targetUrl) => {
  if (DIRECT_API_ACCESS) {
    return targetUrl; // Call the API directly
  }
  const base = getProxyOrigin().replace(/\/+$/, "");
  return `${base}/cors-anywhere/${targetUrl}`;
};

const getAgentOptions = () => {
  const origin = getProxyOrigin();
  if (origin.startsWith("https://")) {
    return { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };
  }
  return { httpAgent: new http.Agent() };
};

// Function to fetch filtered graph data from MongoDB based on filter parameters
const fetchFilteredGraphData = async (
  deviceID,
  deviceType,
  startDateTime,
  endDateTime,
  lastX
) => {
  try {
    debugLog(`Fetching graph data for ${deviceID} (${deviceType}) from MongoDB...`);

    // Query MongoDB for readings within the time range
    const readings = await SensorReading.find({
      deviceId: deviceID,
      receivedAt: {
        $gte: startDateTime,
        $lte: endDateTime,
      },
    })
      .sort({ receivedAt: 1 }) // Chronological order
      .limit(lastX || 1000)
      .lean()
      .exec();

    debugLog(`Found ${readings.length} readings in MongoDB.`);
    return readings;
  } catch (error) {
    console.error("Error fetching filtered graph data from MongoDB:", error.message);
    throw new Error("Failed to fetch filtered graph data.");
  }
};

const fetchDevices = async (socket, currentUseCaseValue) => {
  if (USE_MOCK_DATA) {
    const mockData = getMockDevices();
    const useCases = mockData
      .map((device) => device.useCases)
      .filter((useCase) => useCase !== undefined);
    const useCaseValues = Array.from(
      new Set(useCases.map((useCase) => useCase.value))
    );
    useCaseValues.unshift("All");
    socket.emit("useCaseValues", useCaseValues);

    let filteredData = mockData;
    if (currentUseCaseValue !== "All") {
      filteredData = mockData.filter(
        (device) =>
          device.useCases && device.useCases.value === currentUseCaseValue
      );
    }

    const enrichedData = await Promise.all(
      filteredData.map(async (device) => ({
        ...device,
        useCaseEvaluations: await evaluateDevice(device),
      }))
    );

    cachedData = enrichedData;

    const payloadBytes = Buffer.byteLength(
      JSON.stringify(enrichedData),
      "utf8"
    );
    totalDataSent += payloadBytes;
    socket.emit("devices", enrichedData);

    await persistSensorSnapshots(enrichedData);
    return;
  }

  try {
    // API URL (using the CORS proxy)
    const API_URL =
      "http://172.16.101.172:1026/ngsi-ld/v1/entities/?local=true";

    const { httpsAgent, httpAgent } = getAgentOptions();
    const response = await axios.get(buildProxyUrl(API_URL), {
      httpsAgent,
      httpAgent,
      headers: {
        Accept: "application/json",
        Link: '<http://context/ngsi-context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
        "X-Requested-With": "XMLHttpRequest", // Add this header
        "fiware-service": "openiot",
        "fiware-servicepath": "/",
      },
      timeout: 30000, // Set timeout to 10 seconds
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // Extract the useCases attribute from the response data
    const useCases = response.data
      .map((device) => device.useCases)
      .filter((useCase) => useCase !== undefined);
    const useCaseValues = Array.from(
      new Set(useCases.map((useCase) => useCase.value))
    );
    useCaseValues.unshift("All");
    socket.emit("useCaseValues", useCaseValues);

    // Filter devices based on the useCases attribute
    let filteredData = response.data;
    if (currentUseCaseValue !== "All") {
      filteredData = response.data.filter(
        (device) =>
          device.useCases && device.useCases.value === currentUseCaseValue
      );
    }

    const enrichedData = await Promise.all(
      filteredData.map(async (device) => ({
        ...device,
        useCaseEvaluations: await evaluateDevice(device),
      }))
    );

    // Cache the filtered data
    cachedData = enrichedData;

    const payloadBytes = Buffer.byteLength(
      JSON.stringify(enrichedData),
      "utf8"
    );
    totalDataSent += payloadBytes; // Increment total data sent

    socket.emit("devices", enrichedData); // Broadcast the data to all connected clients
    debugLog(
      "Device data refreshed from external API.",
      filteredData.length
    );

    await persistSensorSnapshots(enrichedData);
  } catch (error) {
    console.error("Error fetching data from external API:", {
      message: error.message,
      config: error.config,
      code: error.code,
      response: error.response
        ? {
          status: error.response.status,
          headers: error.response.headers,
          data: error.response.data,
        }
        : "No response",
    });

    if (cachedData) {
      socket.emit("devices", cachedData);
    } else {
      const timedOut =
        error.code === "ETIMEDOUT" ||
        (error.response && `${error.response.data}`.includes("ETIMEDOUT"));
      const refused = error.code === "ECONNREFUSED";
      if (timedOut || refused) {
        const fallback = getMockDevices();
        if (fallback.length > 0) {
          debugLog(
            "Using mock device data because the external API is unreachable."
          );
          const enrichedFallback = await Promise.all(
            fallback.map(async (device) => ({
              ...device,
              useCaseEvaluations: await evaluateDevice(device),
            }))
          );
          cachedData = enrichedFallback;
          socket.emit("devices", enrichedFallback);
          await persistSensorSnapshots(enrichedFallback);
          return;
        }
      }
      socket.emit("devices", []);
    }
  }
};

// Function to calculate and emit transfer speed
const calculateAndEmitSpeed = (socket, intervalMs = 60000) => {
  const seconds = Math.max(intervalMs / 1000, 1);
  const transferSpeed = totalDataSent / seconds; // Average bytes per second
  socket.emit("transferSpeed", transferSpeed);
  totalDataSent = 0; // Reset total data sent
};

const hasMeaningfulData = (device) => {
  const evaluations = device?.useCaseEvaluations?.evaluations;
  if (Array.isArray(evaluations) && evaluations.length > 0) {
    for (const evaluation of evaluations) {
      const inputs = evaluation?.inputs;
      if (!inputs || typeof inputs !== "object") {
        continue;
      }
      const hasValue = Object.entries(inputs).some(
        ([key, value]) =>
          !["timestamp", "device_id"].includes(key) &&
          value !== null &&
          value !== undefined &&
          !(typeof value === "number" && Number.isNaN(value))
      );
      if (hasValue) {
        return true;
      }
    }
    return false;
  }

  // Fall back to checking top-level NGSI attributes
  if (device && typeof device === "object") {
    return Object.values(device).some((attribute) => {
      if (!attribute || typeof attribute !== "object") {
        return false;
      }
      if ("value" in attribute) {
        const { value } = attribute;
        return (
          value !== null &&
          value !== undefined &&
          !(typeof value === "number" && Number.isNaN(value))
        );
      }
      return false;
    });
  }

  return false;
};

let hasCleanedEmptyReadings = false;
let isCleaning = false;
let lastPersistTimestamp = 0;
let isPersisting = false;

const cleanupEmptySensorReadings = async () => {
  if (hasCleanedEmptyReadings || isCleaning) {
    return;
  }
  isCleaning = true;
  debugLog("Starting cleanup of empty sensor readings...");

  try {
    // CRITICAL FIX: Only query recent readings to prevent memory overflow
    // Limit to last 7 days and process in batches
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const BATCH_SIZE = 1000;
    let totalDeleted = 0;
    let lastId = null; // Cursor for pagination

    // Process in batches to avoid loading everything into memory
    let hasMore = true;
    while (hasMore) {
      const query = { receivedAt: { $gte: sevenDaysAgo } };
      if (lastId) {
        query._id = { $gt: lastId };
      }

      const readings = await SensorReading.find(
        query,
        { _id: 1, payload: 1 }
      )
        .sort({ _id: 1 }) // Ensure stable sort order
        .limit(BATCH_SIZE)
        .lean()
        .exec();

      if (readings.length === 0) {
        hasMore = false;
        break;
      }

      // Update cursor
      lastId = readings[readings.length - 1]._id;

      const idsToDelete = readings
        .filter((reading) => !hasMeaningfulData(reading?.payload))
        .map((reading) => reading._id);

      if (idsToDelete.length > 0) {
        await SensorReading.deleteMany({ _id: { $in: idsToDelete } });
        totalDeleted += idsToDelete.length;
      }

      // If we got fewer than BATCH_SIZE, we're done
      if (readings.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    if (totalDeleted > 0) {
      debugLog(
        `Removed ${totalDeleted} sensor snapshot(s) with only null metrics.`
      );
    }
  } catch (error) {
    console.error(
      "Failed to clean up sensor snapshots with only null metrics:",
      error.message
    );
  } finally {
    hasCleanedEmptyReadings = true;
    isCleaning = false;
    debugLog("Cleanup of empty sensor readings finished.");
  }
};

const persistSensorSnapshots = async (devices) => {
  if (!isDataCollectionEnabled) {
    return;
  }

  if (isPersisting) {
    // debugLog("Skipping persistence: Previous persistence still in progress.");
    return;
  }

  if (!Array.isArray(devices) || devices.length === 0) {
    return;
  }

  const now = Date.now();
  if (now - lastPersistTimestamp < SENSOR_PERSIST_INTERVAL_MS) {
    return;
  }

  isPersisting = true;

  try {
    if (!hasActiveConnection()) {
      const connected = await ensureDatabaseConnection();
      if (!connected) {
        debugLog(
          "Skipping sensor persistence because MongoDB is not reachable right now."
        );
        return;
      }
    }

    // Fire and forget cleanup - don't block persistence
    cleanupEmptySensorReadings().catch(err => console.error("Cleanup error:", err));

    const receivedAt = new Date();
    const documents = devices
      .filter((device) => device && hasMeaningfulData(device) && !isDeviceDisabled(device.id))
      .map((device) => ({
        deviceId:
          typeof device.id === "string" ? device.id.trim() : device.id ?? null,
        deviceType: device?.type || null,
        payload: device,
        receivedAt,
      }));

    if (documents.length === 0) {
      return;
    }

    lastPersistTimestamp = now;

    const inserted = await SensorReading.insertMany(documents, {
      ordered: false,
    });
    debugLog(`Persisted ${inserted.length} sensor snapshot(s) to MongoDB.`);
  } catch (error) {
    console.error("Failed to persist sensor snapshots:", error.message);
  } finally {
    isPersisting = false;
  }
};

module.exports = {
  fetchFilteredGraphData,
  fetchDevices,
  calculateAndEmitSpeed,
  setDataCollectionEnabled,
  getDataCollectionEnabled,
  getDisabledDevices,
  toggleDeviceEnabled,
};
