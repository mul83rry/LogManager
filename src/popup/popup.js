import { send } from '../ui/messaging.js';
import { formatDuration, escapeHtml } from '../ui/util.js';

const els = {
  weekLabel: document.getElementById('week-label'),
  activeList: document.getElementById('active-list'),
  taskList: document.getElementById('task-list'),
  error: document.getElementById('error'),
  deviceLine: document.getElementById('device-line'),
};

let state = null;
let tick = null;

document.getElementById('open-dashboard').addEventListener('click', async () => {
  // Open the side-panel dashboard; fall back to a tab if the API is missing.
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
  }
});

document.getElementById('add-task').addEventListener('click', () => {
  promptInline(els.taskList, 'نام تسک جدید', async (title) => {
    await send('addTask', { title });
    await refresh();
  });
});

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

async function refresh() {
  try {
    state = await send('getState');
    showError('');
    render();
  } catch (err) {
    showError(err.message);
  }
}

function render() {
  els.weekLabel.textContent = `هفته ${state.week.week} / ${state.week.year}`;
  els.deviceLine.textContent = `دستگاه: ${state.filePrefix}`;
  renderActive();
  renderTasks();
}

function renderActive() {
  const timers = state.activeTimers;
  els.activeList.innerHTML = '';
  if (timers.length === 0) {
    els.activeList.innerHTML = '<div class="muted">تایمری در حال اجرا نیست.</div>';
    return;
  }
  for (const t of timers) {
    const div = document.createElement('div');
    div.className = 'timer';
    div.innerHTML = `
      <div class="grow">
        <div class="title">${escapeHtml(t.subtaskTitle)}</div>
        <div class="muted">${escapeHtml(t.taskTitle)}</div>
      </div>
      <span class="elapsed mono" data-start="${t.startTimestamp}">00:00</span>
      <button class="danger" data-stop="${t.subtaskId}">توقف</button>`;
    els.activeList.appendChild(div);
  }
  els.activeList.querySelectorAll('[data-stop]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await send('stopTimer', { subtaskId: btn.dataset.stop });
      await refresh();
    }),
  );
  updateElapsed();
}

function renderTasks() {
  const tasks = state.file.tasks;
  const running = new Set(state.activeTimers.map((t) => t.subtaskId));
  els.taskList.innerHTML = '';
  if (tasks.length === 0) {
    els.taskList.innerHTML = '<div class="empty">هنوز تسکی نساخته‌اید.</div>';
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
    addBtn.textContent = '+ ساب‌تسک';
    addBtn.addEventListener('click', () =>
      promptInline(card, 'نام ساب‌تسک', async (title) => {
        await send('addSubtask', { taskId: task.id, title });
        await refresh();
      }),
    );
    head.appendChild(addBtn);
    card.appendChild(head);

    for (const sub of task.subtasks) {
      const row = document.createElement('div');
      row.className = 'subtask';
      const isRunning = running.has(sub.id);
      row.innerHTML = `<span class="name grow">${escapeHtml(sub.title)}</span>`;
      const btn = document.createElement('button');
      btn.className = isRunning ? 'danger' : 'success';
      btn.textContent = isRunning ? 'توقف' : 'شروع';
      btn.addEventListener('click', async () => {
        if (isRunning) await send('stopTimer', { subtaskId: sub.id });
        else await send('startTimer', { taskId: task.id, subtaskId: sub.id });
        await refresh();
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

function promptInline(container, placeholder, onSubmit) {
  const wrap = document.createElement('div');
  wrap.className = 'row';
  wrap.style.marginTop = '0.4rem';
  const input = document.createElement('input');
  input.className = 'grow';
  input.placeholder = placeholder;
  const ok = document.createElement('button');
  ok.className = 'primary';
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

refresh();
tick = setInterval(updateElapsed, 1000);
window.addEventListener('unload', () => clearInterval(tick));
