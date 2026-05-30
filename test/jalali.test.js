import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gregorianToJalali,
  jalaliWeek,
  weekFileName,
  parseWeekFileName,
  jalaliDayOfYear,
  isLeapJalaliYear,
  iranianWeekday,
} from '../src/lib/jalali.js';

test('gregorianToJalali: known anchors', () => {
  // Nowruz 1403 began 2024-03-20.
  assert.deepEqual(gregorianToJalali(2024, 3, 20), { jy: 1403, jm: 1, jd: 1 });
  assert.deepEqual(gregorianToJalali(2024, 3, 19), { jy: 1402, jm: 12, jd: 29 });
  // A familiar one: 2025-01-01 is in Jalali 1403.
  assert.deepEqual(gregorianToJalali(2025, 1, 1), { jy: 1403, jm: 10, jd: 12 });
});

test('isLeapJalaliYear', () => {
  assert.equal(isLeapJalaliYear(1403), true); // 1403 is a leap year
  assert.equal(isLeapJalaliYear(1404), false);
});

test('iranianWeekday: Saturday is 0, Friday is 6', () => {
  // 2024-03-23 is a Saturday.
  assert.equal(iranianWeekday(new Date(2024, 2, 23)), 0);
  // 2024-03-22 is a Friday.
  assert.equal(iranianWeekday(new Date(2024, 2, 22)), 6);
});

test('jalaliDayOfYear', () => {
  assert.equal(jalaliDayOfYear(1403, 1, 1), 1);
  assert.equal(jalaliDayOfYear(1403, 2, 1), 32); // after 31-day Farvardin
  assert.equal(jalaliDayOfYear(1403, 7, 1), 187); // after six 31-day months
});

test('jalaliWeek: Farvardin 1, 1403 is in week 1', () => {
  // 2024-03-20 = 1 Farvardin 1403 (a Wednesday).
  const w = jalaliWeek(new Date(2024, 2, 20));
  assert.equal(w.year, 1403);
  assert.equal(w.week, 1);
});

test('jalaliWeek: week advances on Saturday', () => {
  // Farvardin 1, 1403 is a Wednesday (Iranian weekday 4).
  // The next Saturday (2024-03-23) starts week 2.
  assert.equal(jalaliWeek(new Date(2024, 2, 22)).week, 1); // Fri -> still week 1
  assert.equal(jalaliWeek(new Date(2024, 2, 23)).week, 2); // Sat -> week 2
});

test('weekFileName / parseWeekFileName round-trip', () => {
  assert.equal(weekFileName('a1b2c3d4', 2, 1403), 'a1b2c3d4_W02_Y1403.json');
  assert.deepEqual(parseWeekFileName('a1b2c3d4_W02_Y1403.json'), {
    deviceId: 'a1b2c3d4',
    week: 2,
    year: 1403,
  });
  // Device ids with underscores still parse correctly.
  assert.deepEqual(parseWeekFileName('Laptop-Ali_W12_Y1403.json'), {
    deviceId: 'Laptop-Ali',
    week: 12,
    year: 1403,
  });
  assert.equal(parseWeekFileName('not-a-week-file.txt'), null);
});
