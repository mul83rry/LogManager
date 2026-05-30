import { send } from '../ui/messaging.js';
import {
  formatDuration,
  formatJalaliDateTime,
  escapeHtml,
  todayInputValue,
} from '../ui/util.js';
import { buildTextExport } from '../lib/format.js';

const els = {
  from: document.getElementById('from-date'),
  to: document.getElementById('to-date'),
  rangeSummary: document.getElementById('range-summary'),
  report: document.getElementById('report'),
  grandTotal: document.getElementById('grand-total'),
  exportText: document.getElementById('export-text'),
  error: document.getElementById('error'),
};

els.from.value = todayInputValue();
els.to.value = todayInputValue();

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.querySelectorAll('[data-preset]').forEach((btn) =>
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset)),
);
document.getElementById('apply-range').addEventListener('click', () => {
  loadRange(new Date(els.from.value), new Date(els.to.value));
});

document.getElementById('copy-text').addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.exportText.value);
  flash(document.getElementById('copy-text'), 'کپی شد!');
});
document.getElementById('download-text').addEventListener('click', () => {
  const blob = new Blob([els.exportText.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-report-${todayInputValue()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

function startOfWeekSaturday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Iranian week starts Saturday; JS getDay(): Sat = 6.
  const offset = (d.getDay() + 1) % 7; // days since Saturday
  d.setDate(d.getDate() - offset);
  return d;
}

function applyPreset(preset) {
  const today = new Date();
  let from;
  let to = today;
  if (preset === 'this-week') {
    from = startOfWeekSaturday(today);
  } else if (preset === 'last-week') {
    const thisWeek = startOfWeekSaturday(today);
    from = new Date(thisWeek);
    from.setDate(from.getDate() - 7);
    to = new Date(thisWeek);
    to.setDate(to.getDate() - 1);
  } else {
    from = new Date(today);
    from.setDate(from.getDate() - 29);
  }
  els.from.value = toInputValue(from);
  els.to.value = toInputValue(to);
  loadRange(from, to);
}

async function loadRange(from, to) {
  try {
    els.error.hidden = true;
    const report = await send('getReportForDateRange', {
      fromDate: from.toISOString(),
      toDate: to.toISOString(),
    });
    renderReport(report);
    els.rangeSummary.textContent =
      `${formatJalaliDateTime(from).split(' ')[0]} تا ${formatJalaliDateTime(to).split(' ')[0]}`;
  } catch (err) {
    els.error.textContent = err.message;
    els.error.hidden = false;
  }
}

function renderReport(report) {
  els.grandTotal.textContent = `کل: ${formatDuration(report.totalSeconds)}`;
  els.exportText.value = buildTextExport(report) || '— داده‌ای برای این بازه نیست —';

  if (report.tasks.length === 0) {
    els.report.innerHTML = '<div class="empty">برای این بازه گزارشی وجود ندارد.</div>';
    return;
  }
  els.report.innerHTML = '';
  for (const task of report.tasks) {
    const card = document.createElement('div');
    card.className = 'report-task';
    const range = task.range
      ? `${formatJalaliDateTime(task.range.start)} - ${formatJalaliDateTime(task.range.end)}`
      : 'بدون بازه کامل';
    card.innerHTML = `
      <div class="row between">
        <span class="title">${escapeHtml(task.title)}</span>
        <span class="mono tag">${formatDuration(task.totalSeconds)}</span>
      </div>
      <div class="muted mono">${range}</div>`;
    for (const sub of task.subtasks) {
      const row = document.createElement('div');
      row.className = 'report-sub';
      row.innerHTML = `
        <span>${escapeHtml(sub.title)}</span>
        <span class="dur mono">${formatDuration(sub.totalSeconds)}</span>`;
      card.appendChild(row);
    }
    els.report.appendChild(card);
  }
}

function toInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function pad2(n) {
  return String(n).padStart(2, '0');
}

function flash(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = original;
  }, 1200);
}

// Default view: the current week.
applyPreset('this-week');
