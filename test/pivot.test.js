// -----------------------------------------------------------------------------
// The slim forecast → the pivot weather format of Gladys (contract B.18), on
// the real answers of 2026-10-23.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';
import { buildDays, precipitationTimeline } from '../src/daily.js';
import { MAX_DAYS, MAX_HOURS, buildWeather } from '../src/pivot.js';
import { HOUR_MS } from '../src/time.js';
import { parseWarnings, toAlerts, warningsOf } from '../src/warnings.js';
import { FIXTURE_NOW, HOUSES, forecastOf, loadFixture } from './helpers/fixtures.js';

const TZ = 'Europe/Dublin';

/**
 * @param {object} house - A HOUSES entry.
 * @param {object} [options] - Extra options of buildWeather.
 * @returns {object} The pivot weather.
 */
function pivotOf(house, options = {}) {
  return buildWeather(forecastOf(house.fixture), {
    latitude: house.latitude,
    longitude: house.longitude,
    units: 'metric',
    timeZone: TZ,
    now: FIXTURE_NOW,
    ...options,
  });
}

test('the current conditions of Dublin, from the hour under way', () => {
  const weather = pivotOf(HOUSES.dublin);
  assert.equal(weather.temperature, 8.3);
  assert.equal(weather.weather, WEATHER_CONDITIONS.CLEAR);
  assert.equal(weather.datetime, '2026-10-23T18:00:00.000Z');
  assert.equal(weather.humidity, 73);
  assert.equal(weather.pressure, 1012, 'hPa, rounded');
  assert.equal(weather.wind_speed, 4.5);
  assert.equal(weather.wind_gust, 10.7);
  assert.equal(weather.wind_direction, 267);
  assert.equal(weather.is_day, false, 'after sunset in October');
  assert.ok(weather.sunrise < weather.sunset);
  for (const absent of ['apparent_temperature', 'uv_index', 'visibility', 'alerts']) {
    assert.equal(Object.hasOwn(weather, absent), false, absent);
  }
});

test('24 hours with their precipitation and probability, 8 days', () => {
  for (const house of [HOUSES.dublin, HOUSES.cork, HOUSES.galway]) {
    const weather = pivotOf(house);
    assert.equal(weather.hours.length, MAX_HOURS);
    assert.equal(weather.days.length, MAX_DAYS);
    for (const hour of weather.hours) {
      assert.ok(Object.values(WEATHER_CONDITIONS).includes(hour.weather), hour.weather);
      assert.equal(typeof hour.precipitation, 'number');
      assert.ok(hour.precipitation_probability >= 0 && hour.precipitation_probability <= 100);
      assert.equal(typeof hour.is_day, 'boolean');
    }
    for (const day of weather.days) {
      assert.ok(day.temperature_min <= day.temperature_max);
      assert.ok(Object.values(WEATHER_CONDITIONS).includes(day.weather), day.weather);
      assert.equal(typeof day.precipitation, 'number');
    }
  }
});

test('US units convert every value', () => {
  const metric = pivotOf(HOUSES.cork);
  const us = pivotOf(HOUSES.cork, { units: 'us' });
  assert.equal(us.temperature, Math.round(((metric.temperature * 9) / 5) * 10 + 320) / 10);
  assert.ok(Math.abs(us.wind_speed - metric.wind_speed * 2.23694) < 0.1);
  assert.equal(us.pressure, metric.pressure, 'hPa in both systems');
});

test('the warnings of the county become the alerts of the answer', () => {
  const warnings = parseWarnings(loadFixture('real-warnings-ireland.json'), FIXTURE_NOW);
  const weather = pivotOf(HOUSES.galway, { alerts: toAlerts(warningsOf(warnings, 'EI10')) });
  assert.deepEqual(
    weather.alerts.map((alert) => alert.severity),
    ['severe', 'moderate', 'moderate'],
  );
});

test('the precipitation timeline covers the forecast without gap nor overlap', () => {
  const periods = precipitationTimeline(forecastOf(HOUSES.galway.fixture).points);
  for (let i = 1; i < periods.length; i += 1) {
    assert.equal(periods[i].start, periods[i - 1].end);
  }
  assert.deepEqual([...new Set(periods.map((period) => period.hours))], [1, 3, 6]);
});

test('days sum the periods, pick the noon symbol, and drop a last day barely entered', () => {
  const forecast = forecastOf(HOUSES.cork.fixture);
  const days = buildDays(forecast, {
    latitude: HOUSES.cork.latitude,
    longitude: HOUSES.cork.longitude,
    timeZone: TZ,
  });
  const total = precipitationTimeline(forecast.points).reduce(
    (sum, period) => sum + (period.precipitation ?? 0),
    0,
  );
  const counted = days.reduce((sum, day) => sum + (day.precipitation ?? 0), 0);
  // Only the periods of a dropped last day are missing.
  assert.ok(counted <= total + 1e-9);
  assert.ok(days.at(-1).end <= forecast.points.at(-1).time + 6 * HOUR_MS);
  for (const day of days) {
    assert.ok(day.symbol !== null, 'every day has a symbol');
  }
});
