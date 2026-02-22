Cesium.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI0YzQ4NmJhYy1mMDk2LTRlN2YtOGQ1MC1mZTZhZjZmMjMzOWIiLCJpZCI6MzkyNzYwLCJpYXQiOjE3NzE2ODc5MDZ9.HzU4xlzSGCgp7Zy6rfNlkWkceYgBbpHJUWLRwrkIJvU";

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  selectionIndicator: false,
  infoBox: false,
  homeButton: false,
  fullscreenButton: false,
});

viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date());
viewer.clock.shouldAnimate = true;
viewer.clock.multiplier = 1;

viewer.imageryLayers.addImageryProvider(
  new Cesium.GridImageryProvider({
    color: Cesium.Color.WHITE.withAlpha(0.1),
    backgroundColor: Cesium.Color.TRANSPARENT,
    glowColor: Cesium.Color.WHITE.withAlpha(0.05),
    glowWidth: 1,
    tileWidth: 256,
    tileHeight: 256,
    canvasSize: 256,
  }),
);

viewer.scene.globe.enableLighting = true;
viewer.scene.globe.maximumScreenSpaceError = 1;
viewer.scene.globe.tileCacheSize = 1000;
viewer.scene.skyBox.show = true;
viewer.scene.skyAtmosphere.brightnessShift = 0.3;
viewer.scene.skyAtmosphere.hueShift = -0.05;
viewer.scene.backgroundColor = Cesium.Color.BLACK;
viewer.scene.screenSpaceCameraController.enableCollisionDetection = false;
viewer.resolutionScale = window.devicePixelRatio;

// ═══════════════════════════════════════════════════
//  STATE
//  _selectedIds: Set of satellite IDs (not entity IDs) that are selected
//  _orbitEntities: Map from satellite ID → orbit polyline entity
//  window.selectedSatellites: array of satData, read by panel.js
// ═══════════════════════════════════════════════════
const _selectedIds = new Set(); // satellite base IDs e.g. "25544"
const _orbitEntities = new Map(); // sat id → orbit entity id (string)

window.selectedSatellite = null;
window.selectedSatellites = [];

let _debrisCollection = null;
let _lastCollisions = [];
let _shiftHeld = false;

document.addEventListener("keydown", (e) => {
  if (e.key === "Shift") _shiftHeld = true;
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Shift") _shiftHeld = false;
});

const ORBIT_COLORS = ["#00c8ff", "#ff6600", "#00ffaa", "#ff44cc", "#ffe033"];

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
// async function init() {
//   viewer.scene.globe.tileLoadProgressEvent.addEventListener((remaining) => {
//     if (remaining === 0) {
//       const ph = document.getElementById("globe-placeholder");
//       if (ph) {
//         ph.style.opacity = "0";
//         ph.style.pointerEvents = "none";
//       }
//     }
//   });

//   const res = await fetch("/api/satellites");
//   const data = await res.json();
//   _lastCollisions = data.collisions || [];
//   renderSatellites(data.satellites, data.collisions);
//   renderDebris(data.debris);
//   setupClickHandler();
//   setupListeners();
// }

async function init() {
  // All data arrives via custom events dispatched by main.js (satellites-updated, etc.)
  // No independent fetch here — that caused double-render flickering.
  setupClickHandler();
  setupListeners();
}

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════
function pulse(base, speed, amp) {
  return new Cesium.CallbackProperty((time) => {
    const s = Cesium.JulianDate.toDate(time).getTime() / 1000;
    return base + Math.sin(s * speed) * amp;
  }, false);
}

function collisionMap(collisions) {
  const m = {};
  collisions.forEach((c) => {
    m[c.sat1] = {
      risk: c.risk,
      collidingWith: c.sat2,
      distance_km: c.distance_km,
      time_to_closest: c.time_to_closest,
    };
    m[c.sat2] = {
      risk: c.risk,
      collidingWith: c.sat1,
      distance_km: c.distance_km,
      time_to_closest: c.time_to_closest,
    };
  });
  return m;
}

