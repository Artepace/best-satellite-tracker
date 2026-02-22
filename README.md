# Satellite Tracking and Debris Monitoring System

A real-time orbital tracking and collision prediction system built for BrisHack 2026. This platform fetches live TLE data, propagates satellite positions using SGP4, and identifies potential conjunction events (collisions) in Low Earth Orbit.

## 🚀 Features
- **Live Space-Track Integration**: Automated TLE ingestion with rate-limit handling.
- **Real-Time Propagation**: Satellite positions updated every 5 seconds.
- **Collision Detection**: High-performance conjunction analysis with Altitude Banding.
- **TCA Calculation**: Iterative simulation for Time to Closest Approach on high-risk pairs.
- **Manual Injection**: Add and test custom TLEs to see instant impact on orbital safety.
- **ISS Live Tracker**: Dedicated high-fidelity tracking via N2YO API.

## 🛠 Tech Stack
- **Backend**: Node.js, Express
- **Orbital Mechanics**: `satellite.js` (SGP4 Implementation)
- **Data Sources**: Space-Track.org, N2YO

## ⚙️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/k7official/satellite-tracker.git
   cd backend
   ```

Install dependencies:

```bash
npm install
```
Configure .env file:

Code snippet
```bash
SP_USER=your_email@example.com
SP_PASS=your_password
N2YO_API_KEY=your_key
```
Start the server:

Bash
```bash
node server.js
```
📡 API Endpoints
Data Stream
- ```GET /api/data```: Returns unified JSON of all satellites, debris, and current collision risks.

- ```GET /api/iss```: Returns real-time coordinates for the International Space Station.

Satellite Management
- ```POST /api/satellite/add```: Injects a new TLE into the live environment.

- ```DELETE /api/satellite/:id```: Removes an object and returns the "Risk Delta" (collisions resolved).

📊 Shared Data Contract
All satellite objects follow this structure to ensure Frontend consistency:

JSON
```json
{
  "id": "NORAD_ID",
  "name": "OBJECT_NAME",
  "lat": 0.0000,
  "lng": 0.0000,
  "alt_km": 000.00,
  "type": "payload/debris",
  "tle1": "...",
  "tle2": "..."
}
```
