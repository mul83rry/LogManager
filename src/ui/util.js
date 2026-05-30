// Small DOM/format helpers shared by the popup and side panel.
// Re-exports the pure formatters so UI code has a single import surface.

export {
  formatDuration,
  formatJalaliDate,
  formatJalaliDateTime,
  formatTime,
} from '../lib/format.js';

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
  );
}

/** Today's date as a yyyy-mm-dd string for <input type="date"> values. */
export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
