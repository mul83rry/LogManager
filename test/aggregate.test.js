import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeWeekFiles,
  pairIntervals,
  aggregateReport,
} from '../src/lib/aggregate.js';
import { buildTextExport } from '../src/lib/format.js';

function startLog(ts) {
  return { type: 'system_start', timestamp: ts, duration_seconds: 0 };
}
function stopLog(ts, dur) {
  return { type: 'system_stop', timestamp: ts, duration_seconds: dur };
}

test('pairIntervals pairs start/stop and uses duration_seconds', () => {
  const ivs = pairIntervals([
    startLog('2024-10-25T14:30:00Z'),
    stopLog('2024-10-25T15:00:00Z', 1800),
  ]);
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].duration, 1800);
  assert.equal(ivs[0].end, '2024-10-25T15:00:00Z');
});

test('pairIntervals leaves a running timer open', () => {
  const ivs = pairIntervals([startLog('2024-10-25T14:30:00Z')]);
  assert.equal(ivs.length, 1);
  assert.equal(ivs[0].end, null);
});

test('cross-device aggregation sums the same task across two files', () => {
  // §4.2: laptop and desktop both worked on task t1 / subtask s1.
  const laptop = {
    device_id: 'a1b2',
    week_number: 2,
    year: 1403,
    last_updated: '2024-10-25T16:00:00Z',
    tasks: [
      {
        id: 't1',
        title: 'توسعه فرانت‌اند',
        subtasks: [
          { id: 's1', title: 'کد زدن هدر', logs: [startLog('2024-10-25T14:00:00Z'), stopLog('2024-10-25T15:00:00Z', 3600)] },
        ],
      },
    ],
  };
  const desktop = {
    device_id: 'e5f6',
    week_number: 2,
    year: 1403,
    last_updated: '2024-10-25T18:00:00Z',
    tasks: [
      {
        id: 't1',
        title: 'توسعه فرانت‌اند',
        subtasks: [
          { id: 's1', title: 'کد زدن هدر', logs: [startLog('2024-10-25T16:00:00Z'), stopLog('2024-10-25T16:30:00Z', 1800)] },
        ],
      },
    ],
  };

  const report = aggregateReport([laptop, desktop]);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.tasks[0].totalSeconds, 3600 + 1800);
  assert.equal(report.totalSeconds, 5400);
  // Range spans both devices.
  assert.equal(report.tasks[0].range.start, '2024-10-25T14:00:00Z');
  assert.equal(report.tasks[0].range.end, '2024-10-25T16:30:00Z');
});

test('week-boundary: start in old week file pairs with stop in new week file', () => {
  // §4.4: timer started Fri 23:55, stopped Sat 00:01 (next week).
  const oldWeek = {
    device_id: 'a1b2',
    week_number: 5,
    year: 1403,
    last_updated: '2024-04-26T20:25:00Z',
    tasks: [{ id: 't1', title: 'T', subtasks: [{ id: 's1', title: 'S', logs: [startLog('2024-04-26T20:25:00Z')] }] }],
  };
  const newWeek = {
    device_id: 'a1b2',
    week_number: 6,
    year: 1403,
    last_updated: '2024-04-26T20:31:00Z',
    tasks: [{ id: 't1', title: 'T', subtasks: [{ id: 's1', title: 'S', logs: [stopLog('2024-04-26T20:31:00Z', 360)] }] }],
  };
  const report = aggregateReport([newWeek, oldWeek]); // order shouldn't matter
  assert.equal(report.tasks[0].subtasks[0].intervals.length, 1);
  assert.equal(report.tasks[0].totalSeconds, 360);
});

test('newest file wins on title (mid-week rename)', () => {
  const older = {
    last_updated: '2024-10-25T10:00:00Z',
    tasks: [{ id: 't1', title: 'نام قدیمی', subtasks: [] }],
  };
  const newer = {
    last_updated: '2024-10-27T10:00:00Z',
    tasks: [{ id: 't1', title: 'نام جدید', subtasks: [] }],
  };
  const [task] = mergeWeekFiles([newer, older]);
  assert.equal(task.title, 'نام جدید');
});

test('buildTextExport produces the PRD indented format', () => {
  const file = {
    last_updated: '2024-10-25T16:00:00Z',
    tasks: [
      {
        id: 't1',
        title: 'طراحی رابط کاربری',
        subtasks: [
          { id: 's1', title: 'طراحی هدر', logs: [startLog('2024-11-02T11:00:00Z'), stopLog('2024-11-02T11:30:00Z', 1800)] },
          { id: 's2', title: 'طراحی فوتر', logs: [startLog('2024-11-02T11:35:00Z'), stopLog('2024-11-02T12:30:00Z', 3300)] },
        ],
      },
    ],
  };
  const report = aggregateReport([file]);
  const text = buildTextExport(report);
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^طراحی رابط کاربری: \d{4}\/\d{2}\/\d{2} \d{2}:\d{2} - /);
  assert.match(lines[1], /^ {4}طراحی هدر: /);
  assert.match(lines[2], /^ {4}طراحی فوتر: /);
});
