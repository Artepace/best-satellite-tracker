import { addSatellite, removeSatellite, PRESET_TLES } from "./api.js";
import { renderCollisionAlerts, resetAlertHistory } from "./alerts.js";
import { showToast } from "./toast.js";

const TYPE_CONFIG = {
  station: { color: "#00c8ff", label: "SPACE STATION" },
  payload: { color: "#00ffaa", label: "PAYLOAD" },
  debris: { color: "#ff6633", label: "DEBRIS" },
  rocket_body: { color: "#ffb300", label: "ROCKET BODY" },
};

const _history = {};
const HISTORY_LEN = 12;

function pushHistory(sat) {
  if (!_history[sat.id]) _history[sat.id] = [];
  _history[sat.id].push(sat.alt_km);
  if (_history[sat.id].length > HISTORY_LEN) _history[sat.id].shift();
}

export function initPanel() {
  showEmpty();
  watchSelected();
}

function showEmpty() {
  document.getElementById("panel-content").innerHTML = `
    <div class="empty-state">
      <div class="empty-anim">
        <div class="ea-ring r1"></div>
        <div class="ea-ring r2"></div>
        <div class="ea-ring r3"></div>
        <div class="ea-core"></div>
      </div>
      <p class="empty-h">NO OBJECT SELECTED</p>
      <p class="empty-p">Click any satellite to inspect it.<br>Keep clicking to select multiple.</p>
      <div class="empty-stat" id="empty-stat">TRACKING — objects</div>
    </div>
  `;
  updateEmptyStat();
}

function updateEmptyStat() {
  const el = document.getElementById("empty-stat");
  const map = window.satelliteMap || {};
  const n = Object.keys(map).length;
  if (el && n > 0) el.textContent = `TRACKING ${n} OBJECTS`;
}

// ── Watch selection — compare snapshot to avoid false re-renders ──
let _lastSnapshot = "";
let _liveRefresh = null;

function watchSelected() {
  setInterval(() => {
    const sats = window.selectedSatellites || [];
    // Snapshot: ids + count only — positions update via live refresh, not re-render
    const snapshot = sats.map((s) => s.id).join(",");

    if (snapshot === _lastSnapshot) return; // nothing changed structurally
    _lastSnapshot = snapshot;
    stopLiveRefresh();

    if (sats.length === 0) {
      showEmpty();
    } else if (sats.length === 1) {
      renderSingle(sats[0]);
      startLiveRefresh(sats[0].id);
    } else {
      renderMulti(sats);
      startMultiRefresh(sats);
    }
  }, 150);
}

// ── Live refresh: updates numbers without re-rendering HTML ──
function startLiveRefresh(id) {
  _liveRefresh = setInterval(() => {
    const fresh = window.satelliteMap?.[id];
    if (!fresh) return;
    updateCell("cell-lat", fresh.lat.toFixed(4) + "°");
    updateCell("cell-lng", fresh.lng.toFixed(4) + "°");
    updateCell("cell-alt", fresh.alt_km.toFixed(1) + " km");
    updateCell("cell-speed", fresh.speed_kms.toFixed(3) + " km/s");
    // keep selectedSatellite fresh
    if (window.selectedSatellite?.id === id)
      Object.assign(window.selectedSatellite, fresh);
    pushHistory(fresh);
    drawSparkline(fresh.id);
  }, 1000);
}

function startMultiRefresh(sats) {
  _liveRefresh = setInterval(() => {
    sats.forEach((sat, i) => {
      const fresh = window.satelliteMap?.[sat.id];
      if (!fresh) return;
      updateCell(`cell-alt-${i}`, fresh.alt_km.toFixed(1) + " km");
      updateCell(`cell-speed-${i}`, fresh.speed_kms.toFixed(3) + " km/s");
      updateCell(`cell-lat-${i}`, fresh.lat.toFixed(4) + "°");
      updateCell(`cell-lng-${i}`, fresh.lng.toFixed(4) + "°");
    });
  }, 1000);
}

function stopLiveRefresh() {
  if (_liveRefresh) {
    clearInterval(_liveRefresh);
    _liveRefresh = null;
  }
}

function updateCell(field, val) {
  const el = document.querySelector(`[data-field="${field}"]`);
  if (!el || el.textContent === val) return;
  el.textContent = val;
  el.classList.remove("updating");
  void el.offsetWidth;
  el.classList.add("updating");
}

