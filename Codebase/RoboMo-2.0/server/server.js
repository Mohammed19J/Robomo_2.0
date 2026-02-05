const http = require("http");
const https = require("https");
const express = require("express");
const fs = require("fs");
const socketIo = require("socket.io");
const corsAnywhere = require("cors-anywhere");
const app = express();
const cors = require("cors");
const mongoose = require("mongoose");

const DEBUG_LOGS = process.env.DEBUG_LOGS === "true"; // Only log if explicitly enabled
const debugLog = (...args) => {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
};

// Memory monitoring to prevent heap overflow
const MEMORY_CHECK_INTERVAL_MS = 60000; // Check every minute
const MEMORY_WARNING_THRESHOLD_MB = 1500; // Warn at 1.5GB
const MEMORY_CRITICAL_THRESHOLD_MB = 1800; // Critical at 1.8GB

const checkMemoryUsage = () => {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / (1024 * 1024);
  const heapTotalMB = usage.heapTotal / (1024 * 1024);

  if (heapUsedMB > MEMORY_CRITICAL_THRESHOLD_MB) {
    console.warn(`⚠️ CRITICAL: Memory usage is very high: ${heapUsedMB.toFixed(2)} MB / ${heapTotalMB.toFixed(2)} MB`);
    console.warn(`⚠️ Consider restarting the server or reducing the refresh rate.`);

    // Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      console.log("Running garbage collection...");
      global.gc();
    }
  } else if (heapUsedMB > MEMORY_WARNING_THRESHOLD_MB) {
    console.warn(`⚠️ WARNING: Memory usage is high: ${heapUsedMB.toFixed(2)} MB / ${heapTotalMB.toFixed(2)} MB`);
  }

  debugLog(`Memory: ${heapUsedMB.toFixed(2)} MB / ${heapTotalMB.toFixed(2)} MB`);
};

// Start memory monitoring
const memoryMonitorInterval = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);

const { formatDate } = require("./Utils/formatDate");
const {
  fetchFilteredGraphData,
  fetchDevices,
  calculateAndEmitSpeed,
  setDataCollectionEnabled,
  getDataCollectionEnabled,
  getDisabledDevices,
  toggleDeviceEnabled,
} = require("./DataHandlers/dataHandlers");
const { connectToDatabase } = require("./Database/connect");

const DEFAULT_REFRESH_INTERVAL =
  Number(process.env.DEVICE_REFRESH_INTERVAL_MS) || 1000;

const SSL_KEY_PATH =
  process.env.SSL_KEY_PATH ||
  "/etc/letsencrypt/live/robomo.hopto.org/privkey.pem";
const SSL_CERT_PATH =
  process.env.SSL_CERT_PATH ||
  "/etc/letsencrypt/live/robomo.hopto.org/fullchain.pem";

let isHttps = false;
let httpServer = null;

// Load SSL certificates for HTTPS if available, otherwise fall back to HTTP
if (fs.existsSync(SSL_KEY_PATH) && fs.existsSync(SSL_CERT_PATH)) {
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY_PATH),
    cert: fs.readFileSync(SSL_CERT_PATH),
  };
  httpServer = https.createServer(sslOptions, app);
  isHttps = true;
  // HTTPS enabled - silent mode
} else {
  // HTTP mode - silent mode
  httpServer = http.createServer(app);
}
let connectedClients = 0;

// Set up socket.io with HTTPS and CORS
const io = socketIo(httpServer, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost",
      "http://127.0.0.1",
      "http://188.166.160.243:3000",
      "http://188.166.160.243",
      "http://robomo2.duckdns.org:3000",
      "http://robomo2.duckdns.org",
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "fiware-service",
      "fiware-servicepath",
      "Link",
      "Accept",
    ],
  },
  transports: ["websocket"],
  path: "/socket.io/",
});

// Enable CORS for all origins on Express
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost",
      "http://127.0.0.1",
      "http://188.166.160.243:3000",
      "http://188.166.160.243",
      "http://robomo2.duckdns.org:3000",
      "http://robomo2.duckdns.org",
    ],
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "fiware-service",
      "fiware-servicepath",
      "Link",
      "Accept",
    ],
  })
);

// Enable JSON parsing
app.use(express.json());

