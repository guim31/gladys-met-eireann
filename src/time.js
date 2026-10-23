// -----------------------------------------------------------------------------
// Local days.
//
// Met Éireann gives every time in UTC. The days of the forecast (minimum and
// maximum, precipitation of the day, "today" and "tomorrow" of the scene
// action) are cut at the midnights of the time zone of Gladys: the supervisor
// sets TZ in the container, which Intl reads. A time zone is passed
// explicitly everywhere so the tests can pin one.
// -----------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const formatters = new Map();

/**
 * @description The time zone of the container (TZ, set by the supervisor).
 * @returns {string} An IANA time zone name.
 * @example
 * systemTimeZone(); // -> 'Europe/Paris'
 */
function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * @description A cached formatter of the wall-clock parts in a time zone.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {Intl.DateTimeFormat} The formatter.
 * @example
 * partsFormatter('Europe/Oslo');
 */
function partsFormatter(timeZone) {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * @description The wall-clock time of an instant in a time zone.
 * @param {number} ms - The instant.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {{year: number, month: number, day: number, hour: number,
 * minute: number, second: number}} The parts (month 1-12).
 * @example
 * wallClock(Date.UTC(2026, 9, 12, 22), 'Europe/Paris').day; // -> 13
 */
function wallClock(ms, timeZone) {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(ms)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return parts;
}

/**
 * @description The offset of a time zone at an instant (local minus UTC).
 * @param {number} ms - The instant.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {number} The offset, in ms.
 * @example
 * offsetMs(Date.UTC(2026, 6, 1), 'Europe/Paris'); // -> 7200000
 */
function offsetMs(ms, timeZone) {
  const { year, month, day, hour, minute, second } = wallClock(ms, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(ms / 1000) * 1000;
}

/**
 * @description The calendar date of an instant in a time zone.
 * @param {number} ms - The instant.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {string} 'YYYY-MM-DD'.
 * @example
 * dayKey(Date.UTC(2026, 9, 12, 23), 'Europe/Paris'); // -> '2026-10-13'
 */
function dayKey(ms, timeZone) {
  const { year, month, day } = wallClock(ms, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @description The local midnight starting the day of an instant.
 * @param {number} ms - The instant.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {number} The midnight, in ms.
 * @example
 * startOfDay(Date.UTC(2026, 9, 12, 15), 'Europe/Paris'); // -> Date.UTC(2026, 9, 11, 22)
 */
function startOfDay(ms, timeZone) {
  const { year, month, day } = wallClock(ms, timeZone);
  const utcMidnight = Date.UTC(year, month - 1, day);
  // The offset at midnight may differ from the offset at `ms` (a daylight
  // saving switch during the day): take it at the guess, then check.
  let start = utcMidnight - offsetMs(utcMidnight, timeZone);
  start = utcMidnight - offsetMs(start, timeZone);
  return start;
}

/**
 * @description The local midnight following a local midnight (days last 23
 * to 25 hours around the daylight saving switches).
 * @param {number} dayStart - A local midnight, in ms.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {number} The next midnight, in ms.
 * @example
 * nextDayStart(startOfDay(Date.now(), 'Europe/Paris'), 'Europe/Paris');
 */
function nextDayStart(dayStart, timeZone) {
  return startOfDay(dayStart + DAY_MS + 2 * HOUR_MS, timeZone);
}

export { DAY_MS, HOUR_MS, dayKey, nextDayStart, offsetMs, startOfDay, systemTimeZone, wallClock };