// ── Single satellite inspector ────────────────────
function renderSingle(sat) {
  const cfg = TYPE_CONFIG[sat.type] || {
    color: "#aaa",
    label: sat.type?.toUpperCase() || "UNKNOWN",
  };
  const r = 6371 + sat.alt_km;
  const period = (
    (2 * Math.PI * Math.pow(r, 1.5)) /
    Math.sqrt(398600.4418) /
    60
  ).toFixed(1);
  const orbDay = (1440 / period).toFixed(2);

  if (!_history[sat.id]) {
    _history[sat.id] = Array.from(
      { length: HISTORY_LEN },
      () => sat.alt_km + (Math.random() - 0.5) * 4,
    );
  }
  pushHistory(sat);

  document.getElementById("panel-content").innerHTML = `
    <div class="sat-badge-row">
      <span class="sat-badge" style="color:${cfg.color};border-color:${cfg.color}55;background:${cfg.color}1a">
        ${cfg.label}
      </span>
    </div>
    <div class="sat-name-block">
      <div class="sat-name-row">
        <div>
          <div class="sat-name">${sat.name}</div>
          <div class="sat-norad">NORAD ID: ${sat.id}</div>
        </div>
        <button class="btn-deselect-x" onclick="window.deselectSatById('${sat.id}')" title="Deselect">✕</button>
      </div>
    </div>
    <div class="sat-grid">
      <div class="sat-cell">
        <span class="cell-k">Altitude</span>
        <span class="cell-v" data-field="cell-alt">${sat.alt_km.toFixed(1)} km</span>
      </div>
      <div class="sat-cell">
        <span class="cell-k">Speed</span>
        <span class="cell-v" data-field="cell-speed">${sat.speed_kms.toFixed(3)} km/s</span>
      </div>
      <div class="sat-cell">
        <span class="cell-k">Latitude</span>
        <span class="cell-v" data-field="cell-lat">${sat.lat.toFixed(4)}°</span>
      </div>
      <div class="sat-cell">
        <span class="cell-k">Longitude</span>
        <span class="cell-v" data-field="cell-lng">${sat.lng.toFixed(4)}°</span>
      </div>
      <div class="sat-cell">
        <span class="cell-k">Period</span>
        <span class="cell-v">${period} min</span>
      </div>
      <div class="sat-cell">
        <span class="cell-k">Orbits/Day</span>
        <span class="cell-v">${orbDay}</span>
      </div>
    </div>
    <div class="sat-sparkline-wrap">
      <div class="sparkline-label">
        ALTITUDE HISTORY — LAST ${HISTORY_LEN} READINGS
        <span class="spark-range-val" id="spark-range"></span>
      </div>
      <svg class="sat-sparkline" id="sparkline-svg" viewBox="0 0 280 56" preserveAspectRatio="none"></svg>
    </div>
    <button class="btn-remove" id="remove-btn">REMOVE FROM SIMULATION</button>
  `;

  drawSparkline(sat.id);
  setupRemoveBtn(sat);
}

