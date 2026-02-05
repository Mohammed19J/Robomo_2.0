# RoboMo 2.0 - 25-2-D-11

RoboMo 2.0 is a privacy-preserving IoT monitoring system for occupancy estimation and indoor air quality (IAQ) analysis. It aggregates sensor data, computes health indicators, and provides real-time insights through a web dashboard without relying on cameras.

## Main Components

- Backend: Node.js server with WebSocket streaming and device evaluation logic
- ML Service: FastAPI (Python) for occupancy and air-quality inference
- Database: MongoDB for sensor snapshot storage
- Client: React app served by Nginx
- Orchestration: Docker Compose
- Networking: OpenVPN (via Gluetun) for secure access to the external sensor API

## Live Deployment

Hosted system: https://robomo2.duckdns.org/

You can access the system via the hosted deployment or run it locally with Docker Compose.

## Deployment (Docker Compose)

The system is deployed as a multi-container stack. Docker Compose orchestrates the VPN, backend, ML service, database, and client, wiring them together with internal networking and defined dependencies.

## Build and Installation

Local build and run (Docker Compose):

```bash
docker compose up -d --build
```

To stop the stack:

```bash
docker compose down
```

Client build (if you want to rebuild the static assets):

```bash
cd client
npm install
npm run build
```

## How to Run Locally

Assuming Docker and Docker Compose are installed:

```bash
docker compose up -d --build
```

To stop the stack:

```bash
docker compose down
```

## User Help

User help and operating instructions are provided in the project thesis (Appendix A – User Guide).

## Documentation

- Detailed user instructions: Project Thesis, Appendix A - User Guide
- Maintenance and operations: Project Thesis, Appendix B - Maintenance Guide
- Demo video and poster: provided with the project submission materials
