// ════════════════════════════════════════════════
//  alerts.js — Conjunction alerts
// ════════════════════════════════════════════════

const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };

let _prevAlertIds  = new Set();
let _countdownMap  = {};
let _countdownTick = null;

let _audioCtx = null;
function getAudio() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  return _audioCtx;
}

function beep({ freq = 880, duration = 0.18, vol = 0.12, type = 'sine' } = {}) {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function alertBeep() {
  beep({ freq: 1046, duration: 0.12, vol: 0.10 });
  setTimeout(() => beep({ freq: 880, duration: 0.18, vol: 0.08 }), 140);
}

function parseCountdown(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Date.now() + secs * 1000;
}

function secsToDisplay(ms) {
  const total = Math.max(0, Math.floor((ms - Date.now()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export function renderCollisionAlerts(collisions) {
  const container = document.getElementById('alerts-container');
  const badge     = document.getElementById('alert-count');
  const alertDot  = document.querySelector('#card-alerts .head-dot.red');

  if (!collisions || collisions.length === 0) {
    container.innerHTML = `<div class="all-clear">ALL SYSTEMS NOMINAL</div>`;
    badge.textContent   = '0';
    badge.className     = 'count-pill clear';
    if (alertDot) alertDot.classList.remove('pulse');
    _prevAlertIds = new Set();
    _countdownMap = {};
    stopCountdownTick();
    return;
  }

  const sorted     = [...collisions].sort((a, b) => order[a.risk] - order[b.risk]);
  const currentIds = new Set(sorted.map(c => `${c.sat1}::${c.sat2}`));
  const newHighs   = sorted.filter(c => c.risk === 'HIGH' && !_prevAlertIds.has(`${c.sat1}::${c.sat2}`));

  sorted.forEach(c => {
    const key = `${c.sat1}::${c.sat2}`;
    if (!_countdownMap[key]) {
      _countdownMap[key] = { end: parseCountdown(c.time_to_closest) };
    }
  });
  Object.keys(_countdownMap).forEach(k => {
    if (!currentIds.has(k)) delete _countdownMap[k];
  });

  badge.textContent = collisions.length;
  badge.className   = 'count-pill';
  if (alertDot) alertDot.classList.toggle('pulse', newHighs.length > 0);

  // Note: countdown is time to closest approach — not guaranteed collision
  container.innerHTML = sorted.map((c, i) => {
    const rc    = c.risk.toLowerCase();
    const key   = `${c.sat1}::${c.sat2}`;
    const isNew = !_prevAlertIds.has(key);
    const timerClass = c.risk === 'HIGH' ? 'a-timer countdown' : 'a-timer';

    return `
      <div class="a-card a-${rc} ${isNew ? 'new-alert' : ''}"
           style="animation-delay:${i * 0.055}s"
           data-sat1="${c.sat1}"
           data-sat2="${c.sat2}"
           data-key="${key}"
           role="listitem">
        <div class="a-top">
          <span class="risk-chip chip-${rc}">${c.risk} RISK</span>
          <span class="${timerClass}" id="cd-${key.replace(/[^a-z0-9]/gi,'_')}">
            T- ${c.time_to_closest}
          </span>
        </div>
        <div class="a-pair">
          <span class="a-id" title="ID: ${c.sat1}">${c.sat1Name || c.sat1}</span>
          <span class="a-arrow">⟷</span>
          <span class="a-id" title="ID: ${c.sat2}">${c.sat2Name || c.sat2}</span>
        </div>
        <div class="a-dist">${c.distance_km} km separation at closest approach</div>
        <div class="a-note">Click to track on globe</div>
      </div>
    `;
  }).join('');

  // Attach click handlers after rendering
  container.querySelectorAll('.a-card').forEach(card => {
    card.addEventListener('click', () => {
      const sat1 = card.dataset.sat1;
      const sat2 = card.dataset.sat2;
      window.highlightCollisionPair?.(sat1, sat2);
    });
  });

  if (newHighs.length > 0) {
    alertBeep();
    triggerCollisionFlash();
    flashAlertCard();
  }

  _prevAlertIds = currentIds;
  startCountdownTick();
}

function startCountdownTick() {
  if (_countdownTick) return;
  _countdownTick = setInterval(tickCountdowns, 1000);
}

function stopCountdownTick() {
  if (_countdownTick) { clearInterval(_countdownTick); _countdownTick = null; }
}

function tickCountdowns() {
  Object.entries(_countdownMap).forEach(([key, { end }]) => {
    if (!end) return;
    const elId = 'cd-' + key.replace(/[^a-z0-9]/gi, '_');
    const el   = document.getElementById(elId);
    if (el) el.textContent = 'T- ' + secsToDisplay(end);
  });
}

function triggerCollisionFlash() {
  const el = document.getElementById('collision-flash');
  if (!el) return;
  el.classList.remove('active');
  void el.offsetWidth;
  el.classList.add('active');
  el.addEventListener('animationend', () => el.classList.remove('active'), { once: true });
}

function flashAlertCard() {
  const card = document.getElementById('card-alerts');
  if (!card) return;
  card.classList.remove('flash-border');
  void card.offsetWidth;
  card.classList.add('flash-border');
  card.addEventListener('animationend', () => card.classList.remove('flash-border'), { once: true });
}

export function resetAlertHistory() {
  _prevAlertIds = new Set();
}
