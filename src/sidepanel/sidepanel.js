import { send } from '../ui/messaging.js';
import {
  formatDuration,
  formatJalaliDateTime,
  escapeHtml,
  todayInputValue,
} from '../ui/util.js';
import { buildTextExport } from '../lib/format.js';

// ─── element refs ──────────────────────────────────────────────────────────
const els = {
  // tasks tab
  activeList: document.getElementById('active-list'),
  taskList: document.getElementById('task-list'),
  newTaskInput: document.getElementById('new-task-input'),
  // report tab
  from: document.getElementById('from-date'),
  to: document.getElementById('to-date'),
  rangeSummary: document.getElementById('range-summary'),
  filterToggle: document.getElementById('filter-toggle'),
  filterBody: document.getElementById('filter-body'),
  report: document.getElementById('report'),
  grandTotal: document.getElementById('grand-total'),
  exportText: document.getElementById('export-text'),
  // shared
  error: document.getElementById('error'),
};

els.from.value = todayInputValue();
els.to.value = todayInputValue();

let state = null;
let tick = null;

// ─── tabs ───────────────────────────────────────────────────────────────────
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

// ─── options ────────────────────────────────────────────────────────────────
document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── task tab logic ──────────────────────────────────────────────────────────
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
});

async function refreshTasks() {
  try {
    state = await send('getState');
    showError('');
    renderActive();
    renderTasks();
  } catch (err) {
    showError(err.message);
  }
}

function renderActive() {
  const timers = state.activeTimers;
  els.activeList.innerHTML = '';
  if (timers.length === 0) return; // hide the section when nothing is running
  for (const t of timers) {
    const div = document.createElement('div');
    div.className = 'timer';
    div.innerHTML = `
      <div class="grow">
        <div style="font-size:.9rem">${escapeHtml(t.subtaskTitle)}</div>
        <div class="muted">${escapeHtml(t.taskTitle)}</div>
      </div>
      <span class="elapsed mono" data-start="${t.startTimestamp}">00:00</span>
      <button class="danger" data-stop="${t.subtaskId}">توقف</button>`;
    els.activeList.appendChild(div);
  }
  els.activeList.querySelectorAll('[data-stop]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await send('stopTimer', { subtaskId: btn.dataset.stop });
      await refreshTasks();
    }),
  );
  updateElapsed();
}

function renderTasks() {
  const tasks = state.file.tasks;
  const running = new Set(state.activeTimers.map((t) => t.subtaskId));
  els.taskList.innerHTML = '';
  if (tasks.length === 0) {
    els.taskList.innerHTML = '<div class="empty">هنوز تسکی نساخته‌اید.<br>از فرم پایین شروع کنید.</div>';
    return;
  }
  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task';
    const head = document.createElement('div');
    head.className = 'row between';
    head.innerHTML = `<span class="title">${escapeHtml(task.title)}</span>`;
    const addBtn = document.createElement('button');
    addBtn.className = 'ghost';
    addBtn.style.fontSize = '0.8rem';
    addBtn.textContent = '+ ساب‌تسک';
    addBtn.addEventListener('click', () => promptInline(card, 'نام ساب‌تسک', async (title) => {
      await send('addSubtask', { taskId: task.id, title });
      await refreshTasks();
    }));
    head.appendChild(addBtn);
    card.appendChild(head);

    for (const sub of task.subtasks) {
      const row = document.createElement('div');
      row.className = 'subtask';
      const isRunning = running.has(sub.id);
      row.innerHTML = `<span class="name grow">${escapeHtml(sub.title)}</span>`;
      const btn = document.createElement('button');
      btn.style.fontSize = '0.8rem';
      btn.className = isRunning ? 'danger' : 'success';
      btn.textContent = isRunning ? 'توقف' : 'شروع';
      btn.addEventListener('click', async () => {
        if (isRunning) await send('stopTimer', { subtaskId: sub.id });
        else await send('startTimer', { taskId: task.id, subtaskId: sub.id });
        await refreshTasks();
      });
      row.appendChild(btn);
      card.appendChild(row);
    }
    els.taskList.appendChild(card);
  }
}

function updateElapsed() {
  els.activeList.querySelectorAll('.elapsed').forEach((el) => {
    const seconds = (Date.now() - new Date(el.dataset.start).getTime()) / 1000;
    el.textContent = formatDuration(seconds);
  });
}

// ─── report tab logic ────────────────────────────────────────────────────────
els.filterToggle.addEventListener('click', () => {
  const open = els.filterToggle.getAttribute('aria-expanded') === 'true';
  els.filterToggle.setAttribute('aria-expanded', String(!open));
  els.filterBody.hidden = open;
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
    els.rangeSummary.textContent =
      `${formatJalaliDateTime(from).split(' ')[0]} تا ${formatJalaliDateTime(to).split(' ')[0]}`;
    els.filterToggle.setAttribute('aria-expanded', 'false');
    els.filterBody.hidden = true;
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

// ─── shared helpers ──────────────────────────────────────────────────────────
function showError(err) {
  els.error.textContent = err || '';
  els.error.hidden = !err;
}

function promptInline(container, placeholder, onSubmit) {
  if (container.querySelector('.inline-prompt')) return;
  const wrap = document.createElement('div');
  wrap.className = 'inline-prompt row';
  wrap.style.marginTop = '0.4rem';
  const input = document.createElement('input');
  input.className = 'grow';
  input.placeholder = placeholder;
  const ok = document.createElement('button');
  ok.className = 'primary';
  ok.style.fontSize = '0.8rem';
  ok.textContent = 'ذخیره';
  const submit = async () => {
    const value = input.value.trim();
    if (value) await onSubmit(value);
    wrap.remove();
  };
  ok.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') wrap.remove();
  });
  wrap.append(input, ok);
  container.appendChild(wrap);
  input.focus();
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
  setTimeout(() => { btn.textContent = original; }, 1200);
}

// ─── init ────────────────────────────────────────────────────────────────────
refreshTasks();
tick = setInterval(updateElapsed, 1000);
window.addEventListener('unload', () => clearInterval(tick));
// Pre-load this week's report silently so it's ready when user switches tab.
applyPreset('this-week');
