// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code registers or which values it sends — these tests
// keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { COUNTY_CHOICES, DEFAULT_CONFIG, LANGUAGE_CHOICES, UNITS_CHOICES } from '../src/config.js';
import { COUNTIES } from '../src/counties.js';
import { parseForecast } from '../src/forecast.js';
import { INTENSITIES, PRECIPITATION_TYPES, readNextHour } from '../src/next-hour.js';
import {
  DAYS,
  SCENE_ACTIONS,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
} from '../src/scene-actions.js';
import { SCENE_TRIGGERS, buildEventData } from '../src/scene-triggers.js';
import { SCENE_TRIGGERS_WARNINGS, buildWarningEventData } from '../src/warning-triggers.js';
import { CHANGES, LEVELS, WARNING_TYPES, parseWarnings, warningsOf } from '../src/warnings.js';
import {
  FIXTURE_NOW,
  HOUSES,
  forecastOf,
  loadFixture,
  loadText,
  silentLogger,
  withHours,
} from './helpers/fixtures.js';

const wetForecast = () =>
  parseForecast(
    withHours(loadText(HOUSES.dublin.fixture), {
      '2026-10-23T19:00:00Z': { symbol: 9, amount: 1, probability: 40 },
    }),
  );
const realWarnings = () => parseWarnings(loadFixture('real-warnings-ireland.json'), FIXTURE_NOW);

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const byKey = (list, key) => list.find((entry) => entry.key === key);

// The handlers the code registers, read from the fake Gladys of the SDK.
const gladys = createFakeGladys();
createApp(gladys, { logger: silentLogger(), setTimer: () => ({}), clearTimer: () => {} });

/**
 * @returns {Array<number>} The minimum version of `gladys_version`, e.g. [5, 2, 0].
 */
function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

/**
 * @param {Array<number>} version - A version.
 * @param {Array<number>} required - The minimum.
 * @returns {boolean} Whether version >= required.
 */
function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('a weather provider for the cloud, reading the houses', () => {
  assert.equal(manifest.type, 'weather');
  assert.equal(manifest.name, 'Met Éireann');
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.equal(manifest.location, true, 'getHouses() needs location: true');
  assert.deepEqual(manifest.categories, ['environment']);
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-met-eireann:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-met-eireann/main/cover.png',
  );
  assert.equal(manifest.widgets, undefined, 'the weather widget of the core draws it all');
});

test('scene cards and house lists require Gladys >= 5.2.0', () => {
  // scene_triggers / scene_actions: 5.1.0; `source: "houses"`: 5.2.0.
  assert.ok(allFields.some((field) => field.source === 'houses'));
  assert.ok(isAtLeast(minGladysVersion(), [5, 2, 0]), manifest.gladys_version);
});

test('house fields list the houses of Gladys, never static options', () => {
  for (const field of allFields.filter((f) => f.key === 'house')) {
    assert.equal(field.type, 'select');
    assert.equal(field.source, 'houses');
    assert.equal(field.options, undefined);
    assert.equal(field.default, undefined, 'a default is refused on a dynamic select');
    assert.equal(field.required, false, 'empty means every house, or the first');
  }
});

test('every manifest action has a handler, and vice versa', async () => {
  assert.deepEqual(keysOf(manifest.actions), ['test_connection']);
  // Without a house the action fails, but its handler ran.
  const ack = await gladys.fake.action('test_connection', {});
  assert.match(ack.error, /No house of Gladys has a location/);
  const unknown = await gladys.fake.action('nope', {});
  assert.equal(unknown.error, 'not implemented');
});

test('every scene action has a handler, and vice versa', async () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.values(SCENE_ACTIONS).sort());
  for (const key of Object.values(SCENE_ACTIONS)) {
    const ack = await gladys.fake.sceneAction(key, {});
    // Without a house the action fails, but its handler ran.
    assert.match(ack.error, /No house of Gladys has a location/, key);
  }
});

test('every scene trigger the code fires is declared, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [
    ...Object.values(SCENE_TRIGGERS),
    ...Object.values(SCENE_TRIGGERS_WARNINGS),
  ]);
});

test('the warning trigger filters are keys of the event, with the values the code sends', () => {
  const trigger = byKey(manifest.scene_triggers, SCENE_TRIGGERS_WARNINGS.WARNING_CHANGED);
  const options = (key) => byKey(trigger.fields, key).options.map((option) => option.value);
  assert.deepEqual(options('change'), Object.values(CHANGES));
  assert.deepEqual(options('level'), LEVELS);
  assert.deepEqual(options('warning_type'), WARNING_TYPES);
  const [warning] = warningsOf(realWarnings(), 'EI11');
  const data = buildWarningEventData(
    HOUSES.cork,
    { change: CHANGES.ISSUED, warning },
    { county: 'EI11', language: 'en', timeZone: 'Europe/Dublin', now: FIXTURE_NOW },
  );
  for (const field of trigger.fields) {
    assert.ok(Object.hasOwn(data, field.key), `the event carries the filter "${field.key}"`);
  }
  assert.deepEqual(
    keysOf(trigger.variables).sort(),
    Object.keys(data)
      .filter((key) => key !== 'house')
      .sort(),
  );
  for (const variable of trigger.variables) {
    assert.equal(typeof data[variable.key], variable.type, variable.key);
  }
});

