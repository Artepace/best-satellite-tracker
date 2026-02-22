// ════════════════════════════════════════════════
//  dashboard.js — HUD metrics, Orbital Risk Index
// ════════════════════════════════════════════════

const _prev = {};

export function updateDashboard(data) {
  const sats = data.satellites?.length ?? 0;
  const deb = data.debris?.length ?? 0;
  const high = data.collisions?.filter((c) => c.risk === "HIGH").length ?? 0;
  const med = data.collisions?.filter((c) => c.risk === "MEDIUM").length ?? 0;

  animateTo("stat-satellites", sats);
  animateTo("stat-debris", deb);
  animateTo("stat-high-risk", high);
  animateTo("stat-med-risk", med);

  const ts = formatTimestamp(data.last_updated);
  setTs("stat-last-updated", ts);
  setTs("stat-last-updated-panel", ts);

  const highEl = document.getElementById("stat-high-risk");
  if (highEl) highEl.classList.toggle("pulse-anim", high > 0);
}

// Called every tick — reads window.selectedSatellites for context
// Uses risk_assessment from the data (backend or mock) instead of computing locally
export function updateKessler(data) {
  const fill = document.getElementById("kessler-fill");
  const glow = document.getElementById("kessler-glow");
  const ksVal = document.getElementById("kessler-score");
  const labelEl = document.getElementById("kessler-label");
  const track = document
    .getElementById("card-kessler")
    ?.querySelector(".kessler-bar-track");
  const unitEl = document.getElementById("kessler-unit");
  const hintEl = document.getElementById("kessler-hint");

  const selected = window.selectedSatellites || [];

  // ── No object selected: show prompt ──────────────
  if (selected.length === 0) {
    if (fill) fill.style.width = "0%";
    if (glow) glow.style.left = "0%";
    if (track) track.setAttribute("aria-valuenow", 0);
    if (ksVal) {
      ksVal.textContent = "—";
      ksVal.style.color = "var(--text-2)";
    }
    if (labelEl) {
      labelEl.textContent = "SELECT OBJECT";
      labelEl.style.color = "var(--text-2)";
    }
    if (unitEl) unitEl.style.opacity = "0.3";
    if (hintEl) {
      hintEl.textContent =
        "Select a satellite to view the orbital risk index";
      hintEl.style.display = "block";
    }
    _prev["kessler-score"] = 0;
    return;
  }

  if (hintEl) hintEl.style.display = "none";
  if (unitEl) unitEl.style.opacity = "1";

  // ── Use risk_assessment from backend / mock data ──
  const ra = data.risk_assessment || { score: 0, label: "NOMINAL" };
  const raw = ra.score;

  if (fill) fill.style.width = raw + "%";
  if (glow) glow.style.left = Math.max(0, raw - 1.5) + "%";
  if (track) track.setAttribute("aria-valuenow", raw);

  animateTo("kessler-score", raw);

  const label = ra.label || "NOMINAL";
  let color = "var(--green)";
  if (label === "CRITICAL") color = "var(--red)";
  else if (label === "ELEVATED" || label === "DANGER" || label === "CAUTION")
    color = "var(--amber)";

  if (labelEl) {
    labelEl.textContent = label;
    labelEl.style.color = color;
  }
  if (ksVal) {
    ksVal.style.color = color;
  }
}

function animateTo(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = _prev[id] ?? 0;
  if (prev === target) return;
  if (id !== "kessler-score") {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  _prev[id] = target;
  let frame = 0;
  const steps = 16;
  const ease = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
  const iv = setInterval(() => {
    frame++;
    const val = Math.round(prev + (target - prev) * ease(frame / steps));
    el.textContent = val;
    if (frame >= steps) {
      el.textContent = target;
      clearInterval(iv);
    }
  }, 22);
}

function setTs(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatTimestamp(iso) {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
  } catch {
    return "--";
  }
}
