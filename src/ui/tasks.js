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

    // ── task header ──────────────────────────────────────────────────────
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
    delBtn.addEventListener('click', () => confirmDelete(card, async () => {
      await send('deleteTask', { taskId: task.id });
      onRefresh();
    }));

    actions.append(addSubBtn, delBtn);
    head.appendChild(actions);
    card.appendChild(head);

    // ── subtasks ─────────────────────────────────────────────────────────
    for (const sub of task.subtasks) {
      card.appendChild(buildSubtaskRow(task.id, sub, running.has(sub.id), onRefresh));
    }

    container.appendChild(card);
  }
}

function buildSubtaskRow(taskId, sub, isRunning, onRefresh) {
  const wrap = document.createElement('div');
  wrap.className = 'subtask-wrap';

  // main row
  const row = document.createElement('div');
  row.className = 'subtask';

  const subTitle = makeEditableTitle(sub.title, 'name', async (val) => {
    await send('renameSubtask', { taskId, subtaskId: sub.id, title: val });
    onRefresh();
  });
  subTitle.classList.add('grow');
  row.appendChild(subTitle);

  // description toggle
  const descBtn = iconBtn('≡', 'ghost', t('addDescription'));
  descBtn.style.fontSize = '0.9rem';
  descBtn.addEventListener('click', () => {
    const area = wrap.querySelector('.sub-desc-area');
    area.hidden = !area.hidden;
    if (!area.hidden) area.querySelector('textarea, .sub-desc-text')?.focus?.();
  });

  // timer button
  const timerBtn = iconBtn(isRunning ? '■' : '▶', isRunning ? 'danger' : 'success',
    isRunning ? t('stopTimerTitle') : t('startTimerTitle'));
  timerBtn.addEventListener('click', async () => {
    if (isRunning) await send('stopTimer', { subtaskId: sub.id });
    else await send('startTimer', { taskId, subtaskId: sub.id });
    onRefresh();
  });

  // delete subtask
  const delBtn = iconBtn('✕', 'ghost-danger', t('deleteSubtask'));
  delBtn.addEventListener('click', () => confirmDelete(wrap, async () => {
    await send('deleteSubtask', { taskId, subtaskId: sub.id });
    onRefresh();
  }));

  row.append(descBtn, timerBtn, delBtn);
  wrap.appendChild(row);

  // ── description area (hidden by default) ──────────────────────────────
  const descArea = document.createElement('div');
  descArea.className = 'sub-desc-area';
  descArea.hidden = !sub.description; // show if already has content

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

  return wrap;
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
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ta.blur();
  });
  return ta;
}

// ── helpers ────────────────────────────────────────────────────────────────

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

/**
 * Replace `container`'s content with a "حذف شود؟ [بله] [خیر]" strip.
 * Reverts automatically after 4 s if no action taken.
 */
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
  const dismiss = () => wrap.remove();
  ok.addEventListener('click', submit);
  cancel.addEventListener('click', dismiss);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') dismiss();
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
