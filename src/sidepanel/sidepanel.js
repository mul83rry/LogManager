import { send } from '../ui/messaging.js';
import { formatDuration, formatJalaliDateTime, escapeHtml, todayInputValue } from '../ui/util.js';
import { buildTextExport, buildMarkdownReport } from '../lib/format.js';
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
let currentReport = null;
let currentFrom = null;
let currentTo = null;

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
    currentReport = report;
    currentFrom = from;
    currentTo = to;
    renderReport(report);
    renderSummary(report, state?.projects || []);
    const d0 = fmtJalali(from).split(' ')[0];
    const d1 = fmtJalali(to).split(' ')[0];
    els.rangeSummary.textContent = `${d0} ${t('toLabel')} ${d1}`;
    els.filterToggle.setAttribute('aria-expanded', 'false');
    els.filterBody.hidden = true;
  } catch (err) {
    els.error.textContent = err.message;
    els.error.hidden = false;
  }
}

// ─── summary / charts ──────────────────────────────────────────────────────

function renderSummary(report, projects) {
  const section = document.getElementById('summary-section');
  if (!report.totalSeconds) { section.hidden = true; return; }
  section.hidden = false;

  document.getElementById('summary-total').textContent = formatDuration(report.totalSeconds);
  const top = [...report.tasks].sort((a, b) => b.totalSeconds - a.totalSeconds)[0];
  document.getElementById('summary-top').textContent = top ? top.title : '—';

  const taskColors = buildColorMap(report.tasks, projects);

  const chartWrap = document.getElementById('chart-bars-wrap');
  chartWrap.innerHTML = '';
  if (report.byDay?.length) {
    chartWrap.appendChild(buildBarChartSvg(report.byDay, taskColors));
  }

  const donutWrap = document.getElementById('donut-wrap');
  donutWrap.innerHTML = '';
  donutWrap.appendChild(buildDonutSvg(report.tasks, taskColors, report.totalSeconds));

  const projList = document.getElementById('proj-list-chart');
  projList.innerHTML = '';
  const maxSec = Math.max(...report.tasks.map((t) => t.totalSeconds), 1);
  for (const task of [...report.tasks].sort((a, b) => b.totalSeconds - a.totalSeconds)) {
    if (!task.totalSeconds) continue;
    const pct = Math.round((task.totalSeconds / report.totalSeconds) * 100);
    const barPct = (task.totalSeconds / maxSec) * 100;
    const color = taskColors.get(task.id) || '#3b82f6';
    const row = document.createElement('div');
    row.className = 'proj-chart-row';
    row.innerHTML =
      `<span class="proj-chart-name">${escapeHtml(task.title)}</span>` +
      `<span class="proj-chart-time mono">${formatDuration(task.totalSeconds)}</span>` +
      `<div class="proj-chart-bar-wrap"><div class="proj-chart-bar" style="width:${barPct.toFixed(1)}%;background:${color}"></div></div>` +
      `<span class="proj-chart-pct muted">${pct}%</span>`;
    projList.appendChild(row);
  }
}

function buildColorMap(tasks, projects) {
  const projMap = new Map((projects || []).map((p) => [p.id, p.color]));
  const fallback = ['#3b82f6', '#ec4899', '#eab308', '#22c55e', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444'];
  const colorMap = new Map();
  let idx = 0;
  for (const task of tasks) {
    const c = (task.projectId && projMap.get(task.projectId)) || fallback[idx++ % fallback.length];
    colorMap.set(task.id, c);
  }
  return colorMap;
}

function buildBarChartSvg(byDay, taskColors) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const n = byDay.length;
  const CHART_H = 110;
  const LABEL_TOP = 16; // space above bars for total labels
  const LABEL_BTM = 18; // space below bars for day labels
  const TOTAL_H = CHART_H + LABEL_TOP + LABEL_BTM;
  const BAR_W = Math.max(12, Math.min(38, Math.floor(260 / n) - 4));
  const GAP = Math.max(2, Math.floor((260 - n * BAR_W) / Math.max(n - 1, 1)));
  const CHART_W = n * (BAR_W + GAP) - GAP;

  const maxDay = Math.max(...byDay.map((d) => d.tasks.reduce((s, t) => s + t.seconds, 0)), 1);

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${CHART_W} ${TOTAL_H}`);
  svg.setAttribute('width', '100%');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  byDay.forEach(({ day, tasks }, i) => {
    const dayTotal = tasks.reduce((s, t) => s + t.seconds, 0);
    const x = i * (BAR_W + GAP);
    const chartBottom = LABEL_TOP + CHART_H;

    // Stacked bars (bottom to top, sorted by task id for consistency)
    let yBottom = chartBottom;
    for (const task of [...tasks].sort((a, b) => a.id.localeCompare(b.id))) {
      const segH = Math.max(1, (task.seconds / maxDay) * CHART_H);
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', yBottom - segH);
      rect.setAttribute('width', BAR_W);
      rect.setAttribute('height', segH);
      rect.setAttribute('fill', taskColors.get(task.id) || '#3b82f6');
      rect.setAttribute('rx', '2');
      svg.appendChild(rect);
      yBottom -= segH;
    }

    // Total label above bar
    if (dayTotal > 0) {
      const totalBarH = (dayTotal / maxDay) * CHART_H;
      const lbl = document.createElementNS(svgNS, 'text');
      lbl.setAttribute('x', x + BAR_W / 2);
      lbl.setAttribute('y', chartBottom - totalBarH - 3);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-size', '8');
      lbl.setAttribute('fill', '#c0c0c0');
      lbl.textContent = fmtShort(dayTotal);
      svg.appendChild(lbl);
    }

    // Day label below bar
    const d = new Date(day + 'T12:00:00');
    const dayLbl = document.createElementNS(svgNS, 'text');
    dayLbl.setAttribute('x', x + BAR_W / 2);
    dayLbl.setAttribute('y', TOTAL_H - 3);
    dayLbl.setAttribute('text-anchor', 'middle');
    dayLbl.setAttribute('font-size', '8');
    dayLbl.setAttribute('fill', '#aaaaaa');
    dayLbl.textContent = DAY_ABBR[d.getDay()] + ' ' + d.getDate();
    svg.appendChild(dayLbl);
  });

  return svg;
}

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtShort(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}h` : `${m}m`;
}

