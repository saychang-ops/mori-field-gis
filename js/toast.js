const DEFAULT_DURATION = 2500;

export function showToast(message, level = 'success', durationMs = DEFAULT_DURATION) {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.warn('toast:', level, message);
    return;
  }
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}
