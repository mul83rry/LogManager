import { send } from '../ui/messaging.js';
import { formatDuration, formatJalaliDateTime, escapeHtml, todayInputValue } from '../ui/util.js';
import { buildTextExport } from '../lib/format.js';
import { renderTasks, updateElapsed } from '../ui/tasks.js';
import { initI18n, watchLang, t, s } from '../lib/i18n.js';

// ─── element refs ──────────────────────────────────────────────────────────
const els = {
  activeList: document.getElementById('active-list'),
  taskList: document.getElementById('task-list'),
  newTaskInput: document.getElementById('new-task-input'),
  from: document.getElementById('from-date'),
  to: document.getElementById('to-date'),
  rangeSummary: document.getElementById('range-summary'),
  filterToggle: document.getElementById('filter-toggle'),
  filterBody: document.getElementById('filter-body'),
  report: document.getElementById('report'),
  grandTotal: document.getElementById('grand-total'),
  exportText: document.getElementById('export-text'),
  error: document.getElementById('error'),
};

els.from.value = todayInputValue();
els.to.value = todayInputValue();

let state = null;

// ─── tabs ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((btn) =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)),
);
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === name),
  );
  document.getElementById('tab-tasks').hidden = name !== 'tasks';
  document.getElementById('tab-report').hidden = name !== 'report';
}

// ─── options ───────────────────────────────────────────────────────────────
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── task tab ──────────────────────────────────────────────────────────────
async function submitNewTask() {
  const title = els.newTaskInput.value.trim();
  if (!title) { els.newTaskInput.focus(); return; }
  try {
    await send('addTask', { title });
    els.newTaskInput.value = '';
    await refreshTasks();
    els.newTaskInput.focus();
  } catch (err) {
    showError(err.message);
  }
}
document.getElementById('add-task').addEventListener('click', submitNewTask);
els.newTaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitNewTask();
  if (e.key === 'Escape') { els.newTaskInput.value = ''; els.newTaskInput.blur(); }
});

async function refreshTasks() {
  try {
    state = await send('getState');
    showError('');
    renderTasks(els.activeList, els.taskList, state, refreshTasks);
  } catch (err) {
    showError(err.message);
  }
}

// ─── report tab ────────────────────────────────────────────────────────────
els.filterToggle.addEventListener('click', () => {
  const open = els.filterToggle.getAttribute('aria-expanded') === 'true';
  els.filterToggle.setAttribute('aria-expanded', String(!open));
  els.filterBody.hidden = open;
});

document.querySelectorAll('[data-preset]').forEach((btn) =>
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset)),
);
document.getElementById('apply-range').addEventListener('click', () =>
  loadRange(new Date(els.from.value), new Date(els.to.value)),
);

document.getElementById('copy-text').addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.exportText.value);
  const btn = document.getElementById('copy-text');
  const orig = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = orig; }, 1200);
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
  const offset = (d.getDay() + 1) % 7;
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
    const d0 = formatJalaliDateTime(from).split(' ')[0];
    const d1 = formatJalaliDateTime(to).split(' ')[0];
    els.rangeSummary.textContent = `${d0} ${t('toLabel')} ${d1}`;
    els.filterToggle.setAttribute('aria-expanded', 'false');
    els.filterBody.hidden = true;
  } catch (err) {
    els.error.textContent = err.message;
    els.error.hidden = false;
  }
}

function renderReport(report) {
  els.grandTotal.textContent = s().totalLabel(formatDuration(report.totalSeconds));
  els.exportText.value = buildTextExport(report) || t('noRangeData');

  if (report.tasks.length === 0) {
    els.report.innerHTML = `<div class="empty">${escapeHtml(t('noReport'))}</div>`;
    return;
  }
  els.report.innerHTML = '';

  // Width of the longest task bar = 100%; others are proportional.
  const maxSec = Math.max(...report.tasks.map((tk) => tk.totalSeconds), 1);

  for (const task of report.tasks) {
    const card = document.createElement('div');
    card.className = 'report-task';

    // header: title + total duration
    const head = document.createElement('div');
    head.className = 'report-task-head';
    head.innerHTML = `<span class="rtitle">${escapeHtml(task.title)}</span>
      <span class="rdur mono">${formatDuration(task.totalSeconds)}</span>`;
    card.appendChild(head);

    // task bar (proportional to max task)
    const taskPct = task.totalSeconds ? (task.totalSeconds / maxSec) * 100 : 0;
    card.insertAdjacentHTML('beforeend',
      `<div class="dur-bar"><div class="dur-bar-fill" style="width:${taskPct.toFixed(1)}%"></div></div>`);

    // date range
    if (task.range) {
      const rangeEl = document.createElement('div');
      rangeEl.className = 'report-range';
      rangeEl.textContent =
        `${formatJalaliDateTime(task.range.start)} ← ${formatJalaliDateTime(task.range.end)}`;
      card.appendChild(rangeEl);
    }

    // subtasks
    if (task.subtasks.length > 0) {
      const subsWrap = document.createElement('div');
      subsWrap.className = 'report-subs';
      for (const sub of task.subtasks) {
        const item = document.createElement('div');
        item.className = 'report-sub-item';

        const row = document.createElement('div');
        row.className = 'report-sub-row';
        row.innerHTML = `<span class="report-sub-name">${escapeHtml(sub.title)}</span>
          <span class="report-sub-dur mono">${formatDuration(sub.totalSeconds)}</span>`;
        item.appendChild(row);

        // sub bar (proportional to task total)
        const subPct = task.totalSeconds
          ? (sub.totalSeconds / task.totalSeconds) * 100 : 0;
        item.insertAdjacentHTML('beforeend',
          `<div class="dur-bar" style="height:3px">
             <div class="dur-bar-fill sub" style="width:${subPct.toFixed(1)}%"></div>
           </div>`);

        if (sub.description) {
          const desc = document.createElement('div');
          desc.className = 'report-sub-desc';
          desc.textContent = sub.description;
          item.appendChild(desc);
        }
        subsWrap.appendChild(item);
      }
      card.appendChild(subsWrap);
    }

    els.report.appendChild(card);
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────
function showError(err) {
  els.error.textContent = err || '';
  els.error.hidden = !err;
}
function toInputValue(date) {
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}
function p2(n) { return String(n).padStart(2, '0'); }

// ─── init ──────────────────────────────────────────────────────────────────
watchLang();
await initI18n();
await refreshTasks();
setInterval(() => updateElapsed(els.activeList), 1000);
applyPreset('this-week');
