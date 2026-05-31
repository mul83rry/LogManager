import { send } from './messaging.js';
import { formatDuration } from './util.js';
import { t } from '../lib/i18n.js';

export function renderTasks(activeEl, taskListEl, state, onRefresh) {
  renderActive(activeEl, state, onRefresh);
  renderTaskList(taskListEl, state, onRefresh);
}

export function updateElapsed(activeEl) {
  activeEl.querySelectorAll('.elapsed').forEach((el) => {
    const s = (Date.now() - new Date(el.dataset.start).getTime()) / 1000;
    el.textContent = formatDuration(s);
  });
}

// ── active timers strip ────────────────────────────────────────────────────

function renderActive(container, state, onRefresh) {
  container.innerHTML = '';
  if (state.activeTimers.length === 0) return;
  for (const timer of state.activeTimers) {
    const div = document.createElement('div');
    div.className = 'timer';
    div.innerHTML = `
      <div class="grow">
        <div class="timer-sub">${esc(timer.subtaskTitle)}</div>
        <div class="muted timer-task">${esc(timer.taskTitle)}</div>
      </div>
      <span class="elapsed mono" data-start="${timer.startTimestamp}">00:00</span>`;
    const stopBtn = iconBtn('■', 'danger', t('stopTimerTitle'));
    stopBtn.addEventListener('click', async () => {
      await send('stopTimer', { subtaskId: timer.subtaskId });
      onRefresh();
    });
    div.appendChild(stopBtn);
    container.appendChild(div);
  }
  updateElapsed(container);
}

// ── task list ──────────────────────────────────────────────────────────────

function renderTaskList(container, state, onRefresh) {
  const tasks = state.file.tasks;
  const running = new Set(state.activeTimers.map((a) => a.subtaskId));
  container.innerHTML = '';

  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty">${esc(t('noTasks')).replace('\n', '<br>')}</div>`;
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task';

    // task header
    const head = document.createElement('div');
    head.className = 'row between task-head';
    const titleSpan = makeEditableTitle(task.title, 'task-title', async (val) => {
      await send('renameTask', { taskId: task.id, title: val });
      onRefresh();
    });
    head.appendChild(titleSpan);

    const actions = document.createElement('div');
    actions.className = 'row task-actions';
    const addSubBtn = iconBtn('+', '', t('addSubtaskTitle'));
    addSubBtn.addEventListener('click', () =>
      promptInline(card, t('newSubtaskPlaceholder'), async (title) => {
        await send('addSubtask', { taskId: task.id, title });
        onRefresh();
      }),
    );
    const delBtn = iconBtn('✕', 'ghost-danger', t('deleteTask'));
    delBtn.addEventListener('click', () =>
      confirmDelete(card, async () => {
        await send('deleteTask', { taskId: task.id });
        onRefresh();
      }),
    );
    actions.append(addSubBtn, delBtn);
    head.appendChild(actions);
    card.appendChild(head);

    for (const sub of task.subtasks) {
      card.appendChild(buildSubtaskRow(task.id, sub, running.has(sub.id), onRefresh));
    }
    container.appendChild(card);
  }
}

// ── subtask row ────────────────────────────────────────────────────────────