function satColor(sat, col) {
  if (col?.risk === "HIGH") return Cesium.Color.RED;
  if (col?.risk === "MEDIUM") return Cesium.Color.ORANGE;
  if (col?.risk === "LOW") return Cesium.Color.YELLOW;
  if (sat.name.includes("STARLINK"))
    return Cesium.Color.fromCssColorString("#00bfff");
  if (sat.name.includes("ONEWEB"))
    return Cesium.Color.fromCssColorString("#ff6600");
  if (sat.name.includes("GPS"))
    return Cesium.Color.fromCssColorString("#00ff88");
  if (sat.name.includes("GLONASS"))
    return Cesium.Color.fromCssColorString("#ff4488");
  if (sat.name.includes("GALILEO"))
    return Cesium.Color.fromCssColorString("#ffff00");
  if (sat.name.includes("BEIDOU"))
    return Cesium.Color.fromCssColorString("#ff8800");
  if (sat.name.includes("IRIDIUM"))
    return Cesium.Color.fromCssColorString("#cc88ff");
  if (sat.type === "station") return Cesium.Color.WHITE;
  if (sat.type === "rocket_body")
    return Cesium.Color.fromCssColorString("#888888");
  return Cesium.Color.CYAN;
}

// Extract base satellite ID from entity ID "SATID_NAME"
function baseSatId(entityId) {
  return String(entityId).split("_")[0];
}

// Get the live entity for a satellite base ID
function entityForSatId(satId) {
  return viewer.entities.values.find((e) => {
    const id = String(e.id);
    return !id.startsWith("orbit_") && id.split("_")[0] === satId;
  });
}

// ═══════════════════════════════════════════════════
//  RENDER  — preserves selection styling across polls
// ═══════════════════════════════════════════════════
function renderSatellites(satellites, collisions) {
  // Remove satellite entities only — preserve orbit_ lines, beacon_ markers, and label_ tags
  viewer.entities.values
    .filter((e) => {
      const id = String(e.id);
      return (
        !id.startsWith("orbit_") &&
        !id.startsWith("beacon_") &&
        !id.startsWith("label_")
      );
    })
    .forEach((e) => viewer.entities.remove(e));

  const rmap = collisionMap(collisions);

  satellites.forEach((s) => {
    const col = rmap[s.id];
    const color = satColor(s, col);
    const selected = _selectedIds.has(s.id);

    viewer.entities.add({
      id: s.id + "_" + s.name,
      name: s.name,
      position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, s.alt_km * 1000),
      point: {
        pixelSize: selected ? pulse(12, 3, 5) : pulse(2.5, 2, 1),
        color: color,
        outlineWidth: selected ? 3 : 0,
        outlineColor: selected
          ? Cesium.Color.WHITE.withAlpha(0.95)
          : Cesium.Color.TRANSPARENT,
        scaleByDistance: selected
          ? undefined
          : new Cesium.NearFarScalar(1e7, 1.5, 1e10, 0.5),
      },
      properties: {
        satId: s.id,
        lat: s.lat,
        lng: s.lng,
        alt_km: s.alt_km,
        speed_kms: s.speed_kms,
        type: s.type,
        risk: col?.risk || null,
        collidingWith: col?.collidingWith || null,
        distance_km: col?.distance_km || null,
        time_to_closest: col?.time_to_closest || null,
        orbitPath: JSON.stringify(s.orbitPath || []),
      },
    });
  });

  // After re-render, rebuild shared state from fresh entities
  rebuildSharedState();
}

function renderDebris(debrisArray) {
  if (_debrisCollection) viewer.scene.primitives.remove(_debrisCollection);
  _debrisCollection = viewer.scene.primitives.add(
    new Cesium.PointPrimitiveCollection(),
  );
  debrisArray.forEach((d) => {
    _debrisCollection.add({
      position: Cesium.Cartesian3.fromDegrees(d.lng, d.lat, d.alt_km * 1000),
      color: Cesium.Color.fromCssColorString("#5a2720").withAlpha(0.6),
      pixelSize: 4,
    });
  });
}