// ── Multi satellite inspector ─────────────────────
function renderMulti(sats) {
  const cards = sats
    .map((sat, i) => {
      const cfg = TYPE_CONFIG[sat.type] || {
        color: "#aaa",
        label: sat.type?.toUpperCase() || "UNKNOWN",
      };
      const r = 6371 + sat.alt_km;
      const period = (
        (2 * Math.PI * Math.pow(r, 1.5)) /
        Math.sqrt(398600.4418) /
        60
      ).toFixed(1);
      return `
      <div class="multi-sat-card" style="border-left:3px solid ${cfg.color}">
        <div class="multi-sat-card-top">
          <div>
            <div class="multi-sat-badge" style="color:${cfg.color}">${cfg.label}</div>
            <div class="multi-sat-name">${sat.name}</div>
            <div class="multi-sat-norad">ID: ${sat.id}</div>
          </div>
          <button class="btn-deselect-x" onclick="window.deselectSatById('${sat.id}')" title="Deselect">✕</button>
        </div>
        <div class="multi-sat-grid">
          <div class="multi-cell"><span class="multi-key">Alt</span><span class="multi-val" data-field="cell-alt-${i}">${sat.alt_km.toFixed(1)} km</span></div>
          <div class="multi-cell"><span class="multi-key">Speed</span><span class="multi-val" data-field="cell-speed-${i}">${sat.speed_kms.toFixed(3)} km/s</span></div>
          <div class="multi-cell"><span class="multi-key">Lat</span><span class="multi-val" data-field="cell-lat-${i}">${sat.lat.toFixed(3)}°</span></div>
          <div class="multi-cell"><span class="multi-key">Lng</span><span class="multi-val" data-field="cell-lng-${i}">${sat.lng.toFixed(3)}°</span></div>
          <div class="multi-cell"><span class="multi-key">Period</span><span class="multi-val">${period} min</span></div>
          ${sat.risk ? `<div class="multi-cell"><span class="multi-key">Risk</span><span class="multi-val" style="color:${sat.risk === "HIGH" ? "#ff1a54" : sat.risk === "MEDIUM" ? "#ffb300" : "#00ffaa"}">${sat.risk}</span></div>` : ""}
        </div>
      </div>`;
    })
    .join("");

  document.getElementById("panel-content").innerHTML = `
    <div class="multi-header">
      <span class="multi-count">${sats.length} OBJECTS SELECTED</span>
      <span class="multi-hint">Click any satellite to add</span>
    </div>
    <div class="multi-sat-list">${cards}</div>
  `;
}

// ── Sparkline ─────────────────────────────────────
function drawSparkline(id) {
  const svg = document.getElementById("sparkline-svg");
  const rng = document.getElementById("spark-range");
  const data = _history[id];
  if (!svg || !data || data.length < 2) return;

  const W = 280,
    H = 56,
    PAD = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const pts = data.map((v, i) => [
    PAD + (i / (data.length - 1)) * (W - PAD * 2),
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ]);

  const pathD = pts
    .map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`))
    .join(" ");
  const areaD = pathD + ` L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const lastY = pts[pts.length - 1][1];

  svg.innerHTML = `
    <defs>
      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#00c8ff" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#00c8ff" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <path d="${areaD}" fill="url(#sg)"/>
    <path d="${pathD}" fill="none" stroke="#00c8ff" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${pts[pts.length - 1][0]}" cy="${lastY}" r="4"
            fill="#00c8ff" filter="drop-shadow(0 0 6px #00c8ff)"/>
  `;
  if (rng) rng.textContent = min.toFixed(0) + " – " + max.toFixed(0) + " km";
}

// ── Remove button ─────────────────────────────────
function setupRemoveBtn(sat) {
  const btn = document.getElementById("remove-btn");
  let confirmed = false,
    timer = null;

  btn.addEventListener("click", async () => {
    if (!confirmed) {
      confirmed = true;
      btn.classList.add("confirming");
      btn.textContent = "CONFIRM REMOVAL — CLICK AGAIN";
      timer = setTimeout(() => {
        confirmed = false;
        btn.classList.remove("confirming");
        btn.textContent = "REMOVE FROM SIMULATION";
      }, 3500);
      return;
    }
    clearTimeout(timer);
    confirmed = false;
    btn.classList.remove("confirming");
    btn.disabled = true;
    btn.textContent = "REMOVING...";

    try {
      const result = await removeSatellite(sat.id, sat.name);
      window.satelliteMap = {};
      (result.satellites || []).forEach((s) => {
        window.satelliteMap[s.id] = s;
      });
      showImpactModal(result.impact, result.removed?.name || sat.name);
      window.dispatchEvent(
        new CustomEvent("satellites-updated", {
          detail: result.satellites || [],
        }),
      );
      window.dispatchEvent(
        new CustomEvent("collisions-updated", {
          detail: result.collisions || [],
        }),
      );
      renderCollisionAlerts(result.collisions || []);

      window.dispatchEvent(
        new CustomEvent("satellite-removed", { detail: { id: sat.id } }),
      );

      window.selectedSatellite = null;
      window.selectedSatellites = [];
      showToast((result.removed?.name || sat.name) + " removed", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "REMOVE FROM SIMULATION";
      showToast("Remove failed: " + (err?.message || "Unknown error"), "error");
    }
  });
}

// ── Impact modal ──────────────────────────────────
function showImpactModal(impact, satName) {
  document.getElementById("modal-title").textContent = "SATELLITE REMOVED";
  document.getElementById("modal-body").innerHTML = `
    <p class="m-sat">${satName}</p>
    <div class="m-big">${impact.collisions_resolved}</div>
    <div class="m-big-lbl">Collision Risks Cleared</div>
    <p class="m-summary">${impact.summary}</p>
  `;
  spawnParticles();
  const modal = document.getElementById("impact-modal");
  modal.style.display = "flex";
  const close = () => {
    modal.style.display = "none";
  };
  document.getElementById("modal-close-btn").onclick = close;
  modal.onclick = (e) => {
    if (e.target === modal) close();
  };
  const kh = (e) => {
    if (e.key === "Escape" || e.key.toLowerCase() === "f") {
      close();
      document.removeEventListener("keydown", kh);
    }
  };
  document.addEventListener("keydown", kh);
}

function spawnParticles() {
  const c = document.getElementById("m-particles");
  if (!c) return;
  c.innerHTML = "";
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("div");
    p.className = "m-particle";
    const angle = (i / 18) * 360;
    const dist = 80 + Math.random() * 100;
    const sx = Math.random() * 80 + 10 + "%";
    const sy = Math.random() * 60 + 20 + "%";
    const ex = Math.cos((angle * Math.PI) / 180) * dist + "px";
    const ey = Math.sin((angle * Math.PI) / 180) * dist + "px";
    const dur = 0.6 + Math.random() * 0.6 + "s";
    p.style.cssText = `--sx:${sx};--sy:${sy};--ex:${ex};--ey:${ey};--dur:${dur};left:${sx};top:${sy};background:${Math.random() > 0.5 ? "#00ffaa" : "#00c8ff"}`;
    c.appendChild(p);
  }
  setTimeout(() => {
    c.innerHTML = "";
  }, 1500);
}

// ── Add Satellite Form ────────────────────────────
export function initAddSatelliteForm() {
  const statusEl = document.getElementById("add-status");
  const btn = document.getElementById("inject-btn");
  const input1 = document.getElementById("tle-line1");
  const input2 = document.getElementById("tle-line2");

  input1.addEventListener("input", () => validateLine(input1, "1"));
  input2.addEventListener("input", () => validateLine(input2, "2"));

  document.querySelectorAll(".p-btn").forEach((pBtn) => {
    pBtn.addEventListener("click", async () => {
      const tle = PRESET_TLES[pBtn.dataset.tle];
      if (!tle) return;
      pBtn.classList.add("loading");
      await typewriter(input1, tle.line1, 14);
      await typewriter(input2, tle.line2, 14);
      pBtn.classList.remove("loading");
      validateLine(input1, "1");
      validateLine(input2, "2");
      input2.focus();
    });
  });

  document
    .getElementById("add-satellite-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const tle1 = input1.value.trim();
      const tle2 = input2.value.trim();
      if (!tle1.startsWith("1 ")) {
        showStatus(statusEl, "error", 'TLE Line 1 must start with "1 "');
        input1.classList.add("invalid");
        return;
      }
      if (!tle2.startsWith("2 ")) {
        showStatus(statusEl, "error", 'TLE Line 2 must start with "2 "');
        input2.classList.add("invalid");
        return;
      }

      btn.classList.add("loading");
      btn.disabled = true;
      showStatus(
        statusEl,
        "loading",
        "Injecting — running conjunction analysis...",
      );
      resetAlertHistory();

      try {
        const result = await addSatellite(tle1, tle2);
        window.dispatchEvent(
          new CustomEvent("satellites-updated", { detail: result.satellites }),
        );
        window.dispatchEvent(
          new CustomEvent("satellite-injected", { detail: result.added }),
        );

        if (result.new_collisions?.length > 0) {
          const highs = result.new_collisions.filter(
            (c) => c.risk === "HIGH",
          ).length;
          showStatus(
            statusEl,
            "warning",
            `${result.added.name} — ${result.new_collisions.length} conjunction(s) detected${highs ? ` (${highs} HIGH RISK)` : ""}`,
          );
          renderCollisionAlerts(result.new_collisions);
          showToast(
            `${result.new_collisions.length} new collision risk(s) detected`,
            "warning",
          );
        } else {
          showStatus(
            statusEl,
            "success",
            `${result.added.name} — no collision risks found`,
          );
          showToast(`${result.added.name} injected safely`, "success");
        }
        e.target.reset();
        input1.className = input2.className = "f-input";
      } catch (err) {
        showStatus(statusEl, "error", err?.message || "Injection failed");
        showToast("Injection failed", "error");
      } finally {
        btn.classList.remove("loading");
        btn.disabled = false;
      }
    });
}

function validateLine(el, startChar) {
  const val = el.value.trim();
  if (!val) {
    el.className = "f-input";
    return;
  }
  el.className =
    "f-input " + (val.startsWith(startChar + " ") ? "valid" : "invalid");
}

async function typewriter(el, text, speed = 16) {
  el.value = "";
  el.className = "f-input";
  for (const ch of text) {
    el.value += ch;
    await new Promise((r) => setTimeout(r, speed));
  }
}

function showStatus(el, type, msg) {
  el.className = `inject-status s-${type}`;
  el.style.display = "block";
  el.textContent = msg;
  if (type === "success")
    setTimeout(() => {
      el.style.display = "none";
    }, 5500);
}