test('the trigger filters are keys of the event, with the values the code sends', () => {
  const trigger = byKey(manifest.scene_triggers, SCENE_TRIGGERS.PRECIPITATION_EXPECTED);
  const options = (key) =>
    byKey(trigger.fields, key)
      .options.map((option) => option.value)
      .sort();
  assert.deepEqual(options('precipitation_type'), Object.values(PRECIPITATION_TYPES).sort());
  assert.deepEqual(options('intensity'), Object.values(INTENSITIES).sort());

  const reading = readNextHour(wetForecast(), FIXTURE_NOW);
  const data = buildEventData(HOUSES.dublin, reading, { language: 'en', units: 'metric' });
  for (const field of trigger.fields) {
    assert.ok(Object.hasOwn(data, field.key), `the event carries the filter "${field.key}"`);
  }
  // Variables: every key of the event but the house filter (a selector).
  assert.deepEqual(
    keysOf(trigger.variables).sort(),
    Object.keys(data)
      .filter((key) => key !== 'house')
      .sort(),
  );
  for (const variable of trigger.variables) {
    assert.equal(typeof data[variable.key], variable.type, variable.key);
  }
});

test('the action outputs are the keys the code returns, with their types', () => {
  const nextHour = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_PRECIPITATION_NEXT_HOUR);
  const wet = precipitationNextHour(wetForecast(), {
    language: 'en',
    units: 'metric',
    now: FIXTURE_NOW,
  });
  assert.deepEqual(keysOf(nextHour.outputs).sort(), Object.keys(wet).sort());

  const day = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_DAY_FORECAST);
  const galway = dayForecast(forecastOf(HOUSES.galway.fixture), {
    house: HOUSES.galway,
    day: DAYS.TOMORROW,
    language: 'en',
    units: 'metric',
    timeZone: 'Europe/Dublin',
    now: FIXTURE_NOW,
  });
  assert.deepEqual(keysOf(day.outputs).sort(), Object.keys(galway).sort());

  const warnings = byKey(manifest.scene_actions, SCENE_ACTIONS.GET_WARNINGS);
  const kerry = currentWarnings(realWarnings(), {
    county: 'EI11',
    language: 'en',
    timeZone: 'Europe/Dublin',
    now: FIXTURE_NOW,
  });
  assert.deepEqual(keysOf(warnings.outputs).sort(), Object.keys(kerry).sort());

  for (const [action, outputs] of [
    [nextHour, wet],
    [day, galway],
    [warnings, kerry],
  ]) {
    for (const output of action.outputs) {
      assert.equal(typeof outputs[output.key], output.type, `${action.key}.${output.key}`);
    }
  }
  assert.deepEqual(
    byKey(day.fields, 'day').options.map((option) => option.value),
    Object.values(DAYS),
  );
  assert.equal(byKey(day.fields, 'day').default, DAYS.TODAY);
});

test('config_schema keys and defaults stay consistent with DEFAULT_CONFIG', () => {
  const stored = manifest.config_schema.filter((field) => field.type !== 'section');
  assert.deepEqual(stored.map((field) => field.key).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const field of stored) {
    assert.equal(DEFAULT_CONFIG[field.key], field.default ?? null, field.key);
    assert.equal(field.required, false, `${field.key}: every setting is optional`);
  }
  const options = (key) => byKey(manifest.config_schema, key).options.map((o) => o.value);
  assert.deepEqual(options('language'), LANGUAGE_CHOICES);
  assert.deepEqual(options('units'), UNITS_CHOICES);
  assert.deepEqual([...options('county')].sort(), [...COUNTY_CHOICES].sort());
  for (const option of byKey(manifest.config_schema, 'county').options.slice(1)) {
    assert.equal(option.label.en, COUNTIES[option.value], 'the English name of the county');
  }
});

test('no secret: Met Éireann needs no key', () => {
  assert.ok(allFields.every((field) => field.type !== 'secret'));
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the configuration credits Met Éireann as its licence asks', () => {
  const intro = byKey(manifest.config_schema, 'intro');
  for (const text of Object.values(intro.description)) {
    assert.ok(text.includes('Copyright Met Éireann'), text);
    assert.ok(text.includes('CC BY 4.0'), text);
  }
});

test('field placeholders are multi-language objects', () => {
  for (const field of allFields.filter((f) => f.placeholder !== undefined)) {
    assert.equal(typeof field.placeholder, 'object', field.key);
    assert.ok(field.placeholder.en, field.key);
  }
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `${lang}: ${text.length} characters`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});