function buildSubtaskRow(taskId, sub, isRunning, onRefresh) {
  const wrap = document.createElement('div');
  wrap.className = 'subtask-wrap';

  // main row
  const row = document.createElement('div');
  row.className = 'subtask';

  const subTitle = makeEditableTitle(sub.title, 'name grow', async (val) => {
    await send('renameSubtask', { taskId, subtaskId: sub.id, title: val });
    onRefresh();
  });
  row.appendChild(subTitle);

  // description toggle (≡)
  const descBtn = iconBtn('≡', 'ghost', t('addDescription'));
  descBtn.addEventListener('click', () => togglePanel(wrap, '.sub-desc-area'));

  // log/time panel toggle (⏱)
  const logBtn = iconBtn('⏱', 'ghost', t('logsBtn'));
  logBtn.addEventListener('click', () => togglePanel(wrap, '.log-panel'));

  // timer button (▶ / ■)
  const timerBtn = iconBtn(
    isRunning ? '■' : '▶',
    isRunning ? 'danger' : 'success',
    isRunning ? t('stopTimerTitle') : t('startTimerTitle'),
  );
  timerBtn.addEventListener('click', async () => {
    if (isRunning) await send('stopTimer', { subtaskId: sub.id });
    else await send('startTimer', { taskId, subtaskId: sub.id });
    onRefresh();
  });

  // delete subtask (✕)
  const delBtn = iconBtn('✕', 'ghost-danger', t('deleteSubtask'));
  delBtn.addEventListener('click', () =>
    confirmDelete(wrap, async () => {
      await send('deleteSubtask', { taskId, subtaskId: sub.id });
      onRefresh();
    }),
  );

  row.append(descBtn, logBtn, timerBtn, delBtn);
  wrap.appendChild(row);

  // description panel
  const descArea = document.createElement('div');
  descArea.className = 'sub-desc-area';
  descArea.hidden = !sub.description;
  if (sub.description) {
    descArea.appendChild(makeDescriptionEditor(taskId, sub, onRefresh));
  } else {
    const addBtn = document.createElement('button');
    addBtn.className = 'ghost sub-desc-add';
    addBtn.textContent = t('addDescription') + '…';
    addBtn.addEventListener('click', () => {
      addBtn.remove();
      descArea.appendChild(makeDescriptionEditor(taskId, sub, onRefresh));
    });
    descArea.appendChild(addBtn);
  }
  wrap.appendChild(descArea);

  // log panel (hidden by default)
  const logPanel = buildLogPanel(taskId, sub, onRefresh);
  logPanel.hidden = true;
  wrap.appendChild(logPanel);

  return wrap;
}

// ── log / interval panel ───────────────────────────────────────────────────

function buildLogPanel(taskId, sub, onRefresh) {
  const panel = document.createElement('div');
  panel.className = 'log-panel';

  const pairs = pairLogsWithIndices(sub.logs);

  if (pairs.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted log-empty';
    empty.textContent = t('noLogs');
    panel.appendChild(empty);
  }

  for (const { startIdx, stopIdx } of pairs) {
    panel.appendChild(buildIntervalRow(taskId, sub, startIdx, stopIdx, onRefresh));
  }

  // add manual interval button
  const addBtn = document.createElement('button');
  addBtn.className = 'ghost log-add-btn';
  addBtn.textContent = t('addInterval');
  addBtn.addEventListener('click', () => {
    addBtn.hidden = true;
    buildAddIntervalForm(panel, taskId, sub, onRefresh, addBtn);
  });
  panel.appendChild(addBtn);

  return panel;
}

