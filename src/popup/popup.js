import { send } from '../ui/messaging.js';
import { renderTasks, updateElapsed } from '../ui/tasks.js';
import { initI18n, watchLang, s } from '../lib/i18n.js';

const els = {
  weekLabel: document.getElementById('week-label'),
  active: document.getElementById('active'),
  taskList: document.getElementById('task-list'),
  newTaskInput: document.getElementById('new-task-input'),
  error: document.getElementById('error'),
  deviceLine: document.getElementById('device-line'),
};

let state = null;
let tick = null;

document.getElementById('open-dashboard').addEventListener('click', async () => {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/sidepanel.html') });
  }
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function submitNewTask() {
  const title = els.newTaskInput.value.trim();
  if (!title) { els.newTaskInput.focus(); return; }
  try {
    await send('addTask', { title });
    els.newTaskInput.value = '';
    await refresh();
    els.newTaskInput.focus();
  } catch (err) {
    showError(err.message);
  }
}
document.getElementById('add-task').addEventListener('click', submitNewTask);
els.newTaskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitNewTask();
});

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

async function refresh() {
  try {
    state = await send('getState');
    showError('');
    const str = s();
    els.weekLabel.textContent = str.weekLabel(state.week.week, state.week.year);
    els.deviceLine.textContent = str.deviceLine(state.filePrefix);
    renderTasks(els.active, els.taskList, state, refresh);
  } catch (err) {
    showError(err.message);
  }
}

// Init
watchLang();
await initI18n();
await refresh();
tick = setInterval(() => updateElapsed(els.active), 1000);
window.addEventListener('unload', () => clearInterval(tick));
