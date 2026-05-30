// Repository — the sharded-file layer that sits between the app logic and the
// cloud provider. It knows about device ids, Jalali weeks, and the file-name
// convention, and exposes task/timer operations in those terms.

import { getProvider } from './cloud/provider.js';
import { getDeviceFilePrefix } from './device.js';
import {
  jalaliWeek,
  weekFileName,
  parseWeekFileName,
} from './jalali.js';
import {
  createWeekFile,
  createTask,
  createSubtask,
  upsertTask,
  upsertSubtask,
  createLog,
  touch,
} from './model.js';
import { aggregateReport } from './aggregate.js';

/** The Jalali { week, year } for a timestamp (defaults to now). */
export function weekOf(date = new Date()) {
  return jalaliWeek(date);
}

/** List every week file in the cloud folder, parsed into { deviceId, week, year, name }. */
export async function listAllWeekFiles() {
  const provider = await getProvider();
  const names = await provider.list();
  const parsed = [];
  for (const name of names) {
    const info = parseWeekFileName(name);
    if (info) parsed.push({ ...info, name });
  }
  return parsed;
}

/** Read + parse a single week file by name, or null if missing/corrupt. */
async function readFile(name) {
  const provider = await getProvider();
  const raw = await provider.read(name);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeFile(file) {
  const provider = await getProvider();
  const name = weekFileName(file.device_id, file.week_number, file.year);
  await provider.write(name, JSON.stringify(touch(file), null, 2));
  return name;
}

/**
 * Load this device's file for a given week, creating an in-memory empty one if
 * it does not exist yet (not persisted until something is written).
 */
async function loadOwnWeekFile(week, year) {
  const prefix = await getDeviceFilePrefix();
  const name = weekFileName(prefix, week, year);
  const existing = await readFile(name);
  return existing || createWeekFile(prefix, week, year);
}

/**
 * Ensure this device's current-week file exists in the cloud (PRD §3.1
 * "automatic file creation" at the start of each week). Safe to call often.
 */
export async function ensureCurrentWeekFile() {
  const { week, year } = weekOf();
  const prefix = await getDeviceFilePrefix();
  const name = weekFileName(prefix, week, year);
  const existing = await readFile(name);
  if (!existing) {
    await writeFile(createWeekFile(prefix, week, year));
  }
  return name;
}

// --- Task / subtask editing (always against this device's current week) ------

export async function addTask(title) {
  const { week, year } = weekOf();
  const file = await loadOwnWeekFile(week, year);
  const task = createTask(title);
  file.tasks.push(task);
  await writeFile(file);
  return task;
}

export async function addSubtask(taskId, title) {
  const { week, year } = weekOf();
  const file = await loadOwnWeekFile(week, year);
  const task = file.tasks.find((t) => t.id === taskId);
  if (!task) throw new Error('Task not found in current week file.');
  const subtask = createSubtask(title);
  task.subtasks.push(subtask);
  await writeFile(file);
  return subtask;
}

/** Rename a task in the current week file (PRD edge case §4.3). */
export async function renameTask(taskId, title) {
  const { week, year } = weekOf();
  const file = await loadOwnWeekFile(week, year);
  upsertTask(file, taskId, title);
  await writeFile(file);
}

export async function renameSubtask(taskId, subtaskId, title) {
  const { week, year } = weekOf();
  const file = await loadOwnWeekFile(week, year);
  const task = upsertTask(file, taskId);
  upsertSubtask(task, subtaskId, title);
  await writeFile(file);
}

/**
 * Append a log to this device's file for the week that the log's timestamp
 * falls in. Because the target week is derived from the timestamp, a stop that
 * happens after midnight on Saturday automatically lands in the new week file
 * (PRD edge case §4.4). The task/subtask are upserted so the new week file
 * carries their (current) titles.
 */
export async function appendLog({ taskId, taskTitle, subtaskId, subtaskTitle, type, timestamp, durationSeconds }) {
  const ts = timestamp || new Date().toISOString();
  const { week, year } = weekOf(new Date(ts));
  const file = await loadOwnWeekFile(week, year);
  const task = upsertTask(file, taskId, taskTitle);
  const subtask = upsertSubtask(task, subtaskId, subtaskTitle);
  subtask.logs.push(createLog(type, ts, durationSeconds || 0));
  await writeFile(file);
}

// --- Reading / reporting ------------------------------------------------------

/** This device's current-week file (parsed), creating an empty shell if absent. */
export async function getCurrentWeekFile() {
  const { week, year } = weekOf();
  return loadOwnWeekFile(week, year);
}

/**
 * Read every device's files for a set of { week, year } keys and aggregate
 * them into a single report (PRD §3.1 smart reading + §4.2 cross-device).
 */
export async function getReportForWeeks(weeks) {
  const wanted = new Set(weeks.map((w) => `${w.year}-${w.week}`));
  const all = await listAllWeekFiles();
  const files = [];
  for (const entry of all) {
    if (wanted.has(`${entry.year}-${entry.week}`)) {
      const file = await readFile(entry.name);
      if (file) files.push(file);
    }
  }
  return aggregateReport(files);
}

/** Report across the inclusive Jalali week range [from, to] within a year. */
export async function getReportForDateRange(fromDate, toDate) {
  const weeks = weeksBetween(fromDate, toDate);
  return getReportForWeeks(weeks);
}

/** Distinct { week, year } keys covering the inclusive date range. */
export function weeksBetween(fromDate, toDate) {
  const out = [];
  const seen = new Set();
  const cursor = new Date(fromDate);
  cursor.setHours(12, 0, 0, 0); // midday avoids DST edge wobble
  const end = new Date(toDate);
  end.setHours(12, 0, 0, 0);
  while (cursor <= end) {
    const { week, year } = jalaliWeek(cursor);
    const key = `${year}-${week}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ week, year });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