function buildIntervalRow(taskId, sub, startIdx, stopIdx, onRefresh) {
  const wrap = document.createElement('div');
  wrap.className = 'log-interval';

  const startLog = startIdx != null ? sub.logs[startIdx] : null;
  const stopLog = stopIdx != null ? sub.logs[stopIdx] : null;

  // duration display (recalculated live)
  const durSpan = document.createElement('span');
  durSpan.className = 'log-dur muted mono';

  function refreshDur(startTs, endTs) {
    if (startTs && endTs) {
      const secs = Math.max(0, (new Date(endTs) - new Date(startTs)) / 1000);
      durSpan.textContent = formatDuration(secs);
    } else {
      durSpan.textContent = '';
    }
  }
  refreshDur(startLog?.timestamp, stopLog?.timestamp);

  // start row
  const startRow = document.createElement('div');
  startRow.className = 'log-row';
  const startLabel = document.createElement('span');
  startLabel.className = 'log-label muted';
  startLabel.textContent = t('logStart');
  startRow.appendChild(startLabel);

  if (startLog) {
    const startInput = makeDTInput(startLog.timestamp);
    let debounce = null;
    startInput.addEventListener('change', () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const newTs = fromDatetimeLocal(startInput.value);
        refreshDur(newTs, stopLog?.timestamp);
        await send('updateLog', { taskId, subtaskId: sub.id, logIndex: startIdx, timestamp: newTs });
      }, 400);
    });
    startRow.appendChild(startInput);
  } else {
    const ph = document.createElement('span');
    ph.className = 'muted';
    ph.style.fontSize = '0.78rem';
    ph.textContent = '—';
    startRow.appendChild(ph);
  }
  wrap.appendChild(startRow);

  // end row
  const endRow = document.createElement('div');
  endRow.className = 'log-row';
  const endLabel = document.createElement('span');
  endLabel.className = 'log-label muted';
  endLabel.textContent = t('logEnd');
  endRow.appendChild(endLabel);

  if (stopLog) {
    const endInput = makeDTInput(stopLog.timestamp);
    let debounce = null;
    endInput.addEventListener('change', () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const newTs = fromDatetimeLocal(endInput.value);
        refreshDur(startLog?.timestamp, newTs);
        await send('updateLog', { taskId, subtaskId: sub.id, logIndex: stopIdx, timestamp: newTs });
      }, 400);
    });
    endRow.appendChild(endInput);
  } else {
    const running = document.createElement('span');
    running.className = 'tag live';
    running.style.fontSize = '0.75rem';
    running.textContent = t('logRunning');
    endRow.appendChild(running);
  }

  // footer: duration + delete
  const footer = document.createElement('div');
  footer.className = 'log-footer row';
  footer.appendChild(durSpan);

  const delIntervalBtn = iconBtn('✕', 'ghost-danger', t('deleteInterval'));
  delIntervalBtn.addEventListener('click', async () => {
    // Delete stop log first (higher index), then start log.
    const indices = [stopIdx, startIdx].filter((i) => i != null).sort((a, b) => b - a);
    for (const idx of indices) {
      await send('deleteLog', { taskId, subtaskId: sub.id, logIndex: idx });
    }
    wrap.remove();
  });
  footer.appendChild(delIntervalBtn);
  endRow.appendChild(footer);

  wrap.appendChild(endRow);
  return wrap;
}

function buildAddIntervalForm(panel, taskId, sub, onRefresh, addBtn) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600 * 1000);

  const form = document.createElement('div');
  form.className = 'log-interval log-add-form';

  const startRow = document.createElement('div');
  startRow.className = 'log-row';
  startRow.innerHTML = `<span class="log-label muted">${esc(t('logStart'))}</span>`;
  const startInput = makeDTInput(oneHourAgo.toISOString());
  startRow.appendChild(startInput);

  const endRow = document.createElement('div');
  endRow.className = 'log-row';
  endRow.innerHTML = `<span class="log-label muted">${esc(t('logEnd'))}</span>`;
  const endInput = makeDTInput(now.toISOString());
  const actions = document.createElement('div');
  actions.className = 'log-footer row';
  const saveBtn = iconBtn('✓', 'primary', t('saveTitle'));
  const cancelBtn = iconBtn('✕', 'ghost', t('cancelTitle'));
  saveBtn.addEventListener('click', async () => {
    const startTs = fromDatetimeLocal(startInput.value);
    const endTs = fromDatetimeLocal(endInput.value);
    if (new Date(endTs) <= new Date(startTs)) return;
    await send('addManualInterval', { taskId, subtaskId: sub.id, startTs, endTs });
    form.remove();
    onRefresh();
  });
  cancelBtn.addEventListener('click', () => {
    form.remove();
    addBtn.hidden = false;
  });
  actions.append(saveBtn, cancelBtn);
  endRow.appendChild(endInput);
  endRow.appendChild(actions);

  form.append(startRow, endRow);
  panel.insertBefore(form, addBtn);
  startInput.focus();
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Pair log entries into { startIdx, stopIdx } objects (indices into logs[]). */
function pairLogsWithIndices(logs) {
  const pairs = [];
  let openIdx = null;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].type === 'system_start') {
      if (openIdx !== null) pairs.push({ startIdx: openIdx, stopIdx: null });
      openIdx = i;
    } else if (logs[i].type === 'system_stop') {
      pairs.push({ startIdx: openIdx, stopIdx: i });
      openIdx = null;
    }
  }
  if (openIdx !== null) pairs.push({ startIdx: openIdx, stopIdx: null });
  return pairs;
}

