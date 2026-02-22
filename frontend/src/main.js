// ════════════════════════════════════════════════
//  main.js — Orchestrator
// ════════════════════════════════════════════════

import { initPanel, initAddSatelliteForm } from './panel.js';
import { renderCollisionAlerts }           from './alerts.js';
import { updateDashboard, updateKessler }  from './dashboard.js';
import { startPolling }                    from './api.js';
import { showToast }                       from './toast.js';

initPanel();
initAddSatelliteForm();

window.satelliteMap      = {};
window.selectedSatellite = null;
window.highlightedPair   = null;

const panel      = document.getElementById('right-panel');
const toggleBtn  = document.getElementById('panel-toggle');
const toggleIcon = document.getElementById('toggle-icon');
const injectToggle = document.getElementById('inject-toggle');
const injectBody   = document.getElementById('inject-body');

let panelOpen  = true;
let injectOpen = true;

function togglePanel() {
  panelOpen = !panelOpen;
  panel.classList.toggle('collapsed', !panelOpen);
  toggleBtn.classList.toggle('collapsed', !panelOpen);
  toggleIcon.textContent = panelOpen ? '▶' : '◀';
}

toggleBtn.addEventListener('click', togglePanel);

injectToggle.addEventListener('click', () => {
  injectOpen = !injectOpen;
  injectBody.classList.toggle('collapsed', !injectOpen);
  injectToggle.classList.toggle('open', injectOpen);
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'p':
      togglePanel();
      break;

    case 'i': {
      if (!panelOpen) togglePanel();
      if (!injectOpen) {
        injectOpen = true;
        injectBody.classList.remove('collapsed');
        injectToggle.classList.add('open');
      }
      setTimeout(() => {
        document.getElementById('tle-line1')?.focus();
        document.getElementById('card-inject')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
      break;
    }

    // F key to deselect (was ESC)
    case 'f': {
      window.selectedSatellite = null;
      const modal = document.getElementById('impact-modal');
      if (modal && modal.style.display !== 'none') modal.style.display = 'none';
      break;
    }

    case 'escape': {
      const modal = document.getElementById('impact-modal');
      if (modal && modal.style.display !== 'none') modal.style.display = 'none';
      break;
    }
  }
});

let _firstData = true;

function onData(data) {
  if (_firstData) {
    _firstData = false;
    const placeholder = document.getElementById('globe-placeholder');
    if (placeholder) {
      placeholder.style.opacity = '0';
      placeholder.style.pointerEvents = 'none';
    }
  }

  // Update satellite lookup map
  window.satelliteMap = {};
  (data.satellites || []).forEach(s => { window.satelliteMap[s.id] = s; });

  updateDashboard(data);
  _lastKesslerData = data;
  updateKessler(data);
  renderCollisionAlerts(data.collisions || []);

  // Dispatch to globe.js
  window.dispatchEvent(new CustomEvent('satellites-updated', { detail: data.satellites || [] }));
  window.dispatchEvent(new CustomEvent('debris-updated',     { detail: data.debris     || [] }));
  window.dispatchEvent(new CustomEvent('collisions-updated', { detail: data.collisions || [] }));
}

function onError(err) {
  const tsEl = document.getElementById('stat-last-updated');
  if (tsEl) tsEl.textContent = 'SIGNAL LOST';
  const livePip = document.querySelector('.live-pip');
  if (livePip) { livePip.style.background = 'var(--red)'; livePip.style.boxShadow = '0 0 10px var(--red)'; }
  const liveTxt = document.querySelector('.live-txt');
  if (liveTxt) { liveTxt.textContent = 'ERROR'; liveTxt.style.color = 'var(--red)'; }
  console.error('[ORBITWATCH] Poll error:', err);
}

startPolling(onData, onError);

// Re-run kessler whenever selection changes (selection updates faster than the 5s poll)
let _lastKesslerIds = '';
let _lastKesslerData = null;
setInterval(() => {
  const ids = (window.selectedSatellites || []).map(s => s.id).join(',');
  if (ids !== _lastKesslerIds && _lastKesslerData) {
    _lastKesslerIds = ids;
    updateKessler(_lastKesslerData);
  }
}, 200);

// Highlight collision pair — called from alert card clicks
window.highlightCollisionPair = (sat1, sat2) => {
  window.highlightedPair = [sat1, sat2];
  window.dispatchEvent(new CustomEvent('highlight-pair', { detail: { sat1, sat2 } }));
  showToast(`Tracking: ${sat1} and ${sat2}`, 'success');
};
