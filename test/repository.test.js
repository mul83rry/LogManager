import test from 'node:test';
import assert from 'node:assert/strict';

// --- in-memory chrome.storage.local stub, installed before importing the
//     repository (which reads chrome at module-eval time only indirectly). ----
const store = new Map();
globalThis.chrome = {
  storage: {
    local: {
      async get(query) {
        if (query == null) return Object.fromEntries(store);
        if (typeof query === 'string') {
          return store.has(query) ? { [query]: store.get(query) } : {};
        }
        const out = {};
        for (const k of query) if (store.has(k)) out[k] = store.get(k);
        return out;
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj)) store.set(k, v);
      },
      async remove(key) {
        const keys = Array.isArray(key) ? key : [key];
        for (const k of keys) store.delete(k);
      },
    },
  },
};

const repo = await import('../src/lib/repository.js');
const { setDeviceLabel } = await import('../src/lib/device.js');

test('end-to-end: add task/subtask, log time, report on this week', async () => {
  store.clear();
  await setDeviceLabel('Laptop-Ali');

  const task = await repo.addTask('توسعه فرانت‌اند');
  const sub = await repo.addSubtask(task.id, 'کد زدن هدر');

  const now = new Date();
  const start = new Date(now.getTime() - 1800 * 1000).toISOString();
  await repo.appendLog({
    taskId: task.id,
    taskTitle: task.title,
    subtaskId: sub.id,
    subtaskTitle: sub.title,
    type: 'system_start',
    timestamp: start,
  });
  await repo.appendLog({
    taskId: task.id,
    taskTitle: task.title,
    subtaskId: sub.id,
    subtaskTitle: sub.title,
    type: 'system_stop',
    timestamp: now.toISOString(),
    durationSeconds: 1800,
  });

  // The file lands under the friendly label prefix.
  const files = await repo.listAllWeekFiles();
  assert.equal(files.length, 1);
  assert.equal(files[0].deviceId, 'Laptop-Ali');

  const report = await repo.getReportForWeeks([repo.weekOf()]);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].totalSeconds, 1800);
  assert.equal(report.tasks[0].subtasks[0].totalSeconds, 1800);
});

test('mid-week rename updates the current week file (edge case §4.3)', async () => {
  store.clear();
  await setDeviceLabel('Laptop-Ali');
  const task = await repo.addTask('نام قدیمی');
  await repo.renameTask(task.id, 'نام جدید');
  const file = await repo.getCurrentWeekFile();
  assert.equal(file.tasks[0].title, 'نام جدید');
});

test('two devices for the same week produce two files and aggregate together', async () => {
  store.clear();
  const provider = await (await import('../src/lib/cloud/provider.js')).getProvider();
  const { week, year } = repo.weekOf();
  const w = String(week).padStart(2, '0');
  const ts = new Date().toISOString();

  const make = (device) =>
    JSON.stringify({
      device_id: device,
      week_number: week,
      year,
      last_updated: ts,
      tasks: [
        {
          id: 't1',
          title: 'مشترک',
          subtasks: [
            {
              id: 's1',
              title: 'کار',
              logs: [
                { type: 'system_start', timestamp: ts, duration_seconds: 0 },
                { type: 'system_stop', timestamp: ts, duration_seconds: 600 },
              ],
            },
          ],
        },
      ],
    });

  await provider.write(`a1b2_W${w}_Y${year}.json`, make('a1b2'));
  await provider.write(`e5f6_W${w}_Y${year}.json`, make('e5f6'));

  const files = await repo.listAllWeekFiles();
  assert.equal(files.length, 2);

  const report = await repo.getReportForWeeks([{ week, year }]);
  // Same task id on both devices -> summed.
  assert.equal(report.tasks.length, 1);
  assert.equal(report.totalSeconds, 1200);
});
