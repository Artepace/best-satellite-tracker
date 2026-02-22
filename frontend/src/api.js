// ════════════════════════════════════════════════
//  api.js — Data layer & polling
// ════════════════════════════════════════════════

const USE_MOCK      = true;           // flip to false when BE is live
const API_BASE      = 'http://localhost:3000';
const POLL_INTERVAL = 5000;

// ── Preset TLEs ──────────────────────────────────
export const PRESET_TLES = {
  ISS: {
    line1: '1 25544U 98067A   24015.50000000  .00007890  00000-0  14936-3 0  9991',
    line2: '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.49815153434637'
  },
  STARLINK: {
    line1: '1 44235U 19029D   24015.50000000  .00001234  00000-0  10000-3 0  9992',
    line2: '2 44235  53.0000 180.0000 0001234  90.0000 270.0000 15.05000000000001'
  },
  HUBBLE: {
    line1: '1 20580U 90037B   24015.50000000  .00001000  00000-0  50000-4 0  9993',
    line2: '2 20580  28.4700 200.0000 0002500 180.0000 180.0000 15.09000000000001'
  }
};

// ── Mock data — fetched ONCE, then drifted in-place ──
let _mockBase       = null;   // original JSON, never mutated
let _mockSatellites = null;   // live drifting copy
let _mockDebris     = null;
let _mockCollisions = null;
let _mockLastDrift  = Date.now();

async function _ensureMockLoaded() {
  if (_mockBase) return;
  const res = await fetch('./mock_data.json');
  if (!res.ok) throw new Error('Failed to load mock data');
  _mockBase       = await res.json();
  // Deep-clone so drift never corrupts the original
  _mockSatellites = _mockBase.satellites.map(s => ({ ...s }));
  _mockDebris     = _mockBase.debris.map(d => ({ ...d }));
  _mockCollisions = _mockBase.collisions.map(c => ({ ...c }));
}

function _driftMock() {
  const now = Date.now();
  const dt  = Math.min((now - _mockLastDrift) / 1000, 10); // cap at 10s to prevent tab-blur jumps
  _mockLastDrift = now;

  // Drift satellites from their CURRENT positions (not from original)
  _mockSatellites = _mockSatellites.map(s => {
    const rate = s.speed_kms * 0.0042;  // deg/sec approx for LEO
    const newLat = clamp(s.lat + (Math.random() - 0.47) * rate * dt, -85, 85);
    const newLng = wrapLng(s.lng + rate * dt);
    return {
      ...s,
      lat:       newLat,
      lng:       newLng,
      alt_km:    s.alt_km + (Math.random() - 0.5) * 0.4,
      speed_kms: clamp(s.speed_kms + (Math.random() - 0.5) * 0.004, 7.0, 8.0),
      // Keep orbitPath from original data or generate a simple one
      orbitPath: s.orbitPath || _generateSimpleOrbit(newLat, newLng, s.alt_km)
    };
  });

  // Build risk_assessment from actual collision data (matches backend kesslerScore format)
  const high = _mockCollisions.filter(c => c.risk === 'HIGH').length;
  const total = _mockSatellites.length + _mockDebris.length;
  const score = Math.min(100, Math.round((high / Math.max(total, 1)) * 10000));

  return {
    satellites:      _mockSatellites,
    debris:          _mockDebris,
    collisions:      _mockCollisions,
    risk_assessment: {
      score,
      label: score > 70 ? 'CRITICAL' : score > 40 ? 'ELEVATED' : 'NOMINAL'
    },
    last_updated: new Date().toISOString()
  };
}

function _generateSimpleOrbit(lat, lng, alt_km, steps = 120) {
  const incRad = (Math.abs(lat) + 10) * Math.PI / 180;
  const path = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const pLat = Math.asin(Math.sin(incRad) * Math.sin(a)) * 180 / Math.PI;
    const pLng = lng + Math.atan2(Math.cos(incRad) * Math.sin(a), Math.cos(a)) * 180 / Math.PI;
    path.push({ lat: pLat, lng: pLng, alt_km });
  }
  return path;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function wrapLng(lng)        { return ((lng + 180) % 360 + 360) % 360 - 180; }

