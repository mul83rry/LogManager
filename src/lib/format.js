// Formatting helpers: Jalali date/time strings, durations, and the text
// export described in the PRD (§3.4).

import { dateToJalali, pad2 } from './jalali.js';

/** "1403/08/12" for the given ISO timestamp or Date. */
export function formatJalaliDate(input) {
  const date = input instanceof Date ? input : new Date(input);
  const { jy, jm, jd } = dateToJalali(date);
  return `${jy}/${pad2(jm)}/${pad2(jd)}`;
}

/** "14:30" for the given ISO timestamp or Date. */
export function formatTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "1403/08/12 14:30" for the given ISO timestamp or Date. */
export function formatJalaliDateTime(input) {
  return `${formatJalaliDate(input)} ${formatTime(input)}`;
}

/**
 * Human-readable duration, e.g. 5400 -> "1:30:00".
 * Always at least minutes:seconds; hours shown when present.
 */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * Build the plain-text export from an aggregated report (see aggregate.js,
 * `aggregateReport`). Produces the indented format from the PRD:
 *
 *   طراحی رابط کاربری: 1403/08/12 14:30 - 1403/08/12 16:00
 *       طراحی هدر: 1403/08/12 14:30 - 1403/08/12 15:00
 *       طراحی فوتر: 1403/08/12 15:05 - 1403/08/12 16:00
 *
 * Tasks/subtasks with no completed interval are skipped.
 */
export function buildTextExport(report) {
  const lines = [];
  for (const task of report.tasks) {
    if (!task.range) continue;
    lines.push(
      `${task.title}: ${formatJalaliDateTime(task.range.start)} - ${formatJalaliDateTime(task.range.end)}`,
    );
    for (const subtask of task.subtasks) {
      if (!subtask.range) continue;
      lines.push(
        `    ${subtask.title}: ${formatJalaliDateTime(subtask.range.start)} - ${formatJalaliDateTime(subtask.range.end)}`,
      );
    }
  }
  return lines.join('\n');
}