// Auth Routes
const authRoutes = require('./Routes/authRoutes');
app.use('/api/auth', authRoutes);
io.on("connection", (socket) => {
  connectedClients++;
  debugLog(`Number of clients: ${connectedClients}`);
  debugLog(`New client connected: ${socket.id}`);
  io.emit("clientConnected", connectedClients);

  // User info object
  const userInfo = {
    userID: socket.id,
    userNumber: connectedClients,
    timeConnected: formatDate(new Date()),
  };
  socket.emit("userInfo", userInfo);

  // Send current data collection status
  socket.emit("dataCollectionStatus", getDataCollectionEnabled());

  let currentUseCaseValue = "All"; // Store current useCaseValue
  let refreshInterval = DEFAULT_REFRESH_INTERVAL;
  let fetchDevicesInterval = null;
  let speedCalculationInterval = null;
  // let userInfoInterval = null;

  // Handle selected device data requests
  socket.on("selectedDeviceData", (data) => {
    // console out with socket.id
    debugLog(`Selected Device Data received from ${socket.id}:`, data);
    socket.emit("selectedDeviceData", data);
  });

  // Handle pinned attribute data requests
  socket.on("pinAttribute", (data) => {
    debugLog(`Pinned attribute data received from ${socket.id}:`, data);
    socket.emit("pinnedAttribute", data);
  });

  // Handle use case data requests
  socket.on("useCaseData", (data) => {
    debugLog(`Received use case from ${socket.id}:`, data.useCaseValue);
    currentUseCaseValue = data.useCaseValue;
    fetchDevices(socket, currentUseCaseValue);
  });

  // Handle refresh interval requests
  socket.on("refreshInterval", (data) => {
    debugLog(`Received refresh interval from ${socket.id}:`, data);
    // Clear existing intervals safely
    if (fetchDevicesInterval) {
      clearInterval(fetchDevicesInterval);
      fetchDevicesInterval = null;
    }
    if (speedCalculationInterval) {
      clearInterval(speedCalculationInterval);
      speedCalculationInterval = null;
    }
    const newInterval =
      Number(data.refreshInterval) || DEFAULT_REFRESH_INTERVAL;
    refreshInterval = newInterval;
    fetchDevicesInterval = setInterval(() => {
      fetchDevices(socket, currentUseCaseValue);
    }, refreshInterval);
    speedCalculationInterval = setInterval(() => {
      calculateAndEmitSpeed(socket, refreshInterval);
    }, refreshInterval);
  });

  // Handle data collection toggle
  socket.on("toggleDataCollection", (enabled) => {
    debugLog(`Received toggleDataCollection from ${socket.id}:`, enabled);
    setDataCollectionEnabled(enabled);
    // Broadcast new status to all clients
    io.emit("dataCollectionStatus", getDataCollectionEnabled());
  });

  // Handle device enable/disable toggle
  socket.on("toggleDeviceEnabled", (deviceId) => {
    debugLog(`Received toggleDeviceEnabled from ${socket.id}:`, deviceId);
    toggleDeviceEnabled(deviceId);
    // Broadcast updated disabled devices list to all clients
    io.emit("disabledDevices", getDisabledDevices());
  });

  // Handle request for disabled devices list
  socket.on("getDisabledDevices", () => {
    socket.emit("disabledDevices", getDisabledDevices());
  });

  // Handle graph filter data requests
  socket.on(
    "graphFilterData",
    async ({
      deviceID,
      deviceType,
      attributeKey,
      startDateTime,
      endDateTime,
      lastX,
      color,
    }) => {
      console.log(`[GraphFilter] Received filter data from ${socket.id}:`, {
        deviceID,
        deviceType,
        attributeKey,
        startDateTime,
        endDateTime,
        lastX,
        color,
      });

      try {
        const readings = await fetchFilteredGraphData(
          deviceID,
          deviceType,
          new Date(startDateTime),
          new Date(endDateTime),
          lastX
        );

        console.log(`[GraphFilter] Found ${readings.length} readings from MongoDB`);

        const mappedValues = readings
          .map((reading) => {
            const rawAttr = reading.payload && reading.payload[attributeKey];
            // Handle structured Property (value/type/observedAt) or direct value
            const val =
              rawAttr && typeof rawAttr === "object" && "value" in rawAttr
                ? rawAttr.value
                : rawAttr;

            if (val === undefined || val === null) return null;

            return {
              value: val,
              timestamp: reading.receivedAt,
            };
          })
          .filter((item) => item !== null);

        console.log(`[GraphFilter] Mapped ${mappedValues.length} values for attribute "${attributeKey}"`);

        const requestedData = {
          values: mappedValues,
          created: formatDate(new Date()),
          deviceID: deviceID,
          attributeKey: attributeKey,
          lastX: lastX,
          color: color,
        };

        console.log(`[GraphFilter] Emitting graphFilteredData to client`);
        socket.emit("graphFilteredData", requestedData);
      } catch (error) {
        console.error("[GraphFilter] Error fetching filtered graph data:", error.message);
        socket.emit("error", { message: "Failed to generate graph data on server." });
      }
    }
  );

  // --- Saved Graph Handlers ---

  socket.on("saveUserGraph", async (graphData) => {
    try {
      // Expecting graphData to contain: userId, deviceID, deviceType, attributeKey, etc.
      // If userId is missing in the payload, we might need it from the client
      if (!graphData.userId) {
        console.error("Cannot save graph: Missing userId");
        return;
      }
      const SavedGraph = require("./Models/SavedGraph");
      const newGraph = new SavedGraph(graphData);
      const savedDoc = await newGraph.save();
      debugLog(`Saved graph for user ${graphData.userId}: ${savedDoc._id}`);

      // Emit back success or the stored document (optional pattern)
      socket.emit("graphSaved", { success: true, id: savedDoc._id, ...graphData });
    } catch (err) {
      console.error("Error saving user graph:", err.message);
      socket.emit("error", { message: "Failed to save graph" });
    }
  });

  socket.on("getUserGraphs", async ({ userId, deviceID, attributeKey }) => {
    try {
      if (!userId) return;
      const SavedGraph = require("./Models/SavedGraph");

      // Build query - filter by user and optionally by device/attribute
      const query = { userId };
      if (deviceID) query.deviceID = deviceID;
      if (attributeKey) query.attributeKey = attributeKey;

      const graphs = await SavedGraph.find(query).sort({ createdAt: -1 });
      socket.emit("userGraphsRetrieved", graphs);
    } catch (err) {
      console.error("Error retrieving user graphs:", err.message);
      socket.emit("error", { message: "Failed to retrieve graphs" });
    }
  });

  socket.on("deleteUserGraph", async ({ graphId, userId }) => {
    try {
      const SavedGraph = require("./Models/SavedGraph");
      // Ensure we only delete if it belongs to the user
      const result = await SavedGraph.deleteOne({ _id: graphId, userId });
      if (result.deletedCount > 0) {
        debugLog(`Deleted graph ${graphId} for user ${userId}`);
        socket.emit("userGraphDeleted", { graphId });
      } else {
        console.warn(`Graph ${graphId} not found or permission denied`);
      }
    } catch (err) {
      console.error("Error deleting user graph:", err.message);
    }
  });

  // Interval for fetching devices
  fetchDevicesInterval = setInterval(() => {
    fetchDevices(socket, currentUseCaseValue);
  }, refreshInterval);

  // Interval for calculating and emitting speed
  speedCalculationInterval = setInterval(() => {
    calculateAndEmitSpeed(socket, refreshInterval);
  }, refreshInterval);

  // userInfoInterval = setInterval(() => {
  //   socket.emit("userInfo", userInfo);
  // }, 60000);

  socket.on("disconnect", () => {
    // CRITICAL: Clear intervals to prevent memory leaks
    if (fetchDevicesInterval) {
      clearInterval(fetchDevicesInterval);
      fetchDevicesInterval = null;
    }
    if (speedCalculationInterval) {
      clearInterval(speedCalculationInterval);
      speedCalculationInterval = null;
    }

    connectedClients--;
    debugLog(`Number of clients: ${connectedClients}`);
    io.emit("clientDisconnected", connectedClients);
    debugLog(`Client disconnected: ${socket.id}`);

    // Remove all event listeners to prevent memory leaks
    socket.removeAllListeners();
  });
});

