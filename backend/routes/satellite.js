// backend for when user, adds or removes satellite.

const express = require('express');
const router = express.Router();
const { detectCollisions } = require('../collision');
const { getSatellites, addSatellite, removeSatellite, propagateLocation } = require('../satellites');
const { kesslerScore } = require('../utils/riskScore');

// listens for a POST request to /api/satellite/add.
router.post('/add', (req, res) => {
    // req.body is the JSON that frontend sends. we destructure it to pull out tle_line1 and tle_line2.
    const { tle_line1, tle_line2 } = req.body; 

    if(!tle_line1 || !tle_line2){
        return res.status(400).json({ 
            error: "INVALID_TLE", 
            message: "Both TLE lines required."
        });
    }

    if(!tle_line1.trim().startsWith("1") || !tle_line2.trim().startsWith("2")){
        return res.status(400).json({ 
            error: "INVALID_TLE", 
            message: "Line 1 must start with '1', Line 2 with '2'." 
        });
    }

    const satellite = require('satellite.js');
    const satrec = satellite.twoline2satrec(tle_line1, tle_line2);

    const newSat = propagateLocation(tle_line1, tle_line2, `CUSTOM-${satrec.satnum}`, String(satrec.satnum));

    if (!newSat) {
        return res.status(400).json({ 
            error: "PROPAGATION_FAILED", 
            message: "Could not compute position from TLE." 
        });
    }

    addSatellite(newSat); // add new satellite to live list of satellites.
    const allObjects = getSatellites(); // get the updated list.
    
    const allCollisions = detectCollisions(allObjects); // returns all collision pairs.
    // only return those collisions which involve the new satellite.
    const newCollisions = allCollisions.filter(c => c.sat1 === newSat.id || c.sat2 === newSat.id); 

    // defaults to 200 response.
    res.json({
        added: newSat,
        satellites: allObjects,
        new_collisions: newCollisions,
        kessler: kesslerScore(allObjects),  // { score: 43, label: "ELEVATED" }
        last_updated: new Date().toISOString()
    });
});

// listens for DELETE requests
router.delete('/:id', (req, res) => {
    const { id } = req.params; // get the satellite id from the URL parameter.

    const before = getSatellites(); // get the full current list
    const target = before.find(s => s.id === id); // find the satellite that we want to remove.

    // if that satellite doesn't exist.
    if (!target){
        return res.status(404).json({ 
            error: "NOT_FOUND", 
            message: `No satellite with id ${id} found.` 
        });
    }

    const collisionsBefore = detectCollisions(before);
    // calculate how many collisions the target satellite was involved in.
    const involvedBefore = collisionsBefore.filter(
        c => c.sat1 === id || c.sat2 === id
    ).length;

    removeSatellite(id); // remove the satellite from the list.
    const after = getSatellites(); // fetch the updated list.

    const collisionsAfter = detectCollisions(after); // get collisions after removal.

    const resolved = involvedBefore; // count of resolved collisions after the satellite's removal.

    res.json({
    removed: { 
      id: target.id, 
      name: target.name 
    },
    impact: {
      collisions_resolved: resolved,
      risk_delta: resolved > 0 ? "REDUCED" : "UNCHANGED",
      summary: `Removing this object resolved ${resolved} conjunction warning${resolved !== 1 ? 's' : ''}.`
    },
    satellites: after,
    collisions: collisionsAfter,
    kessler: kesslerScore(after),
    last_updated: new Date().toISOString()
  });
});

module.exports = router;