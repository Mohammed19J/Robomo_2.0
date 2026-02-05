## Server Setup

The WebSocket server now persists sensor snapshots to MongoDB whenever device data is refreshed from the external FIWARE API.

### Prerequisites

- Install Node dependencies from the `server` directory:
  ```bash
  npm install
  ```
- Ensure the [`mongoose`](https://mongoosejs.com/) dependency is installed (added to `package.json`).

### MongoDB Configuration

- Set `MONGODB_URI` to your connection string. The server falls back to the cluster shared for RoboMo if the variable is not provided.
- Optionally set `MONGODB_DB_NAME` to override the default database name (`robomoSensors`).
- You can adjust the MongoDB server selection timeout via `MONGODB_TIMEOUT_MS` (defaults to 5000 milliseconds).

### Data Storage

- Sensor snapshots are stored in the `sensor_readings` collection.
- Each document tracks the original device payload (`payload`), the device identifier (`deviceId`), device type, and the time the snapshot was received (`receivedAt`).

