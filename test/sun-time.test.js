// -----------------------------------------------------------------------------
// The computed sun (sun.js) and the local days (time.js). Reference times:
// the NOAA solar calculator (gml.noaa.gov/grad/solcalc), which uses the same
// algorithm; they agree within a minute.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSunUp, solarElevation, sunTimes } from '../src/sun.js';
import { dayKey, nextDayStart, startOfDay } from '../src/time.js';

const MINUTE = 60 * 1000;

/**
 * @param {number} actual - ms.
 * @param {number} expected - ms.
 * @param {string} what - The label.
 */
function near(actual, expected, what) {
  assert.ok(
    Math.abs(actual - expected) <= 2 * MINUTE,
    `${what}: ${new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`,
  );
}

test('sunrise and sunset in New York and Toulouse on 12 October 2026', () => {
  const ny = startOfDay(Date.UTC(2026, 9, 12, 15), 'America/New_York');
  const nyTimes = sunTimes(ny, nextDayStart(ny, 'America/New_York'), 40.7128, -74.006);
  near(nyTimes.sunrise, Date.UTC(2026, 9, 12, 11, 4), 'New York sunrise (7:04 EDT)');
  near(nyTimes.sunset, Date.UTC(2026, 9, 12, 22, 20), 'New York sunset (18:20 EDT)');

  const tls = startOfDay(Date.UTC(2026, 9, 12, 15), 'Europe/Paris');
  const tlsTimes = sunTimes(tls, nextDayStart(tls, 'Europe/Paris'), 43.6045, 1.444);
  near(tlsTimes.sunrise, Date.UTC(2026, 9, 12, 6, 5), 'Toulouse sunrise (8:05 CEST)');
  near(tlsTimes.sunset, Date.UTC(2026, 9, 12, 17, 16), 'Toulouse sunset (19:16 CEST)');
});

test('a sunset after midnight UTC stays in its local day (Sydney)', () => {
  const day = startOfDay(Date.UTC(2026, 9, 12, 15), 'Australia/Sydney');
  assert.equal(new Date(day).toISOString(), '2026-10-12T13:00:00.000Z');
  const { sunrise, sunset } = sunTimes(
    day,
    nextDayStart(day, 'Australia/Sydney'),
    -33.8688,
    151.2093,
  );
  near(sunrise, Date.UTC(2026, 9, 12, 19, 17), 'Sydney sunrise (6:17 AEDT)');
  near(sunset, Date.UTC(2026, 9, 13, 8, 7), 'Sydney sunset (19:07 AEDT)');
});

test('the polar night and the polar day have neither sunrise nor sunset', () => {
  const winter = startOfDay(Date.UTC(2026, 11, 15, 12), 'Europe/Oslo');
  assert.deepEqual(sunTimes(winter, nextDayStart(winter, 'Europe/Oslo'), 78.2232, 15.6267), {
    sunrise: null,
    sunset: null,
  });
  assert.equal(isSunUp(Date.UTC(2026, 11, 15, 12), 78.2232, 15.6267), false);
  const summer = startOfDay(Date.UTC(2026, 5, 21, 12), 'Europe/Oslo');
  assert.deepEqual(sunTimes(summer, nextDayStart(summer, 'Europe/Oslo'), 78.2232, 15.6267), {
    sunrise: null,
    sunset: null,
  });
  assert.equal(isSunUp(Date.UTC(2026, 5, 21, 0), 78.2232, 15.6267), true);
});

test('the sun is overhead at noon on the equator at an equinox', () => {
  const elevation = solarElevation(Date.UTC(2026, 2, 20, 12, 7), 0, 0);
  assert.ok(elevation > 89, String(elevation));
});

test('local days follow the daylight saving switches', () => {
  // Europe/Paris goes back to winter time on 25 October 2026: a 25-hour day.
  const day = startOfDay(Date.UTC(2026, 9, 25, 12), 'Europe/Paris');
  assert.equal(new Date(day).toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(nextDayStart(day, 'Europe/Paris') - day, 25 * 60 * MINUTE);
  // And forward on 29 March 2026: a 23-hour day.
  const spring = startOfDay(Date.UTC(2026, 2, 29, 12), 'Europe/Paris');
  assert.equal(nextDayStart(spring, 'Europe/Paris') - spring, 23 * 60 * MINUTE);
  assert.equal(dayKey(Date.UTC(2026, 9, 12, 22, 30), 'Europe/Paris'), '2026-10-13');
  assert.equal(dayKey(Date.UTC(2026, 9, 12, 22, 30), 'UTC'), '2026-10-12');
});
