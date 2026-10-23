// -----------------------------------------------------------------------------
// The XML of Met Éireann → the slim forecast, on the real answers of
// 2026-10-23 (Dublin, Cork, Galway, and Paris, outside the domain).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacySymbol, parseForecast } from '../src/forecast.js';
import { HOUR_MS } from '../src/time.js';
import { HOUSES, forecastOf, loadText } from './helpers/fixtures.js';

test('the real answers are read: location, run, about 10 days of points', () => {
  for (const house of [HOUSES.dublin, HOUSES.cork, HOUSES.galway]) {
    const forecast = forecastOf(house.fixture);
    assert.equal(forecast.latitude, house.latitude);
    assert.equal(forecast.longitude, house.longitude);
    assert.equal(forecast.updatedAt, Date.parse('2026-10-23T15:35:20Z'));
    assert.equal(forecast.points.length, 107);
    const span = forecast.points.at(-1).time - forecast.points[0].time;
    assert.ok(span > 9 * 24 * HOUR_MS, 'about ten days');
    for (let i = 1; i < forecast.points.length; i += 1) {
      assert.ok(forecast.points[i].time > forecast.points[i - 1].time, 'sorted, no duplicate');
    }
  }
});

test('an instant carries the air, its period the symbol and the precipitation', () => {
  const forecast = forecastOf(HOUSES.dublin.fixture);
  const point = forecast.points.find((p) => p.time === Date.parse('2026-10-23T19:00:00Z'));
  assert.equal(point.temperature, 8.3);
  assert.equal(point.humidity, 73.2);
  assert.equal(point.pressure, 1011.6);
  assert.equal(point.windSpeed, 4.5);
  assert.equal(point.windDirection, 266.6);
  assert.equal(point.windGust, 10.7);
  assert.equal(point.cloudCover, 9);
  assert.equal(point.dewPoint, 3.7);
  assert.deepEqual(point.period, {
    hours: 1,
    symbol: 'cloudy',
    precipitation: 0,
    precipitationMin: 0,
    precipitationMax: 0,
    probability: 0,
  });
  assert.equal(point.next1, point.period);
});

test('the hour under way gets a point, with the values of the instant ending it', () => {
  const [first, second] = forecastOf(HOUSES.dublin.fixture).points;
  assert.equal(first.time, Date.parse('2026-10-23T18:00:00Z'));
  assert.equal(first.temperature, second.temperature);
  assert.equal(first.period.symbol, 'clearsky');
});

test('hourly for 3 days, then 3-hourly, then 6-hourly periods', () => {
  const lengths = forecastOf(HOUSES.cork.fixture)
    .points.filter((p) => p.period !== null)
    .map((p) => p.period.hours);
  assert.deepEqual([...new Set(lengths)], [1, 3, 6]);
  assert.equal(lengths.filter((hours) => hours === 1).length, 72);
  assert.equal(forecastOf(HOUSES.cork.fixture).points.at(-1).period, null);
});

test('outside the domain of the models, there is no forecast', () => {
  assert.throws(() => parseForecast(loadText(HOUSES.paris.fixture)), /no forecast/);
  assert.throws(() => parseForecast('{"status":false}'), /not a forecast/);
  assert.throws(() => parseForecast(null), /not a forecast/);
});

test('another temperature unit is refused', () => {
  const xml = loadText(HOUSES.dublin.fixture).replaceAll('unit="celsius"', 'unit="fahrenheit"');
  assert.throws(() => parseForecast(xml), /Unexpected temperature unit/);
});

test('legacy symbols: night variants folded, unknown numbers dropped', () => {
  assert.equal(legacySymbol('46'), 'lightrain');
  assert.equal(legacySymbol('101'), 'clearsky');
  assert.equal(legacySymbol('16'), null);
  assert.equal(legacySymbol(''), null);
});