// Set up CORS Anywhere for proxied requests
const corsProxy = corsAnywhere.createServer({
  originWhitelist: [], // Allow all origins
  requireHeader: [],
  removeHeaders: [],
});

// CORS proxy route
app.use("/cors-anywhere", (req, res) => {
  corsProxy.emit("request", req, res);
});

// Basic health endpoint to confirm the server is running
app.get("/", (_req, res) => {
  res.send("Server is running");
});

// Start the HTTPS server
const hasExplicitPort = Boolean(process.env.PORT);
const DEFAULT_PORT = Number(process.env.PORT) || 5000;
let currentPort = DEFAULT_PORT;

const startServer = (port) => {
  httpServer.listen(port, "0.0.0.0", () => {
    const protocol = isHttps ? "https" : "http";
    console.log(`Server running on ${protocol}://localhost:${port}`);
  });
};

httpServer.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    if (!hasExplicitPort) {
      currentPort += 1;
      startServer(currentPort);
    } else {
      console.error(`Port ${currentPort} is already in use.`);
      process.exit(1);
    }
  } else {
    throw error;
  }
});

httpServer.on("listening", () => {
  process.env.ACTIVE_SERVER_PORT = String(currentPort);
  process.env.CORS_PROXY_PORT = String(currentPort);
  if (!hasExplicitPort) {
    process.env.PORT = String(currentPort);
  }
});

const initializeServer = async () => {
  try {
    await connectToDatabase();
  } catch (error) {
    // Silent fail - continue without MongoDB
  } finally {
    startServer(currentPort);
  }
};

initializeServer();

// Graceful Shutdown Handler
const shutdown = () => {
  console.log("Shutting down gracefully...");

  // Clear memory monitoring interval
  if (memoryMonitorInterval) {
    clearInterval(memoryMonitorInterval);
  }

  const closeHttpServer = () => {
    httpServer.close(() => {
      process.exit(0);
    });
  };

  io.close(() => {
    if (
      mongoose.connection.readyState === 1 ||
      mongoose.connection.readyState === 2
    ) {
      mongoose.connection
        .close()
        .then(() => {
          closeHttpServer();
        })
        .catch(() => {
          closeHttpServer();
        });
    } else {
      closeHttpServer();
    }
  });
};

// Handle termination signals
process.on("SIGINT", shutdown); // For Ctrl+C
process.on("SIGTERM", shutdown); // For system termination signals
