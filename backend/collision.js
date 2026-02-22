// we will be having a list of satellites and a list of debris. And we will be checking if any 2 of them are dangerously close.

const satellite = require('satellite.js');

function computeDistance(sat1, sat2){
    // Radius of the Earth in kilometers.
    const R = 6371; // We need this, in order to convert the latitudes and longitudes into actual 3D coordinates.
    const toRad = deg => deg * Math.PI / 180; // Convert degrees to radians, because Math functions in JavaScript use radians, but the lat and long are in degrees.

    // spherical to cartesian conversion
    const x1 = (R + sat1.alt_km) * Math.cos(toRad(sat1.lat)) * Math.cos(toRad(sat1.lng));    
    const y1 = (R + sat1.alt_km) * Math.cos(toRad(sat1.lat)) * Math.sin(toRad(sat1.lng));    
    const z1 = (R + sat1.alt_km) * Math.sin(toRad(sat1.lat));

    const x2 = (R + sat2.alt_km) * Math.cos(toRad(sat2.lat)) * Math.cos(toRad(sat2.lng));
    const y2 = (R + sat2.alt_km) * Math.cos(toRad(sat2.lat)) * Math.sin(toRad(sat2.lng));
    const z2 = (R + sat2.alt_km) * Math.sin(toRad(sat2.lat));

    // calculating the straight-line distance between the two satellites in km.
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}

function getRiskLevel(distance_km){
    if (distance_km <= 5) return "HIGH";
    if (distance_km <= 25) return "MEDIUM";
    if (distance_km <= 50) return "LOW";
    return null;
}

/**
 * Iterative simulation to find the closest approach within the next 90 minutes.
 * Only called for High Risk pairs to save CPU.
 */
function calculateTCA(sat1, sat2) {
    const LOOK_AHEAD_MINUTES = 90; 
    const STEP_SIZE = 1; // 1-minute steps
    
    let minDistance = Infinity;
    let secondsToTCA = 0;
    const now = new Date();

    // Ensure TLEs exist before attempting to create satrecs
    if (!sat1.tle1 || !sat1.tle2 || !sat2.tle1 || !sat2.tle2) return "N/A";

    try {
        const satrec1 = satellite.twoline2satrec(sat1.tle1, sat1.tle2);
        const satrec2 = satellite.twoline2satrec(sat2.tle1, sat2.tle2);

        for (let t = 0; t <= LOOK_AHEAD_MINUTES; t += STEP_SIZE) {
            const futureTime = new Date(now.getTime() + t * 60000);
            const pos1 = satellite.propagate(satrec1, futureTime).position;
            const pos2 = satellite.propagate(satrec2, futureTime).position;

            if (pos1 && pos2) {
                const d = Math.sqrt(
                    Math.pow(pos1.x - pos2.x, 2) + 
                    Math.pow(pos1.y - pos2.y, 2) + 
                    Math.pow(pos1.z - pos2.z, 2)
                );

                if (d < minDistance) {
                    minDistance = d;
                    secondsToTCA = t * 60;
                } else if (t > 0) {
                    break; // Distance is increasing, we passed the TCA
                }
            }
        }
        // Format as HH:MM:SS
        return new Date(secondsToTCA * 1000).toISOString().substr(11, 8);
    } catch (e) {
        return "ERR";
    }
}

function detectCollisions(objects){
    const collisions = []; // we will push risky pairs of satellites into this array.
    const ALTITUDE_BAND = 50; // only check 2 objects for collision, if they are within 50 km of each other in altitude.
    // This is an optimization. 

    // checking every unique pair of satellites.
    for (let i = 0; i < objects.length; i++){
        for (let j = i+1; j < objects.length; j++){

            // if the 2 objects are not withing 50km of each other in altitude, skip the further calculations.
            if (Math.abs(objects[i].alt_km - objects[j].alt_km) > ALTITUDE_BAND) continue;

            const dist = computeDistance(objects[i], objects[j]);
            const risk = getRiskLevel(dist);

            if (risk){ // this only runs if the risk is HIGH, MEDIUM or LOW.

                // Optimization 2: Selective TCA Calculation
                // Only run heavy math for High Risk (<5km)
                let tcaValue = "Checking...";
                if (risk === "HIGH") {
                    tcaValue = calculateTCA(objects[i], objects[j]);
                } else {
                    tcaValue = "Pending"; // Or a simple estimate
                }

                collisions.push({
                    sat1: objects[i].id,
                    sat1Name: objects[i].name,
                    sat2: objects[j].id,
                    sat2Name: objects[j].name,
                    distance_km: parseFloat(dist.toFixed(2)), // rounding to 2 decimal places for better readability
                    risk,
                    time_to_closest: tcaValue // It tells time to collision.
                });
            }

        }
    }
    return collisions;
}

module.exports = { computeDistance, getRiskLevel, detectCollisions };







