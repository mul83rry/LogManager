// Aggregation: merge multiple week files (from different devices and/or
// different weeks) into a single sorted report, and pair start/stop logs into
// time intervals.
//
// This covers several PRD requirements at once:
//   - §3.1 "smart reading" merges only the files handed to it.
//   - §4.2 cross-device aggregation: logs from many files are sorted by
//     timestamp and summed per task/subtask.
//   - §4.4 week-boundary: a `system_start` in one week file pairs with a
//     `system_stop` in the next week file because we merge then pair.
//
// Tasks and subtasks are merged by id. A task/subtask worked on from two
// devices shares its id (the user picks it from the same logical list), so
// merging by id naturally sums the durations.

/**
 * Merge week files into a list of tasks:
 *   [ { id, title, subtasks: [ { id, title, logs: [...sorted] } ] } ]
 * The title used is the one from the most recently updated file.
 */
export function mergeWeekFiles(files) {
  // Process files oldest-first so the newest `last_updated` wins on titles.
  const ordered = [...files].sort(
    (a, b) => new Date(a.last_updated || 0) - new Date(b.last_updated || 0),
  );

  const taskMap = new Map();
  for (const file of ordered) {
    for (const task of file.tasks || []) {
      let mTask = taskMap.get(task.id);
      if (!mTask) {
        mTask = { id: task.id, title: task.title, subtasks: new Map() };
        taskMap.set(task.id, mTask);
      } else if (task.title != null) {
        mTask.title = task.title;
      }
      for (const subtask of task.subtasks || []) {
        let mSub = mTask.subtasks.get(subtask.id);
        if (!mSub) {
          mSub = { id: subtask.id, title: subtask.title, logs: [] };
          mTask.subtasks.set(subtask.id, mSub);
        } else if (subtask.title != null) {
          mSub.title = subtask.title;
        }
        for (const log of subtask.logs || []) {
          mSub.logs.push({ ...log });
        }
      }
    }
  }

  // Materialize maps -> arrays, sorting logs by timestamp.
  const tasks = [];
  for (const mTask of taskMap.values()) {
    const subtasks = [];
    for (const mSub of mTask.subtasks.values()) {
      mSub.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      subtasks.push(mSub);
    }
    tasks.push({ id: mTask.id, title: mTask.title, subtasks });
  }
  return tasks;
}

/**
 * Pair a chronologically sorted log list into intervals.
 * `system_start` opens an interval; the next `system_stop` closes it.
 * A `system_stop` carries `duration_seconds`; when present we trust it,
 * otherwise we compute end - start.
 *
 * A dangling `system_start` (still-running timer, or a stop in a week file we
 * weren't asked to read) yields an open interval with `end: null`.
 */
export function pairIntervals(logs) {
  const intervals = [];
  let openStart = null;
  for (const log of logs) {
    if (log.type === 'system_start') {
      // Two starts in a row: keep the earliest as the open one.
      if (!openStart) openStart = log;
    } else if (log.type === 'system_stop') {
      if (openStart) {
        const start = openStart.timestamp;
        const end = log.timestamp;
        const duration =
          log.duration_seconds != null && log.duration_seconds > 0
            ? log.duration_seconds
            : Math.max(0, (new Date(end) - new Date(start)) / 1000);
        intervals.push({ start, end, duration });
        openStart = null;
      } else {
        // Stop without a matching start (start lives in a file we didn't load).
        // Represent it as a zero-anchored interval using its own duration.
        const seconds = log.duration_seconds || 0;
        const startTs = new Date(new Date(log.timestamp) - seconds * 1000).toISOString();
        intervals.push({ start: startTs, end: log.timestamp, duration: seconds });
      }
    }
  }
  if (openStart) {
    intervals.push({ start: openStart.timestamp, end: null, duration: 0 });
  }
  return intervals;
}

/** Total completed seconds across a list of intervals. */
export function totalSeconds(intervals) {
  return intervals.reduce((sum, iv) => sum + (iv.duration || 0), 0);
}

/** Earliest start / latest end across intervals, or null if none closed. */
export function intervalRange(intervals) {
  let start = null;
  let end = null;
  for (const iv of intervals) {
    if (iv.start && (!start || new Date(iv.start) < new Date(start))) start = iv.start;
    if (iv.end && (!end || new Date(iv.end) > new Date(end))) end = iv.end;
  }
  if (!start || !end) return null;
  return { start, end };
}

/**
 * Build a full report from week files:
 *   {
 *     tasks: [ {
 *       id, title,
 *       totalSeconds, range,
 *       subtasks: [ { id, title, intervals, totalSeconds, range } ]
 *     } ],
 *     totalSeconds
 *   }
 */
export function aggregateReport(files) {
  const merged = mergeWeekFiles(files);
  const tasks = merged.map((task) => {
    const subtasks = task.subtasks.map((sub) => {
      const intervals = pairIntervals(sub.logs);
      return {
        id: sub.id,
        title: sub.title,
        intervals,
        totalSeconds: totalSeconds(intervals),
        range: intervalRange(intervals),
      };
    });
    // Time inheritance (§3.2): a task's range/total derive from its subtasks.
    const allIntervals = subtasks.flatMap((s) => s.intervals);
    return {
      id: task.id,
      title: task.title,
      subtasks,
      totalSeconds: totalSeconds(allIntervals),
      range: intervalRange(allIntervals),
    };
  });
  return {
    tasks,
    totalSeconds: tasks.reduce((sum, t) => sum + t.totalSeconds, 0),
  };
}
