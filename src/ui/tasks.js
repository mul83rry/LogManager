// Shared task-card renderer used by both popup and side panel.
//
// Features:
//   - Click on a task or subtask title to rename it inline (id stays intact).
//   - Start/stop timer buttons; only one timer can run at a time (auto-pause
//     handled by the service worker).
//   - "+ ساب‌تسک" inline prompt per task.

import { send } from './messaging.js';
import { escapeHtml, formatDuration } from './util.js';

/**
 * Render the active-timer strip into `activeEl` and the task list into
 * `taskListEl`, using `state` from `getState`. Calls `onRefresh()` after any
 * mutating action.
 */
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
  for (const t of state.activeTimers) {
    const div = document.createElement('div');
    div.className = 'timer';
    div.innerHTML = `
      <div class="grow">
        <div style="font-size:.9rem;font-weight:600">${escapeHtml(t.subtaskTitle)}</div>
        <div class="muted" style="font-size:.8rem">${escapeHtml(t.taskTitle)}</div>
      </div>
      <span class="elapsed mono" data-start="${t.startTimestamp}">00:00</span>
      <button class="danger" data-stop="${t.subtaskId}">توقف</button>`;
    container.appendChild(div);
  }
  container.querySelectorAll('[data-stop]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await send('stopTimer', { subtaskId: btn.dataset.stop });
      onRefresh();
    }),
  );
  updateElapsed(container);
}

// ── task list ──────────────────────────────────────────────────────────────

function renderTaskList(container, state, onRefresh) {
  const tasks = state.file.tasks;
  const running = new Set(state.activeTimers.map((t) => t.subtaskId));
  container.innerHTML = '';

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty">هنوز تسکی نساخته‌اید.<br>از فرم پایین شروع کنید.</div>';
    return;
  }

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task';

    // ── task header ────────────────────────────────────────────────────────
    const head = document.createElement('div');
    head.className = 'row between';

    const titleSpan = makeEditableTitle(
      task.title,
      'task-title',
      async (newTitle) => {
        await send('renameTask', { taskId: task.id, title: newTitle });
        onRefresh();
      },
    );
    head.appendChild(titleSpan);

    const addSubBtn = document.createElement('button');
    addSubBtn.className = 'ghost';
    addSubBtn.style.fontSize = '0.8rem';
    addSubBtn.textContent = '+ ساب‌تسک';
    addSubBtn.addEventListener('click', () =>
      promptInline(card, 'نام ساب‌تسک', async (title) => {
        await send('addSubtask', { taskId: task.id, title });
        onRefresh();
      }),
    );
    head.appendChild(addSubBtn);
    card.appendChild(head);

    // ── subtasks ──────────────────────────────────────────────────────────
    for (const sub of task.subtasks) {
      const row = document.createElement('div');
      row.className = 'subtask';
      const isRunning = running.has(sub.id);

      const subTitle = makeEditableTitle(
        sub.title,
        'name',
        async (newTitle) => {
          await send('renameSubtask', { taskId: task.id, subtaskId: sub.id, title: newTitle });
          onRefresh();
        },
      );
      subTitle.classList.add('grow');
      row.appendChild(subTitle);

      const btn = document.createElement('button');
      btn.style.fontSize = '0.8rem';
      btn.className = isRunning ? 'danger' : 'success';
      btn.textContent = isRunning ? 'توقف' : 'شروع';
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

/**
 * Create a <span> that turns into an <input> on click for inline renaming.
 * `className` is added to the span so callers can style it (e.g. 'task-title').
 */
function makeEditableTitle(title, className, onSave) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = title;
  span.title = 'کلیک برای ویرایش نام';
  span.style.cursor = 'text';

  span.addEventListener('click', () => {
    const input = document.createElement('input');
    input.value = span.textContent;
    input.style.cssText = [
      'font:inherit', 'font-weight:inherit', 'width:100%',
      'background:var(--surface-2)', 'color:var(--text)',
      'border:1px solid var(--primary)', 'border-radius:6px',
      'padding:0.1rem 0.35rem',
    ].join(';');

    span.replaceWith(input);
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return;
      saved = true;
      const val = input.value.trim();
      // Restore the span immediately (optimistic UI); refresh brings true state.
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
