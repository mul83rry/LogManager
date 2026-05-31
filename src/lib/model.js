// Pure data-model helpers for the weekly cloud file described in the PRD (§5).
//
// File shape:
//   {
//     device_id, week_number, year, last_updated,
//     tasks: [ { id, title, subtasks: [ { id, title, logs: [...] } ] } ]
//   }
//
// Log shape:
//   { type: 'system_start' | 'system_stop', timestamp, duration_seconds }

/** Short unique id (first 8 chars of a UUID), good enough for tasks/subtasks. */
export function shortId() {
  return cryptoRandomUUID().replace(/-/g, '').slice(0, 8);
}

// crypto.randomUUID exists both in browsers/service workers and modern Node.
function cryptoRandomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Extremely small fallback; never expected to run in supported targets.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Create an empty week file for a device/week/year. */
export function createWeekFile(deviceId, week, year) {
  return {
    device_id: deviceId,
    week_number: week,
    year,
    last_updated: new Date().toISOString(),
    tasks: [],
  };
}

export function createTask(title, id = shortId(), projectId = null) {
  return { id, title, projectId, subtasks: [] };
}

export function createSubtask(title, id = shortId(), description = '') {
  return { id, title, description, logs: [] };
}

export function createLog(type, timestamp = new Date().toISOString(), durationSeconds = 0) {
  return { type, timestamp, duration_seconds: durationSeconds };
}

export function findTask(file, taskId) {
  return file.tasks.find((t) => t.id === taskId) || null;
}

export function findSubtask(task, subtaskId) {
  return task.subtasks.find((s) => s.id === subtaskId) || null;
}

/**
 * Ensure a task exists in the file (creating it with the given id/title if
 * missing) and return it. If it exists, its title is refreshed — this is how
 * a mid-week rename lands in the current week file (PRD edge case §4.3).
 */
export function upsertTask(file, taskId, title) {
  let task = findTask(file, taskId);
  if (!task) {
    task = createTask(title, taskId);
    file.tasks.push(task);
  } else if (title != null) {
    task.title = title;
  }
  return task;
}

/** Same as upsertTask but for a subtask within a task. */
export function upsertSubtask(task, subtaskId, title) {
  let subtask = findSubtask(task, subtaskId);
  if (!subtask) {
    subtask = createSubtask(title, subtaskId);
    task.subtasks.push(subtask);
  } else if (title != null) {
    subtask.title = title;
  }
  return subtask;
}

/** Stamp last_updated and return the file (for chaining before save). */
export function touch(file) {
  file.last_updated = new Date().toISOString();
  return file;
}
