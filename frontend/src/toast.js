// ════════════════════════════════════════════════
//  toast.js — Non-blocking toast notifications
// ════════════════════════════════════════════════

let _container = null;

function getContainer() {
  if (!_container) {
    _container = document.getElementById('toast-container');
  }
  return _container;
}

/**
 * Show a toast message
 * @param {string} message
 * @param {'success'|'warning'|'error'} type
 * @param {number} duration — ms before auto-remove
 */
export function showToast(message, type = 'success', duration = 3200) {
  const container = getContainer();
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');

  // Set CSS variable so the fade-out animation fires exactly at duration
  toast.style.setProperty('--toast-duration', duration + 'ms');
  toast.style.animationDuration      = `0.45s, 0.4s`;
  toast.style.animationDelay         = `0s, ${duration}ms`;
  toast.style.animationFillMode      = `both, forwards`;
  toast.style.animationTimingFunction = `cubic-bezier(0.34,1.56,0.64,1), cubic-bezier(0.16,1,0.3,1)`;
  toast.style.animationName           = `toast-in, toast-out`;

  container.appendChild(toast);

  // Remove from DOM after animation fully completes
  setTimeout(() => toast.remove(), duration + 450);
}