// ═══════════════════════════════════════════════════
//  ORBIT LINES — uses orbitPath from backend/mock data
// ═══════════════════════════════════════════════════
function addOrbit(satId, satData) {
  removeOrbit(satId);

  // Use backend-provided orbitPath if available
  let positions = [];
  if (satData.orbitPath && satData.orbitPath.length > 1) {
    positions = satData.orbitPath.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lng, p.lat, (p.alt_km || satData.alt_km) * 1000)
    );
  } else {
    // Fallback: generate a simple approximate orbit from current position
    positions = fallbackOrbitPositions(satData);
  }

  if (positions.length < 2) return;

  const color = satColor(
    { name: satData.name, type: satData.type },
    { risk: satData.risk },
  );
  const orbitId = "orbit_" + satId;
  viewer.entities.add({
    id: orbitId,
    polyline: {
      positions: positions,
      width: 15,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.1,
        color: color.withAlpha(0.5),
      }),
      clampToGround: false,
    },
  });
  _orbitEntities.set(satId, orbitId);
}

// Fallback orbit when backend doesn't provide orbitPath (e.g. mock mode without it)
function fallbackOrbitPositions(sat, steps = 180) {
  const alt = sat.alt_km * 1000;
  const incRad = Cesium.Math.toRadians(Math.abs(sat.lat) + 10);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const lat = Math.asin(Math.sin(incRad) * Math.sin(a));
    const lng =
      sat.lng +
      Cesium.Math.toDegrees(
        Math.atan2(Math.cos(incRad) * Math.sin(a), Math.cos(a)),
      );
    pts.push(
      Cesium.Cartesian3.fromDegrees(lng, Cesium.Math.toDegrees(lat), alt),
    );
  }
  return pts;
}

// Label entities — one per selected satellite, cleared on deselect
const _labelEntities = new Map(); // satId → label entity id

function addLabel(satId, satData) {
  removeLabel(satId);
  const labelId = "label_" + satId;
  viewer.entities.add({
    id: labelId,
    position: Cesium.Cartesian3.fromDegrees(
      satData.lng,
      satData.lat,
      satData.alt_km * 1000 + 100000,
    ),
    label: {
      text: satData.name,
      font: 'bold 15px "Space Mono", monospace',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(14, -14),
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(1e6, 1.8, 2e7, 0.6),
    },
  });
  _labelEntities.set(satId, labelId);
}

function removeLabel(satId) {
  const lid = _labelEntities.get(satId);
  if (lid) {
    const e = viewer.entities.getById(lid);
    if (e) viewer.entities.remove(e);
    _labelEntities.delete(satId);
  }
}

function removeOrbit(satId) {
  const oid = _orbitEntities.get(satId);
  if (oid) {
    const e = viewer.entities.getById(oid);
    if (e) viewer.entities.remove(e);
    _orbitEntities.delete(satId);
  }
}

// ═══════════════════════════════════════════════════
//  CAMERA
// ═══════════════════════════════════════════════════

// Pan the camera to centre on the selected satellites WITHOUT changing the
// zoom level. We keep the current camera height (distance from Earth centre)
// and just move the look-at point.
function panToSatellites(satDataArray) {
  if (!satDataArray.length) return;

  // Midpoint of all selected objects (or just the one object if single selection)
  const midLat =
    satDataArray.reduce((s, d) => s + d.lat, 0) / satDataArray.length;
  const midLng =
    satDataArray.reduce((s, d) => s + d.lng, 0) / satDataArray.length;

  // Preserve current camera altitude exactly — pure pan, no zoom
  const currentAlt = viewer.camera.positionCartographic.height;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(midLng, midLat, currentAlt),
    orientation: {
      heading: viewer.camera.heading,
      pitch: viewer.camera.pitch,
      roll: 0,
    },
    duration: 1.4,
  });
}

