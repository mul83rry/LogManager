import { send } from './messaging.js';
import { formatDuration } from './util.js';
import { t } from '../lib/i18n.js';

export function renderTasks(activeEl, taskListEl, state, onRefresh) {
  renderActive(activeEl, state, onRefresh);
  renderTaskList(taskListEl, state, onRefresh);
}

export function updateElapsed(activeEl) {
  activeEl.querySelectorAll('.elapsed').forEach((el) => {
    const seconds = (Date.now() - new Date(el.dataset.start).getTime()) / 1000;
    el.textContent = formatDuration(seconds);
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
        <div style="font-size:.9rem;font-weight:600">${esc(timer.subtaskTitle)}</div>
        <div class="muted" style="font-size:.8rem">${esc(timer.taskTitle)}</div>
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
  const running = new Set(state.activeTimers.map((t) => t.subtaskId));
  container.innerHTML = '';

  if (tasks.length === 0) {
    container.innerHTML = `<div class="empty">${esc(t('noTasks')).replace('\n', '<br>')}</div>`;
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task';

    // header row
    const head = document.createElement('div');
    head.className = 'row between';
    head.style.marginBottom = '0.3rem';

    const titleSpan = makeEditableTitle(task.title, 'task-title', async (val) => {
      await send('renameTask', { taskId: task.id, title: val });
      onRefresh();
    });
    head.appendChild(titleSpan);

    const addSubBtn = iconBtn('+', '', t('addSubtaskTitle'));
    addSubBtn.style.fontSize = '0.85rem';
    addSubBtn.addEventListener('click', () =>
      promptInline(card, t('newSubtaskPlaceholder'), async (title) => {
        await send('addSubtask', { taskId: task.id, title });
        onRefresh();
      }),
    );
    head.appendChild(addSubBtn);
    card.appendChild(head);

    // subtask rows
    for (const sub of task.subtasks) {
      const row = document.createElement('div');
      row.className = 'subtask';
      const isRunning = running.has(sub.id);

      const subTitle = makeEditableTitle(sub.title, 'name', async (val) => {
        await send('renameSubtask', { taskId: task.id, subtaskId: sub.id, title: val });
        onRefresh();
      });
      subTitle.classList.add('grow');
      row.appendChild(subTitle);

      const btn = iconBtn(
        isRunning ? '■' : '▶',
        isRunning ? 'danger' : 'success',
        isRunning ? t('stopTimerTitle') : t('startTimerTitle'),
      );
      btn.addEventListener('click', async () => {
        if (isRunning) await send('stopTimer', { subtaskId: sub.id });
        else await send('startTimer', { taskId: task.id, subtaskId: sub.id });
        onRefresh();
      });
      row.appendChild(btn);
      card.appendChild(row);
    }

    container.appendChild(card);
  }
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

function promptInline(container, placeholder, onSubmit) {
  if (container.querySelector('.inline-prompt')) return;
  const wrap = document.createElement('div');
  wrap.className = 'inline-prompt row';
  wrap.style.marginTop = '0.4rem';
  const input = document.createElement('input');
  input.className = 'grow';
  input.placeholder = placeholder;
  const ok = iconBtn('✓', 'primary', t('saveTitle'));
  ok.style.fontSize = '0.9rem';
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

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
