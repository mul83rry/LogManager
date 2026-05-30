// Background service worker: timer engine, weekly rollover, and the message
// router used by the popup, side panel, and options pages.

import { getDevice, getDeviceFilePrefix, setDeviceLabel } from '../lib/device.js';
import {
  ensureCurrentWeekFile,
  getCurrentWeekFile,
  addTask,
  addSubtask,
  renameTask,
  renameSubtask,
  appendLog,
  getReportForDateRange,
  getReportForWeeks,
  weekOf,
  listAllWeekFiles,
} from '../lib/repository.js';
import {
  getCloudSettings,
  setCloudSettings,
  getProvider,
} from '../lib/cloud/provider.js';

const ACTIVE_KEY = 'activeTimers';

// --- lifecycle ---------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  await getDevice(); // generate device id on first install
  await ensureCurrentWeekFile();
  scheduleRollover();
  // Make clicking the toolbar icon open the side panel on supporting browsers.
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureCurrentWeekFile();
  scheduleRollover();
});

function scheduleRollover() {
  // Check often enough that a new week's file is created promptly after the
  // Saturday 00:00 boundary, and that a long-running timer is noticed.
  chrome.alarms.create('rollover', { periodInMinutes: 15 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'rollover') {
    await ensureCurrentWeekFile();
  }
});

// --- active timer state ------------------------------------------------------

async function getActiveTimers() {
  const { [ACTIVE_KEY]: timers } = await chrome.storage.local.get(ACTIVE_KEY);
  return timers || [];
}

async function setActiveTimers(timers) {
  await chrome.storage.local.set({ [ACTIVE_KEY]: timers });
  updateBadge(timers.length);
}

function updateBadge(count) {
  if (!chrome.action) return;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
}

async function startTimer(taskId, subtaskId) {
  const file = await getCurrentWeekFile();
  const task = file.tasks.find((t) => t.id === taskId);
  const subtask = task?.subtasks.find((s) => s.id === subtaskId);
  if (!task || !subtask) throw new Error('Task or subtask not found.');

  // Auto-pause: stop every currently running timer before starting the new one.
  const running = await getActiveTimers();
  for (const t of running) {
    if (t.subtaskId !== subtaskId) await stopTimer(t.subtaskId);
  }

  const fresh = await getActiveTimers();
  if (fresh.some((t) => t.subtaskId === subtaskId)) {
    return { alreadyRunning: true };
  }

  const startTimestamp = new Date().toISOString();
  await appendLog({
    taskId,
    taskTitle: task.title,
    subtaskId,
    subtaskTitle: subtask.title,
    type: 'system_start',
    timestamp: startTimestamp,
  });
  fresh.push({ taskId, taskTitle: task.title, subtaskId, subtaskTitle: subtask.title, startTimestamp });
  await setActiveTimers(fresh);
  return { startTimestamp };
}

async function stopTimer(subtaskId) {
  const timers = await getActiveTimers();
  const idx = timers.findIndex((t) => t.subtaskId === subtaskId);
  if (idx === -1) throw new Error('No running timer for this subtask.');
  const timer = timers[idx];

  const stopTimestamp = new Date().toISOString();
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timer.startTimestamp).getTime()) / 1000),
  );
  // appendLog routes by timestamp, so a stop after midnight Saturday lands in
  // the new week's file automatically (§4.4).
  await appendLog({
    taskId: timer.taskId,
    taskTitle: timer.taskTitle,
    subtaskId: timer.subtaskId,
    subtaskTitle: timer.subtaskTitle,
    type: 'system_stop',
    timestamp: stopTimestamp,
    durationSeconds,
  });

  timers.splice(idx, 1);
  await setActiveTimers(timers);
  return { stopTimestamp, durationSeconds };
}

// --- message router ----------------------------------------------------------

const handlers = {
  async getState() {
    const [device, file, timers, cloud] = await Promise.all([
      getDevice(),
      getCurrentWeekFile(),
      getActiveTimers(),
      getCloudSettings(),
    ]);
    const provider = await getProvider();
    return {
      device,
      filePrefix: await getDeviceFilePrefix(),
      week: weekOf(),
      file,
      activeTimers: timers,
      cloud: { ...cloud, connected: await provider.isConnected() },
    };
  },

  getActiveTimers,
  getCurrentWeekFile,

  addTask: ({ title }) => addTask(title),
  addSubtask: ({ taskId, title }) => addSubtask(taskId, title),
  renameTask: ({ taskId, title }) => renameTask(taskId, title),
  renameSubtask: ({ taskId, subtaskId, title }) => renameSubtask(taskId, subtaskId, title),

  startTimer: ({ taskId, subtaskId }) => startTimer(taskId, subtaskId),
  stopTimer: ({ subtaskId }) => stopTimer(subtaskId),

  getReportForDateRange: ({ fromDate, toDate }) =>
    getReportForDateRange(new Date(fromDate), new Date(toDate)),
  getThisWeekReport: () => getReportForWeeks([weekOf()]),
  listWeekFiles: () => listAllWeekFiles(),

  setDeviceLabel: async ({ label }) => {
    const device = await setDeviceLabel(label);
    await ensureCurrentWeekFile(); // create a file under the new prefix
    return device;
  },

  setCloudSettings: ({ patch }) => setCloudSettings(patch),
  async cloudConnect() {
    const provider = await getProvider();
    await provider.connect();
    await ensureCurrentWeekFile();
    return { connected: await provider.isConnected() };
  },
  async cloudDisconnect() {
    const provider = await getProvider();
    await provider.disconnect();
    return { connected: false };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.cmd];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown command: ${message?.cmd}` });
    return false;
  }
  Promise.resolve(handler(message))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true; // keep the channel open for the async response
});
