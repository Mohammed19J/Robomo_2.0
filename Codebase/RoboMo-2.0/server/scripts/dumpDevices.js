#!/usr/bin/env node
/**
 * Dump the current device list the server would broadcast to clients.
 *
 * Usage:
 *   node server/scripts/dumpDevices.js [useCaseValue]
 *
 * The optional argument filters by the same "Use Case" value the UI uses.
 */

const path = require("path");
const suppressPatterns = [
  /^=== DEVICE DEBUG ===/,
  /^Device ID:/,
  /^Device keys:/,
  /^Full device structure:/,
  /^==================$/,
  /^Extracting value/,
  /^No value found/,
  /^Extracted values for device/,
  /^Found attribute/,
  /^Extracted numeric value/,
  /^Exact match/,
  /^Found in normalized keys/,
  /^Device data refreshed/,
  /^Partial match/,
];
const originalLog = console.log;
console.log = (...args) => {
  const first = args[0];
  if (typeof first === "string") {
    if (suppressPatterns.some((pattern) => pattern.test(first))) {
      return;
    }
  }
  originalLog.apply(console, args);
};

const { fetchDevices } = require("../DataHandlers/dataHandlers");

const useCaseValue = process.argv[2] || "All";
const collected = { devices: null, useCases: null };

const socketStub = {
  id: "dump-script",
  emit(event, payload) {
    if (event === "useCaseValues") {
      collected.useCases = payload;
    }
    if (event === "devices") {
      collected.devices = payload;
    }
  },
};

const main = async () => {
    try {
      await fetchDevices(socketStub, useCaseValue);
      if (!collected.devices) {
        console.error("No device payload received.");
        process.exit(1);
      }
      const slimDevices = collected.devices.map((device) => ({
        id: device.id,
        type: device.type,
        name: device?.name?.value ?? device?.EntityType?.value ?? null,
        useCase:
          device?.useCases?.value ??
          device?.useCases?.value ??
          device?.useCases ??
          null,
      }));
      const snapshot = {
        useCaseValue,
        availableUseCases: collected.useCases,
        deviceCount: slimDevices.length,
        devices: slimDevices,
      };
      console.log(JSON.stringify(snapshot, null, 2));
    } catch (error) {
      console.error("Failed to fetch devices:", error.message);
      process.exit(1);
    }
};

main();
