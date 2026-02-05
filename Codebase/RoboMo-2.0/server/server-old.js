const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const socketIo = require("socket.io");
const corsAnywhere = require("cors-anywhere");
const axios = require("axios");
const cors = require("cors");

const { formatDate } = require("./Utils/formatDate");
const {
  fetchFilteredGraphData,
  fetchDevices,
  calculateAndEmitSpeed,
} = require("./DataHandlers/dataHandlers");

const app = express();

// Load SSL certificates for HTTPS
const sslOptions = {
  key: fs.readFileSync("key.pem"), // Path to your private key
  cert: fs.readFileSync("cert.pem"), // Path to your certificate
};

// Create an HTTPS agent that trusts the self-signed certificate
const cert = fs.readFileSync("cert.pem"); // Path to your self-signed certificate
const httpsAgent = new https.Agent({
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem"),
  ca: fs.readFileSync("cert.pem"),
  rejectUnauthorized: false, // Ensure certificate is verified
});

// Enable HTTPS for the server
const httpsServer = https.createServer(sslOptions, app);

// Configure socket.io with CORS for HTTPS
const io = socketIo(httpsServer, {
  cors: {
    origin: "https://robomo.onrender.com",
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
  path: "/socket.io/",
  allowEIO3: true, // Ensure compatibility with older clients if needed
  transports: ["websocket"], // Enforce WebSocket transport
});

// Enable CORS for all origins on Express
app.use(
  cors({
    origin: "https://robomo.onrender.com",
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

let currentUseCaseValue = "Braude"; // Store current useCaseValue
let refreshInterval = 5000;
let fetchDevicesInterval = null;
let speedCalculationInterval = null;

// // Fetch devices on server start
// fetchDevices(io, httpsAgent); // Pass the HTTPS agent
fetchDevicesInterval = setInterval(() => {
  fetchDevices(io, currentUseCaseValue, httpsAgent);
}, refreshInterval);
speedCalculationInterval = setInterval(() => {
  calculateAndEmitSpeed(io);
}, refreshInterval);

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("selectedDeviceData", (data) => {
    console.log("Selected Device Data received:", data);
    io.emit("selectedDeviceData", data);
  });

  socket.on("pinAttribute", (data) => {
    console.log("Pinned Attribute Data received:", data);
    io.emit("pinnedAttribute", data);
  });

  socket.on("useCaseData", (data) => {
    console.log("Received use case from client:", data.useCaseValue);
    currentUseCaseValue = data.useCaseValue;
    fetchDevices(io, currentUseCaseValue, httpsAgent); // Pass the HTTPS agent
  });

  socket.on("refreshInterval", (data) => {
    console.log("Received refresh interval from client:", data.refreshInterval);
    clearInterval(fetchDevicesInterval);
    clearInterval(speedCalculationInterval);
    fetchDevicesInterval = setInterval(() => {
      fetchDevices(io, currentUseCaseValue, httpsAgent);
    }, data.refreshInterval);
    speedCalculationInterval = setInterval(() => {
      calculateAndEmitSpeed(io);
    }, data.refreshInterval);
  });

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
      console.log("Received filter data from client:", {
        deviceID,
        deviceType,
        attributeKey,
        startDateTime,
        endDateTime,
        lastX,
        color,
      });

      try {
        const fetchedData = await fetchFilteredGraphData(
          deviceID,
          deviceType,
          new Date(startDateTime),
          new Date(endDateTime),
          lastX,
        );

        const times = fetchedData.index;
        const attributes = fetchedData.attributes;
        const requestedAttribute = attributes.find(
          (attr) => attr.attrName === attributeKey
        );

        const attributeData = requestedAttribute.values;
        const attributeTimes = times;

        const mappedValues = attributeData.map((value, index) => ({
          value,
          timestamp: attributeTimes[index],
        }));

        const requestedData = {
          values: mappedValues,
          created: formatDate(new Date()),
          deviceID: deviceID,
          attributeKey: requestedAttribute.attrName,
          lastX: lastX,
          color: color,
        };

        socket.emit("graphFilteredData", requestedData);
      } catch (error) {
        console.error("Error fetching filtered graph data:", error.message);
        socket.emit("error", {
          message: "Failed to fetch filtered graph data.",
        });
      }
    }
  );

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Start the HTTPS server
const PORT = process.env.PORT || 5000;
httpsServer.listen(PORT, "0.0.0.0", () => {
  console.log("HTTPS server is running on port 5000");
});
