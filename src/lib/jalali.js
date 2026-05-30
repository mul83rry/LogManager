// Jalali (Persian / Solar Hijri) calendar utilities.
//
// The cloud files are named with the Jalali week number and Jalali year
// (e.g. `a1b2c3d4_W02_Y1403.json`). The Iranian week starts on Saturday
// (شنبه) and ends on Friday (جمعه), so all week math below is anchored to
// Saturday.
//
// The Gregorian <-> Jalali conversion is the well-known algorithm from
// jalaali-js (MIT licensed), reimplemented here with no dependencies so the
// module works unchanged in a service worker, an extension page, and Node.

function div(a, b) {
  return Math.trunc(a / b);
}

function mod(a, b) {
  return a - Math.trunc(a / b) * b;
}

// Calendar calculation for a given Jalali year. Returns { leap, gy, march }
// where `leap` is the number of years since the last leap year (0 => leap),
// `gy` is the Gregorian year of the start, and `march` is the day in March
// on which the Jalali year begins.
function jalCal(jy) {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
    1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error(`Invalid Jalali year ${jy}`);
  }

  let jump = 0;
  let jm;
  for (let i = 1; i < bl; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

// Gregorian date -> Julian Day Number.
function g2d(gy, gm, gd) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

// Julian Day Number -> Gregorian date.
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

// Jalali date -> Julian Day Number.
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

// Julian Day Number -> Jalali date.
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = j2d(jy, 1, 1);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      const jm = 1 + div(k, 31);
      const jd = mod(k, 31) + 1;
      return { jy, jm, jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  const jm = 7 + div(k, 30);
  const jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

/** True if the given Jalali year is a leap year. */
export function isLeapJalaliYear(jy) {
  return jalCal(jy).leap === 0;
}

/** Convert a Gregorian (y, m, d) — month 1-12 — to { jy, jm, jd }. */
export function gregorianToJalali(gy, gm, gd) {
  return d2j(g2d(gy, gm, gd));
}

/** Convert a JS Date (in local time) to { jy, jm, jd }. */
export function dateToJalali(date) {
  return gregorianToJalali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

/** Number of days in a Jalali month (1-12) for the given year. */
export function jalaliMonthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/** 1-based day of the Jalali year for the given Jalali date. */
export function jalaliDayOfYear(jy, jm, jd) {
  let days = jd;
  for (let m = 1; m < jm; m += 1) {
    days += jalaliMonthLength(jy, m);
  }
  return days;
}

/**
 * Iranian weekday index for a JS Date: Saturday = 0 ... Friday = 6.
 * JS getDay() returns Sunday = 0 ... Saturday = 6, so we shift by one.
 */
export function iranianWeekday(date) {
  return (date.getDay() + 1) % 7;
}

/**
 * Compute the Jalali { week, year } a date belongs to. Weeks are anchored to
 * Saturday and numbered from the start of the Jalali year (W01 = the week
 * containing Farvardin 1). The returned `year` is the Jalali year.
 */
export function jalaliWeek(date) {
  const { jy, jm, jd } = dateToJalali(date);
  const dayOfYear = jalaliDayOfYear(jy, jm, jd); // 1-based
  const weekday = iranianWeekday(date); // 0 = Saturday
  // Weekday of Farvardin 1 (Saturday = 0), derived without a second conversion.
  const firstWeekday = ((weekday - (dayOfYear - 1)) % 7 + 7) % 7;
  const week = Math.floor((dayOfYear - 1 + firstWeekday) / 7) + 1;
  return { week, year: jy };
}

/** Zero-pad a number to two digits. */
export function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Build the canonical week-file name for a device.
 * Example: deviceId "a1b2c3d4", week 2, year 1403 -> "a1b2c3d4_W02_Y1403.json".
 */
export function weekFileName(deviceId, week, year) {
  return `${deviceId}_W${pad2(week)}_Y${year}.json`;
}

/**
 * Parse a week-file name back into its parts, or null if it does not match.
 * Device ids may contain underscores (e.g. "Laptop-Ali"), so we anchor the
 * match on the trailing `_W..._Y....json` segment.
 */
export function parseWeekFileName(name) {
  const m = /^(.+)_W(\d{2,})_Y(\d{3,4})\.json$/.exec(name);
  if (!m) return null;
  return {
    deviceId: m[1],
    week: Number(m[2]),
    year: Number(m[3]),
  };
}
