// -----------------------------------------------------------------------------
// Scene actions and triggers, on the real answers of 2026-10-23: the next
// hour, the day, the warnings of a county, and the two triggers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForecast } from '../src/forecast.js';
import { readNextHour } from '../src/next-hour.js';
import { currentWarnings, dayForecast, precipitationNextHour } from '../src/scene-actions.js';
import { createPrecipitationWatcher } from '../src/scene-triggers.js';
import { createWarningWatcher } from '../src/warning-triggers.js';
import { parseWarnings } from '../src/warnings.js';
import {
  FIXTURE_NOW,
  HOUSES,
  forecastOf,
  loadFixture,
  loadText,
  silentLogger,
  withHours,
} from './helpers/fixtures.js';

const TZ = 'Europe/Dublin';
const MINUTE = 60 * 1000;
const realWarnings = () => parseWarnings(loadFixture('real-warnings-ireland.json'), FIXTURE_NOW);

test('a dry next hour, read from the hour under way and the next one', () => {
  const reading = readNextHour(forecastOf(HOUSES.dublin.fixture), FIXTURE_NOW);
  assert.equal(reading.available, true);
  assert.equal(reading.minutesUntil, null);
  const outputs = precipitationNextHour(forecastOf(HOUSES.dublin.fixture), {
    language: 'fr',
    units: 'metric',
    now: FIXTURE_NOW,
  });
  assert.deepEqual(outputs, {
    available: true,
    precipitation_expected: false,
    summary: 'Pas de précipitations prévues dans l’heure.',
  });
});

test('rain at 19:00 is announced 50 minutes ahead, with its probability', () => {
  const forecast = parseForecast(
    withHours(loadText(HOUSES.dublin.fixture), {
      '2026-10-23T19:00:00Z': { symbol: 9, amount: 1.2, probability: 80 },
    }),
  );
  const outputs = precipitationNextHour(forecast, {
    language: 'en',
    units: 'metric',
    now: FIXTURE_NOW,
  });
  assert.equal(outputs.precipitation_expected, true);
  assert.equal(outputs.minutes_until, 50);
  assert.equal(outputs.precipitation_type, 'rain');
  assert.equal(outputs.precipitation, 1.2);
  assert.equal(outputs.probability, 80);
  assert.equal(outputs.summary, 'Light rain expected in 50 minutes (80% chance).');
});

test('the forecast of tomorrow, in German', () => {
  const outputs = dayForecast(forecastOf(HOUSES.galway.fixture), {
    house: HOUSES.galway,
    day: 'tomorrow',
    language: 'de',
    units: 'metric',
    timeZone: TZ,
    now: FIXTURE_NOW,
  });
  assert.equal(outputs.available, true);
  assert.ok(outputs.temperature_min <= outputs.temperature_max);
  assert.equal(typeof outputs.precipitation_probability, 'number');
  assert.equal(typeof outputs.wind_gust, 'number');
  assert.match(outputs.summary, /^Morgen: /);
});

test('the warnings of Kerry: highest level orange, not yet in effect', () => {
  const outputs = currentWarnings(realWarnings(), {
    county: 'EI11',
    language: 'en',
    timeZone: TZ,
    now: FIXTURE_NOW,
  });
  assert.equal(outputs.available, true);
  assert.equal(outputs.county, 'Kerry');
  assert.equal(outputs.has_warning, true);
  assert.equal(outputs.warning_count, 3);
  assert.equal(outputs.level, 'orange');
  assert.equal(outputs.in_effect, false);
  assert.equal(outputs.warning_type, 'rain');
  assert.equal(outputs.headline, 'Status Orange - Rain warning for Kerry');
  assert.match(
    outputs.summary,
    /^3 Met Éireann warnings for Kerry: Orange rain warning, from Sat, Oct 24, 07:00 to Sat, Oct 24, 14:00; /,
  );
  const later = currentWarnings(realWarnings(), {
    county: 'EI11',
    language: 'fr',
    timeZone: TZ,
    now: Date.parse('2026-10-24T08:00:00+01:00'),
  });
  assert.equal(later.in_effect, true);
});

