require("dotenv").config(); // Load SP_USER and SP_PASS from .env [cite: 147]
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cron = require("node-cron"); // For the 90-second refresh [cite: 147]
const {
  getSatellites,
  setSatellites,
  propagateLocation,
} = require("./satellites");
const mockData = require("./mock_data.json");
const { detectCollisions } = require("./collision");
const { kesslerScore } = require("./utils/riskScore"); // Risk utility
const app = express();
const PORT = 3000;

// Space-Track Credentials from your .env file
const SP_USER = process.env.SP_USER;
const SP_PASS = process.env.SP_PASS;

// Middleware
app.use(cors()); // [cite: 147]
app.use(express.json()); // [cite: 147]
// Mount the BE-2 satellite management routes
const satelliteRoutes = require("./routes/satellite"); // Adjust path if needed
app.use("/api/satellite", satelliteRoutes);

/**
 * BE-1: Core Fetching Logic
 * Pulls TLEs from Space-Track and updates our in-memory storage[cite: 27, 124].
 */
async function fetchTles() {
  try {
    console.log("Authenticating with Space-Track...");

    // STEP 1: LOGIN [cite: 122]
    const loginResponse = await axios.post(
      "https://www.space-track.org/ajaxauth/login",
      new URLSearchParams({
        identity: process.env.SP_USER,
        password: process.env.SP_PASS,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    // Extract just the session part of the cookie string
    const setCookieHeader = loginResponse.headers["set-cookie"];
    if (!setCookieHeader) {
      console.error("Login failed: No cookie returned.");
      return;
    }
    const sessionCookie = setCookieHeader[0].split(";")[0];

    console.log("Login successful. Fetching TLE data...");

    // STEP 2: FETCH DATA [cite: 10, 27]
    // Corrected URL based on Space-Track documentation
    //const queryUrl =
    //  "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/limit/500/format/json";

    // const queryUrl =
    //   "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/OBJECT_TYPE/PAYLOAD/limit/500/format/json";
    // const dataResponse = await axios.get(queryUrl, {
    //   headers: { Cookie: sessionCookie },
    // });

    // const rawData = dataResponse.data;

    // if (!Array.isArray(rawData)) {
    //   console.error("Data error: Space-Track returned non-array format.");
    //   return;
    // }

    // // STEP 3: PROPAGATE [cite: 27, 54]
    // const processedSats = rawData.map((s) => ({
    //   id: s.NORAD_CAT_ID,
    //   name: s.OBJECT_NAME,
    //   tle1: s.TLE_LINE1,
    //   tle2: s.TLE_LINE2,
    // }));

    // STEP 2: FETCH DATA — payloads + debris separately for realistic mix
    const payloadUrl =
      "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/OBJECT_TYPE/PAYLOAD/limit/500/format/json";
    const debrisUrl =
      "https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/OBJECT_TYPE/DEBRIS/limit/250/format/json";

    const [payloadResponse, debrisResponse] = await Promise.all([
      axios.get(payloadUrl, { headers: { Cookie: sessionCookie } }),
      axios.get(debrisUrl, { headers: { Cookie: sessionCookie } }),
    ]);

    const rawData = [...payloadResponse.data, ...debrisResponse.data];

    if (!Array.isArray(rawData) || rawData.length === 0) {
      console.error("Data error: Space-Track returned no data.");
      return;
    }

    // STEP 3: PROPAGATE
    const processedSats = rawData.map((s) => ({
      id: s.NORAD_CAT_ID,
      name: s.OBJECT_NAME,
      tle1: s.TLE_LINE1,
      tle2: s.TLE_LINE2,
    }));

    setSatellites(processedSats);
    console.log("First Satellite Sample: ", getSatellites()[0]);
    console.log(
      `Successfully updated ${processedSats.length} satellites at ${new Date().toLocaleTimeString()}`,
    );
  } catch (error) {
    if (error.response) {
      console.error(`Space-Track Error: ${error.response.status}`);
      if (error.response.status === 404) {
        console.error("Check the queryUrl for typos or deprecated endpoints.");
      }
    } else {
      console.error("Connection Error:", error.message);
    }
  }
}

// Safe Fetch Wrapper (Mutex Guard)
let updating = false;
async function safeFetchTles() {
  if (updating) return;

  updating = true;
  await fetchTles();
  updating = false;
}

/**
 * BE-1: Automation
 * Refresh TLE data every 90 seconds to stay within rate limits[cite: 27, 124, 145].
 */
cron.schedule("*/90 * * * * *", () => {
  fetchTles();
});

// Initial fetch on server start [cite: 122]
fetchTles();

/**
 * BE-1: Propagation Loop
 * Recalculate positions every 5 seconds based on TLEs already in memory.
 * This makes the satellites move smoothly on the FE globe.
 */
/*setInterval(() => {
  const currentSats = getSatellites();
  if (currentSats.length > 0) {
    const updatedSats = currentSats
      .map((s) => {
        if (s.tle1 && s.tle2) {
          return propagateLocation(s.tle1, s.tle2, s.name, s.id);
        }
        return s;
      })
      .filter((s) => s && !isNaN(s.lat) && !isNaN(s.lng) && !isNaN(s.alt_km));
    setSatellites(updatedSats);
    //console.log("BE-2 sees satellite count:", getSatellites().length);
    // console.log("Positions propagated for current time.");
  }
}, 5000); // 5 seconds*/

setInterval(() => {
  const rawSats = getSatellites();

  const propagated = rawSats
    .map((s) => propagateLocation(s.tle1, s.tle2, s.name, s.id))
    .filter(Boolean);

  setSatellites(propagated);
}, 5000);

/**
 * Main Data Endpoint
 * Returns live data from BE-1 (satellites) and eventually BE-2 (collisions)[cite: 27, 31].
 */
app.get("/api/data", (req, res) => {
  const allObjects = getSatellites();
  console.log(allObjects);

  if (allObjects.length === 0) {
    return res.json(mockData);
  }

  // BE-2 : Integration: Split objects into Satellites and Debris
  // Typically, TLE names with "DEB", "R/B", or "COOLANT" are debris
  const debris = allObjects.filter((s) =>
    ["DEB", "R/B", "COOLANT"].some((tag) => s.name.includes(tag)),
  );

  const debrisSet = new Set(debris.map((s) => s.id));

  const activeSatellites = allObjects.filter((s) => !debrisSet.has(s.id));

  // BE-2 Integration: Run the collision detection algorithm
  const collisions = detectCollisions(allObjects);

  // Build name lookup for collision display
  const nameMap = {};
  allObjects.forEach((s) => {
    nameMap[s.id] = s.name;
  });

  // Add satellite names to collision records for the frontend
  const namedCollisions = collisions.map((c) => ({
    ...c,
    sat1Name: nameMap[c.sat1] || c.sat1,
    sat2Name: nameMap[c.sat2] || c.sat2,
  }));

  // Strip internal TLE fields from response, keep orbitPath for frontend
  const cleanSat = (s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    alt_km: s.alt_km,
    speed_kms: s.speed_kms,
    type: s.type,
    orbitPath: s.orbitPath || [],
  });

  res.json({
    satellites: activeSatellites.map(cleanSat),
    debris: debris.map(cleanSat),
    collisions: namedCollisions,
    risk_assessment: kesslerScore(allObjects),
    last_updated: new Date().toISOString(),
  });
});

/**
 * PHASE 2: ISS Specific Endpoint (Demo 1)
 * Fetches real-time ISS data from N2YO API.
 */
app.get("/api/iss", async (req, res) => {
  try {
    const N2YO_KEY = process.env.N2YO_API_KEY;
    const ISS_ID = "25544"; // NORAD ID for the ISS

    // Fetch position for 1 second (returns current lat/lng/alt)
    const url = `https://api.n2yo.com/rest/v1/satellite/positions/${ISS_ID}/0/0/0/1/&apiKey=${N2YO_KEY}`;

    const response = await axios.get(url);
    const data = response.data.positions[0];

    res.json({
      id: "ISS",
      name: "ISS (ZARYA)",
      lat: data.satlatitude,
      lng: data.satlongitude,
      alt_km: data.sataltitude,
      speed_kms: 7.66, // Standard LEO speed [cite: 38]
      type: "station", // Matches contract for FE color-coding [cite: 38]
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("N2YO API Error:", error.message);
    res.status(500).json({ error: "Could not fetch live ISS position" });
  }
});

app.listen(PORT, () => {
  console.log(`BE-1 Server running at http://localhost:${PORT}`);
});