// Called on deselect — zoom out to full-Earth view, keep current camera direction
function flyToEarth() {
  // Get current camera direction (heading/pitch) so we don't rotate
  const heading = viewer.camera.heading;
  const pitch = viewer.camera.pitch;
  // Move straight back along the current view axis to 22 000 km altitude
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(viewer.camera.positionCartographic.longitude),
      Cesium.Math.toDegrees(viewer.camera.positionCartographic.latitude),
      22_000_000,
    ),
    orientation: { heading, pitch, roll: 0 },
    duration: 1.5,
  });
}

// ═══════════════════════════════════════════════════
//  SELECTION
// ═══════════════════════════════════════════════════
function satDataFromEntity(entity) {
  const p = entity.properties;

  const risk = p.risk.getValue();
  const color = satColor(
    { name: entity.name, type: p.type.getValue() },
    { risk },
  );

  let orbitPath = [];
  try {
    const raw = p.orbitPath?.getValue();
    if (typeof raw === 'string' && raw.length > 2) {
      orbitPath = JSON.parse(raw);
    } else if (Array.isArray(raw)) {
      orbitPath = raw;
    }
  } catch (e) { /* ignore parse errors */ }

  return {
    id: p.satId?.getValue() || baseSatId(entity.id),
    name: entity.name,
    lat: p.lat.getValue(),
    lng: p.lng.getValue(),
    alt_km: p.alt_km.getValue(),
    speed_kms: p.speed_kms.getValue(),
    type: p.type.getValue(),
    risk,
    collidingWith: p.collidingWith.getValue(),
    distance_km: p.distance_km.getValue(),
    time_to_closest: p.time_to_closest.getValue(),
    color: "#" + color.toCssHexString().slice(1, 7),
    orbitPath,
  };
}

function select(entity, addMode) {
  const satId = baseSatId(entity.id);

  if (_selectedIds.has(satId)) {
    _selectedIds.delete(satId);
    removeOrbit(satId);
    removeLabel(satId);
    restoreDot(entity);
    rebuildSharedState();
    return;
  }

  if (!addMode) deselect();

  _selectedIds.add(satId);
  highlightDot(entity);
  const satData = satDataFromEntity(entity); // ← store it first
  addOrbit(satId, satData); // ← pass satData, no colorIndex needed
  addLabel(satId, satData);
  rebuildSharedState();
}

function deselect() {
  _selectedIds.forEach((satId) => {
    removeOrbit(satId);
    removeLabel(satId);
    const ent = entityForSatId(satId);
    if (ent) restoreDot(ent);
  });
  _selectedIds.clear();
  clearBeacons();
  rebuildSharedState();
  flyToEarth();
}

function highlightDot(entity) {
  if (!entity.point) return;
  entity.point.scaleByDistance = undefined;
  entity.point.pixelSize = pulse(12, 3, 5);
  entity.point.outlineColor = Cesium.Color.WHITE.withAlpha(0.95);
  entity.point.outlineWidth = 3;
}

function restoreDot(entity) {
  if (!entity.point) return;
  entity.point.pixelSize = pulse(2.5, 2, 1);
  entity.point.scaleByDistance = new Cesium.NearFarScalar(1e7, 1.5, 1e10, 0.5);
  entity.point.outlineWidth = 0;
  entity.point.outlineColor = Cesium.Color.TRANSPARENT;
}

// Rebuild window.selectedSatellites from _selectedIds + live entities
function rebuildSharedState() {
  const result = [];
  _selectedIds.forEach((satId) => {
    const ent = entityForSatId(satId);
    if (ent) result.push(satDataFromEntity(ent));
  });
  window.selectedSatellites = result;
  window.selectedSatellite =
    result.length > 0 ? result[result.length - 1] : null;
}

// Called by panel deselect buttons — removes one satellite from selection
window.deselectSatById = function (satId) {
  const ent = entityForSatId(satId);
  if (ent) restoreDot(ent);
  removeOrbit(satId);
  removeLabel(satId);
  _selectedIds.delete(satId);
  rebuildSharedState();
  if (_selectedIds.size === 0) flyToEarth();
};

// Active debris beacons — cleared on deselect
const _beaconIds = new Set();