test('no warning for Dublin; no county abroad; an unknown list says so', () => {
  const dublin = currentWarnings(realWarnings(), {
    county: 'EI07',
    language: 'es',
    timeZone: TZ,
    now: FIXTURE_NOW,
  });
  assert.equal(dublin.has_warning, false);
  assert.equal(dublin.level, 'none');
  assert.equal(dublin.summary, 'Ningún aviso de Met Éireann para Dublin.');
  assert.equal(
    currentWarnings(realWarnings(), { county: null, language: 'en', timeZone: TZ }).available,
    false,
  );
  assert.equal(
    currentWarnings(null, { county: 'EI07', language: 'en', timeZone: TZ }).available,
    false,
  );
});

test('the precipitation trigger fires on the dry → wet transition only', async () => {
  const events = [];
  let now = FIXTURE_NOW;
  const watcher = createPrecipitationWatcher({
    publish: async (key, data) => events.push({ key, data }),
    getLanguage: () => 'fr',
    getUnits: () => 'metric',
    logger: silentLogger(),
    now: () => now,
  });
  const dry = forecastOf(HOUSES.dublin.fixture);
  const wet = parseForecast(
    withHours(loadText(HOUSES.dublin.fixture), {
      '2026-10-23T19:00:00Z': { symbol: 13, amount: 3, probability: 70 },
    }),
  );
  assert.equal(await watcher.observe(HOUSES.dublin, dry), null, 'baseline');
  now += 30 * MINUTE;
  const data = await watcher.observe(HOUSES.dublin, wet);
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'precipitation_expected');
  assert.equal(data.house, 'home');
  assert.equal(data.precipitation_type, 'snow');
  assert.equal(data.minutes_until, 20);
  assert.equal(await watcher.observe(HOUSES.dublin, wet), null, 'still wet: no new event');
});

test('the warning trigger: baseline, then each change, in the language set', async () => {
  const events = [];
  const watcher = createWarningWatcher({
    publish: async (key, data) => events.push({ key, data }),
    getLanguage: () => 'fr',
    getCounty: (house) => house.county,
    timeZone: TZ,
    logger: silentLogger(),
    now: () => FIXTURE_NOW,
  });
  const house = { ...HOUSES.galway };
  const warnings = realWarnings();
  assert.deepEqual(await watcher.observe(house, warnings), [], 'baseline');
  assert.deepEqual(await watcher.observe(house, null), [], 'unknown list: no reading');

  // The orange wind warning is raised to red, the yellow rain one lifted.
  const next = warnings
    .filter((warning) => !(warning.level === 'yellow' && warning.type === 'rain'))
    .map((warning) =>
      warning.level === 'orange' ? { ...warning, level: 'red', rank: 3 } : warning,
    );
  const published = await watcher.observe(house, next);
  assert.deepEqual(
    published.map((data) => [data.change, data.level, data.warning_type]),
    [
      ['upgraded', 'red', 'wind'],
      ['lifted', 'yellow', 'rain'],
    ],
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].key, 'warning_changed');
  assert.deepEqual(Object.keys(events[0].data).sort(), [
    'change',
    'county',
    'description',
    'headline',
    'house',
    'house_name',
    'level',
    'summary',
    'warning_type',
  ]);
  assert.equal(events[0].data.house, 'seaside');
  assert.equal(events[0].data.county, 'Galway');
  assert.equal(
    events[0].data.summary,
    'Vigilance vent rouge relevée pour Galway, du sam. 24 oct., 14:00 au dim. 25 oct., 09:00.',
  );
  assert.equal(events[1].data.summary, 'Vigilance pluie jaune levée pour Galway.');
});

test('a house whose county changes takes a new baseline', async () => {
  const events = [];
  let county = 'EI07';
  const watcher = createWarningWatcher({
    publish: async (key, data) => events.push(data),
    getLanguage: () => 'en',
    getCounty: () => county,
    timeZone: TZ,
    logger: silentLogger(),
    now: () => FIXTURE_NOW,
  });
  await watcher.observe(HOUSES.dublin, realWarnings());
  county = 'EI11';
  await watcher.observe(HOUSES.dublin, realWarnings());
  assert.deepEqual(events, [], 'Kerry warnings are not "issued" because the setting changed');
});