function buildDonutSvg(tasks, taskColors, totalSec) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.style.width = '80px';
  svg.style.height = '80px';
  svg.style.flexShrink = '0';

  const CX = 50, CY = 50, R_OUT = 44, R_IN = 30;
  let angle = -90;

  for (const task of tasks) {
    if (!task.totalSeconds) continue;
    const sweep = (task.totalSeconds / totalSec) * 360;
    const color = taskColors.get(task.id) || '#3b82f6';
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', donutArc(CX, CY, R_OUT, R_IN, angle, angle + sweep));
    path.setAttribute('fill', color);
    svg.appendChild(path);
    angle += sweep;
  }

  // center text
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const txt = document.createElementNS(svgNS, 'text');
  txt.setAttribute('x', '50');
  txt.setAttribute('y', '50');
  txt.setAttribute('text-anchor', 'middle');
  txt.setAttribute('dominant-baseline', 'central');
  txt.setAttribute('font-size', '12');
  txt.setAttribute('fill', '#e0e0e0');
  txt.setAttribute('font-weight', 'bold');
  txt.textContent = `${h}:${String(m).padStart(2, '0')}`;
  svg.appendChild(txt);

  return svg;
}

function donutArc(cx, cy, ro, ri, startDeg, endDeg) {
  const rad = (d) => (d * Math.PI) / 180;
  const pt = (deg, r) => ({ x: cx + r * Math.cos(rad(deg)), y: cy + r * Math.sin(rad(deg)) });
  const large = (endDeg - startDeg) > 180 ? 1 : 0;
  const [o1, o2, i1, i2] = [pt(startDeg, ro), pt(endDeg, ro), pt(startDeg, ri), pt(endDeg, ri)];
  const f = (v) => v.toFixed(3);
  return [
    `M ${f(o1.x)} ${f(o1.y)}`,
    `A ${ro} ${ro} 0 ${large} 1 ${f(o2.x)} ${f(o2.y)}`,
    `L ${f(i2.x)} ${f(i2.y)}`,
    `A ${ri} ${ri} 0 ${large} 0 ${f(i1.x)} ${f(i1.y)}`,
    'Z',
  ].join(' ');
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
        `${fmtJalali(task.range.start)} ← ${fmtJalali(task.range.end)}`;
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

// ─── MD download ───────────────────────────────────────────────────────────
document.getElementById('download-md').addEventListener('click', () => {
  if (!currentReport || !currentFrom || !currentTo) return;
  const md = buildMarkdownReport(currentReport, currentFrom, currentTo);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-report-${toInputValue(currentFrom)}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── helpers ───────────────────────────────────────────────────────────────
const toPersian = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const fmtJalali = (ts) => {
  const s = formatJalaliDateTime(ts);
  return document.documentElement.getAttribute('dir') === 'rtl' ? toPersian(s) : s;
};

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

// Restore persisted panel width; default is 640px (set via CSS).
const { panelWidth } = await chrome.storage.local.get('panelWidth');
if (panelWidth) document.body.style.minWidth = panelWidth + 'px';

// Wait 2 s for the panel to finish expanding to its restored min-width, THEN
// read the settled width and start polling for changes.
// (Immediate polling races with panel expansion and saves the pre-expansion value.)
setTimeout(() => {
  let _w = window.innerWidth;
  if (_w > 200) chrome.storage.local.set({ panelWidth: _w });
  setInterval(() => {
    const w = window.innerWidth;
    if (w > 200 && w !== _w) { _w = w; chrome.storage.local.set({ panelWidth: w }); }
  }, 800);
}, 2000);

await refreshTasks();
setInterval(() => updateElapsed(els.activeList), 1000);
applyPreset('this-week');