// ── Core fetch ────────────────────────────────────
async function fetchData() {
  if (USE_MOCK) {
    await _ensureMockLoaded();   // no-op after first call
    return _driftMock();
  }
  const res = await fetch(`${API_BASE}/api/data`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Add satellite ────────────────────────────────
export async function addSatellite(tle_line1, tle_line2) {
  if (USE_MOCK) {
    await delay(900 + Math.random() * 400);

    const mockId       = 'INJ-' + Math.floor(Date.now() / 1000 % 9999);

    const newSat = {
        id:        mockId,
        name:      parseTleName(tle_line1) || 'INJECTED OBJECT',
        lat:       (Math.random() * 120 - 60).toFixed(4) * 1,
        lng:       (Math.random() * 360 - 180).toFixed(4) * 1,
        alt_km:    380 + Math.random() * 220,
        speed_kms: 7.4 + Math.random() * 0.4,
        type:      'payload',
        orbitPath: []
      };

    // Generate orbit for injected satellite
    newSat.orbitPath = _generateSimpleOrbit(newSat.lat, newSat.lng, newSat.alt_km);

    // Add to live drift list so it appears on next poll
    if (_mockSatellites) _mockSatellites.push({ ...newSat });

    // Check for actual proximity-based collisions with existing debris/sats
    const newCollisions = _findMockCollisions(newSat, [...(_mockSatellites || []), ...(_mockDebris || [])]);

    // Also add to the global collision list so they show in the HUD
    if (newCollisions.length > 0) {
      _mockCollisions = [...(_mockCollisions || []), ...newCollisions];
    }

    return {
      added: newSat,
      satellites:     _mockSatellites ?? [],
      new_collisions: newCollisions,
      last_updated: new Date().toISOString()
    };
  }

  const res = await fetch(`${API_BASE}/api/satellite/add`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tle_line1, tle_line2 })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Injection failed');
  }
  return res.json();
}

// ── Remove satellite ──────────────────────────────
export async function removeSatellite(id) {
  if (USE_MOCK) {
    await delay(700 + Math.random() * 300);

    // Count actual collisions involving this satellite
    const involvedBefore = (_mockCollisions || []).filter(
      c => c.sat1 === id || c.sat2 === id
    ).length;

    // Remove from local mock list
    if (_mockSatellites) {
      _mockSatellites = _mockSatellites.filter(s => s.id !== id);
    }

    // Remove collisions involving this satellite
    if (_mockCollisions) {
      _mockCollisions = _mockCollisions.filter(c => c.sat1 !== id && c.sat2 !== id);
    }

    return {
      removed: {
        id,
        name: window.satelliteMap?.[id]?.name || id
      },
      impact: {
        collisions_resolved: involvedBefore,
        risk_delta:          involvedBefore > 0 ? 'REDUCED' : 'UNCHANGED',
        summary:             `Removing this object resolved ${involvedBefore} active conjunction${involvedBefore !== 1 ? 's' : ''}. ${involvedBefore > 0 ? 'Orbital risk index has decreased.' : 'No change in orbital risk.'}`
      },
      satellites:  _mockSatellites ?? [],
      collisions:  _mockCollisions ?? [],
      last_updated: new Date().toISOString()
    };
  }

  const res = await fetch(`${API_BASE}/api/satellite/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Remove failed');
  }
  return res.json();
}

// ── Polling ───────────────────────────────────────
export function startPolling(onData, onError) {
  const poll = async () => {
    try {
      const data = await fetchData();
      onData(data);
    } catch (err) {
      console.error('[ORBITWATCH] Poll error:', err);
      onError(err);
    }
  };
  poll();
  return setInterval(poll, POLL_INTERVAL);
}

// ── Helpers ───────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Simple distance calculation for mock collision detection (km)
function _mockDistance(a, b) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const x1 = (R + a.alt_km) * Math.cos(toRad(a.lat)) * Math.cos(toRad(a.lng));
  const y1 = (R + a.alt_km) * Math.cos(toRad(a.lat)) * Math.sin(toRad(a.lng));
  const z1 = (R + a.alt_km) * Math.sin(toRad(a.lat));
  const x2 = (R + b.alt_km) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng));
  const y2 = (R + b.alt_km) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng));
  const z2 = (R + b.alt_km) * Math.sin(toRad(b.lat));
  return Math.sqrt((x2-x1)**2 + (y2-y1)**2 + (z2-z1)**2);
}

// Find collisions between a new object and all existing objects
function _findMockCollisions(newSat, allObjects) {
  const collisions = [];
  for (const other of allObjects) {
    if (other.id === newSat.id) continue;
    if (Math.abs(other.alt_km - newSat.alt_km) > 50) continue; // altitude band filter
    const dist = _mockDistance(newSat, other);
    let risk = null;
    if (dist <= 5) risk = 'HIGH';
    else if (dist <= 25) risk = 'MEDIUM';
    else if (dist <= 50) risk = 'LOW';
    if (risk) {
      collisions.push({
        sat1: newSat.id,
        sat1Name: newSat.name,
        sat2: other.id,
        sat2Name: other.name || other.id,
        distance_km: +dist.toFixed(2),
        risk,
        time_to_closest: fmtTime(Math.floor(Math.random() * 3600))
      });
    }
  }
  return collisions;
}

function parseTleName(line1) {
  // TLE line 1 doesn't have name — it's in the 0-line; return generic
  return null;
}

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}