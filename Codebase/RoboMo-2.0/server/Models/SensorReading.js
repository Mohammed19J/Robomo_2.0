const mongoose = require("mongoose");

const collectionName =
  process.env.MONGODB_COLLECTION || "readings";

const sensorReadingSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    deviceType: {
      type: String,
      default: null,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: collectionName,
    minimize: false,
    timestamps: true,
    bufferCommands: false,
  }
);

module.exports =
  mongoose.models.SensorReading ||
  mongoose.model("SensorReading", sensorReadingSchema);