// Place a persistent pulsing beacon for a debris object (not a Cesium entity)
// that stays until the selection is cleared.
function addDebrisBeacon(debrisId, refEntity) {
  const beaconId = "beacon_" + debrisId;
  // Remove old beacon with same ID if any
  const old = viewer.entities.getById(beaconId);
  if (old) viewer.entities.remove(old);

  const lat = refEntity.properties.lat.getValue() + (Math.random() - 0.5) * 2;
  const lng = refEntity.properties.lng.getValue() + (Math.random() - 0.5) * 2;
  const alt = refEntity.properties.alt_km.getValue() * 1000;

  viewer.entities.add({
    id: beaconId,
    position: Cesium.Cartesian3.fromDegrees(lng, lat, alt),
    point: {
      pixelSize: new Cesium.CallbackProperty((time) => {
        const s = Cesium.JulianDate.toDate(time).getTime() / 1000;
        return 12 + Math.sin(s * 5) * 5;
      }, false),
      color: Cesium.Color.fromCssColorString("#ff3333").withAlpha(0.95),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      scaleByDistance: undefined,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: debrisId,
      font: "bold 12px monospace",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  _beaconIds.add(beaconId);
}

function clearBeacons() {
  _beaconIds.forEach((id) => {
    const e = viewer.entities.getById(id);
    if (e) viewer.entities.remove(e);
  });
  _beaconIds.clear();
}

function setupClickHandler() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

  handler.setInputAction((click) => {
    const picked = viewer.scene.pick(click.position);
    if (
      Cesium.defined(picked) &&
      picked.id &&
      !String(picked.id.id).startsWith("orbit_") &&
      !String(picked.id.id).startsWith("beacon_")
    ) {
      // Always add to selection — clicking again on an already-selected sat does nothing
      const satId = baseSatId(picked.id.id);
      if (!_selectedIds.has(satId)) {
        select(picked.id, true); // always addMode=true
        if (_selectedIds.size > 0) panToSatellites(window.selectedSatellites);
      }
    }
    // Clicking empty space does nothing — deselect only via panel buttons
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

// ═══════════════════════════════════════════════════
//  FE-2 LISTENERS
// ═══════════════════════════════════════════════════
function setupListeners() {
  window.addEventListener("satellites-updated", (e) => {
    const sats = e.detail || [];
    renderSatellites(sats, _lastCollisions);
  });

  window.addEventListener("debris-updated", (e) => {
    const debris = e.detail || [];
    renderDebris(debris);
  });

  window.addEventListener("collisions-updated", (e) => {
    _lastCollisions = e.detail || [];
  });

  window.addEventListener("satellite-injected", (e) => {
    const { id } = e.detail;
    setTimeout(() => {
      const ent = entityForSatId(id);
      if (!ent) return;
      // Clear quietly without triggering flyToEarth
      _selectedIds.forEach((sid) => {
        removeOrbit(sid);
        const en = entityForSatId(sid);
        if (en) restoreDot(en);
      });
      _selectedIds.clear();
      clearBeacons();
      rebuildSharedState();
      select(ent, false);
      panToSatellites(window.selectedSatellites);
    }, 400);
  });

  window.addEventListener("highlight-pair", (e) => {
    const { sat1, sat2 } = e.detail;

    // Clear selection quietly (no camera fly)
    _selectedIds.forEach((sid) => {
      removeOrbit(sid);
      const ent = entityForSatId(sid);
      if (ent) restoreDot(ent);
    });
    _selectedIds.clear();
    clearBeacons();
    rebuildSharedState();

    // Select sat1 (always a real satellite entity)
    const ent1 = entityForSatId(sat1);
    if (ent1) select(ent1, true);

    // sat2 is usually debris — try entity first, then place a persistent beacon
    const ent2 = entityForSatId(sat2);
    if (ent2) {
      select(ent2, true);
    } else if (ent1) {
      // Place permanent beacon near sat1 until deselected
      addDebrisBeacon(sat2, ent1);
    }

    if (window.selectedSatellites.length)
      panToSatellites(window.selectedSatellites);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.key.toLowerCase() === "f") deselect();
  });
}

init();
