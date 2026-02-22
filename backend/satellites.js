// satellites.js
const satellite = require('satellite.js');

let satelliteStorage = []; // In-memory list of satellite objects [cite: 55, 143]

/**
 * Propagate a satellite forward in time to trace its orbital path.
 */
function computeOrbitPath(satrec, startTime, steps = 120, durationMinutes = 90) {
    const path = [];
    for (let i = 0; i <= steps; i++) {
        const t = new Date(startTime.getTime() + (i / steps) * durationMinutes * 60000);
        try {
            const pv = satellite.propagate(satrec, t);
            if (!pv.position) continue;
            const gmst = satellite.gstime(t);
            const gd = satellite.eciToGeodetic(pv.position, gmst);
            path.push({
                lat: satellite.degreesLat(gd.latitude),
                lng: satellite.degreesLong(gd.longitude),
                alt_km: gd.height
            });
        } catch (e) { /* skip bad points */ }
    }
    return path;
}

/**
 * BE-1: Helper to convert TLE lines into live coordinates.
 * This uses the SGP4 propagation model.
 */
const propagateLocation = (tleLine1, tleLine2, name, id) => {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    
    const now = new Date();
    const positionAndVelocity = satellite.propagate(satrec, now);
    const positionEci = positionAndVelocity.position;

    if (!positionEci) return null;

    const gmst = satellite.gstime(now);
    const positionGd = satellite.eciToGeodetic(positionEci, gmst);

    // Compute the full orbital path using SGP4 propagation
    const orbitPath = computeOrbitPath(satrec, now);

    return {
        id: id,
        name: name,
        lat: satellite.degreesLat(positionGd.latitude),
        lng: satellite.degreesLong(positionGd.longitude),
        alt_km: positionGd.height,
        speed_kms: 7.66,
        type: "payload",
        tle1: tleLine1,
        tle2: tleLine2,
        orbitPath: orbitPath
    };
};

/**
 * BE-1: Call this after fetching from Space-Track to overwrite the current list[cite: 142].
 */
const setSatellites = (newList) => {
    satelliteStorage = newList;
};

const getSatellites = () => {
    return satelliteStorage;
};

const addSatellite = (satelliteObject) => {
    satelliteStorage.push(satelliteObject);
    return satelliteObject;
};

const removeSatellite = (id) => {
    const index = satelliteStorage.findIndex(s => s.id === id);
    if (index !== -1) {
        return satelliteStorage.splice(index, 1)[0];
    }
    return null;
};

module.exports = {
    getSatellites,
    setSatellites,
    addSatellite,
    removeSatellite,
    propagateLocation
};