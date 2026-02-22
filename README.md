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
- **Frontend**: Vite, Vanilla JS, Three.js (3D Globe)
- **Orbital Mechanics**: `satellite.js` (SGP4 Implementation)
- **Data Sources**: Space-Track.org, N2YO

## 📁 Project Structure
```
satellite-tracker/
├── backend/        # Express API server
│   ├── server.js
│   ├── collision.js
│   ├── satellites.js
│   ├── routes/
│   └── utils/
└── frontend/       # Vite-based web app
    ├── index.html
    ├── globe.js
    ├── src/
    │   ├── main.js
    │   ├── api.js
    │   ├── alerts.js
    │   ├── dashboard.js
    │   ├── panel.js
    │   └── styles.css
    └── vite.config.js
```

## ⚙️ Installation & Setup

You'll need two terminals open — one for the backend and one for the frontend.

### 1. Clone the Repository
```bash
git clone https://github.com/Artepace/best-satellite-tracker.git
cd satellite-tracker
```

### 2. Configure Environment Variables
Create a `.env` file inside the `backend/` directory:
```bash
SP_USER=your_email@example.com
SP_PASS=your_password
N2YO_API_KEY=your_key
```

### 3. Start the Backend
```bash
cd backend
npm install
node server.js
```
The backend API will be running at `http://localhost:3000`.

### 4. Start the Frontend
Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server will be running at `http://localhost:5173` (or whichever port Vite assigns). Open that URL in your browser.

> **Note:** The frontend is pre-configured to proxy all `/api` requests to the backend at `http://localhost:3000`, so both servers need to be running at the same time.

## 📡 API Endpoints

### Data Stream
- `GET /api/data` — Returns unified JSON of all satellites, debris, and current collision risks.
- `GET /api/iss` — Returns real-time coordinates for the International Space Station.

### Satellite Management
- `POST /api/satellite/add` — Injects a new TLE into the live environment.
- `DELETE /api/satellite/:id` — Removes an object and returns the "Risk Delta" (collisions resolved).

## 📊 Shared Data Contract
All satellite objects follow this structure to ensure frontend consistency:
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
