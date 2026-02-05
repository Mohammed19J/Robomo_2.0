const mongoose = require("mongoose");

const DEFAULT_URI =
  "mongodb+srv://amal:amal123@cluster0.jtld3y8.mongodb.net/?appName=Cluster0";
const DEFAULT_DB_NAME = "RoboMo2";

let connectionPromise = null;
let isDatabaseConnected = false;

mongoose.connection.on("connected", () => {
  isDatabaseConnected = true;
  console.log("MongoDB connection established.");
});

mongoose.connection.on("disconnected", () => {
  isDatabaseConnected = false;
  console.warn("MongoDB connection lost.");
});

mongoose.connection.on("error", (error) => {
  isDatabaseConnected = false;
  console.error("MongoDB connection error:", error.message);
});

const connectToDatabase = async () => {
  if (
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    const uri = process.env.MONGODB_URI || DEFAULT_URI;
    const dbName = process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;
    const serverSelectionTimeoutMS = Number(
      process.env.MONGODB_TIMEOUT_MS || 5000
    );

    connectionPromise = mongoose
      .connect(uri, {
        dbName,
        serverSelectionTimeoutMS,
      })
      .then((conn) => {
        isDatabaseConnected = true;
        console.log(
          `Connected to MongoDB database "${conn.connection.db.databaseName}"`
        );
        return conn;
      })
      .catch((error) => {
        connectionPromise = null;
        isDatabaseConnected = false;
        console.error("Failed to connect to MongoDB:", error.message);
        throw error;
      });
  }

  return connectionPromise;
};

const ensureDatabaseConnection = async () => {
  try {
    await connectToDatabase();
  } catch (_error) {
    return false;
  }

  return mongoose.connection.readyState === 1;
};

const hasActiveConnection = () => isDatabaseConnected;

module.exports = {
  connectToDatabase,
  ensureDatabaseConnection,
  hasActiveConnection,
};