/** ISO timestamp → `<input type="datetime-local">` value (local time). */
function toDatetimeLocal(isoStr) {
  const d = new Date(isoStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${day}T${h}:${mi}`;
}

/** `<input type="datetime-local">` value → ISO UTC timestamp string. */
function fromDatetimeLocal(localStr) {
  return new Date(localStr).toISOString();
}

function makeDTInput(isoStr) {
  const input = document.createElement('input');
  input.type = 'datetime-local';
  input.className = 'log-dt-input grow';
  input.step = '60';
  input.value = toDatetimeLocal(isoStr);
  return input;
}

function togglePanel(wrap, selector) {
  const panel = wrap.querySelector(selector);
  if (panel) panel.hidden = !panel.hidden;
}

function makeDescriptionEditor(taskId, sub, onRefresh) {
  const ta = document.createElement('textarea');
  ta.className = 'sub-desc-input';
  ta.value = sub.description || '';
  ta.placeholder = t('descriptionPlaceholder');
  ta.rows = 2;
  let saveTimer = null;
  ta.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await send('setSubtaskDescription', { taskId, subtaskId: sub.id, description: ta.value });
    }, 700);
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') ta.blur(); });
  return ta;
}

function iconBtn(symbol, variant, tooltip = '') {
  const btn = document.createElement('button');
  btn.className = `icon${variant ? ' ' + variant : ''}`;
  btn.textContent = symbol;
  if (tooltip) btn.title = tooltip;
  return btn;
}

function makeEditableTitle(title, className, onSave) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = title;
  span.title = t('editTitleHint');
  span.style.cursor = 'text';
  span.addEventListener('click', () => {
    const input = document.createElement('input');
    input.value = span.textContent;
    input.style.cssText =
      'font:inherit;font-weight:inherit;width:100%;background:var(--surface-2);' +
      'color:var(--text);border:1px solid var(--primary);border-radius:6px;padding:0.1rem 0.35rem;';
    span.replaceWith(input);
    input.select();
    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const val = input.value.trim();
      span.textContent = val || title;
      input.replaceWith(span);
      if (val && val !== title) await onSave(val);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = title; input.blur(); }
    });
  });
  return span;
}

function confirmDelete(container, onConfirm) {
  const prev = container.innerHTML;
  const strip = document.createElement('div');
  strip.className = 'delete-confirm row';
  strip.innerHTML = `<span class="grow" style="font-size:.85rem">${esc(t('confirmDelete'))}</span>`;
  const yes = iconBtn('✓', 'danger', t('yes'));
  const no = iconBtn('✕', 'ghost', t('no'));
  const cancel = () => { container.innerHTML = prev; };
  yes.addEventListener('click', onConfirm);
  no.addEventListener('click', cancel);
  strip.append(yes, no);
  container.innerHTML = '';
  container.appendChild(strip);
  const timer = setTimeout(cancel, 4000);
  yes.addEventListener('click', () => clearTimeout(timer));
}

export function promptInline(container, placeholder, onSubmit) {
  if (container.querySelector('.inline-prompt')) return;
  const wrap = document.createElement('div');
  wrap.className = 'inline-prompt row';
  const input = document.createElement('input');
  input.className = 'grow';
  input.placeholder = placeholder;
  const ok = iconBtn('✓', 'primary', t('saveTitle'));
  const cancel = iconBtn('✕', 'ghost', t('cancelTitle'));
  const submit = async () => {
    const value = input.value.trim();
    if (value) await onSubmit(value);
    wrap.remove();
  };
  ok.addEventListener('click', submit);
  cancel.addEventListener('click', () => wrap.remove());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') wrap.remove();
  });
  wrap.append(input, ok, cancel);
  container.appendChild(wrap);
  input.focus();
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
