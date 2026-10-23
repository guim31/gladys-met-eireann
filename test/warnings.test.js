// -----------------------------------------------------------------------------
// Met Éireann warnings: the real list of 2026-10-23 (Storm Boelo), the
// warnings of a county, the pivot alerts and the changes between readings.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_ALERT_SEVERITIES, WEATHER_ALERT_TYPES } from '@gladysassistant/integration-sdk';
import {
  RETRY_AFTER_FAILURE_MS,
  WARNINGS_MAX_AGE_MS,
  createWarningStore,
  diffWarnings,
  htmlToText,
  parseWarnings,
  toAlerts,
  typeOf,
  warningsOf,
} from '../src/warnings.js';
import {
  FIXTURE_NOW,
  fakeFetch,
  loadFixture,
  manualClock,
  silentLogger,
} from './helpers/fixtures.js';

const real = () => parseWarnings(loadFixture('real-warnings-ireland.json'), FIXTURE_NOW);

test('the real list is read: id, level, phenomenon, times, counties', () => {
  const warnings = real();
  assert.equal(warnings.length, 5);
  const kerry = warnings.find((warning) => warning.level === 'orange' && warning.type === 'rain');
  assert.equal(kerry.id, '2026-10-23T09:17:47.490498+01:00|Rain');
  assert.equal(kerry.level, 'orange');
  assert.equal(kerry.rank, 2);
  assert.equal(kerry.type, 'rain');
  assert.equal(kerry.title, 'Status Orange - Rain warning');
  assert.equal(kerry.onset, Date.parse('2026-10-24T07:00:00+01:00'));
  assert.equal(kerry.expiry, Date.parse('2026-10-24T14:00:00+01:00'));
  assert.deepEqual(kerry.regions, ['EI11']);
  assert.match(
    kerry.description,
    /^Storm Boelo will bring spells of very heavy and intense rain\.\nPrepare for impacts:\n- Damage/,
  );
});

test('the warnings of a county, highest level first', () => {
  const galway = warningsOf(real(), 'EI10');
  assert.deepEqual(
    galway.map((warning) => `${warning.level} ${warning.type}`),
    ['orange wind', 'yellow rain', 'yellow wind'],
  );
  assert.deepEqual(warningsOf(real(), 'EI07'), [], 'nothing for Dublin');
  assert.deepEqual(warningsOf(real(), null), []);
});

test('expired warnings and malformed entries are dropped', () => {
  const later = parseWarnings(
    loadFixture('real-warnings-ireland.json'),
    Date.parse('2026-10-24T14:30:00+01:00'),
  );
  assert.ok(
    !later.some((warning) => warning.level === 'orange' && warning.type === 'rain'),
    'the Kerry warning ended at 14:00',
  );
  assert.equal(later.length, 4);
  assert.deepEqual(
    parseWarnings([{ issued: 'x', level: 'purple', regions: ['EI07'] }, { level: 'red' }, null], 0),
    [],
  );
  assert.deepEqual(parseWarnings('nope', 0), []);
});

test('pivot alerts: CAP severity, phenomenon, short event, plain description', () => {
  const alerts = toAlerts(warningsOf(real(), 'EI11'));
  assert.deepEqual(
    alerts.map((alert) => [alert.severity, alert.type, alert.event]),
    [
      [WEATHER_ALERT_SEVERITIES.SEVERE, WEATHER_ALERT_TYPES.RAIN, 'Status Orange - Rain warning'],
      [WEATHER_ALERT_SEVERITIES.MODERATE, WEATHER_ALERT_TYPES.RAIN, 'Status Yellow - Rain warning'],
      [WEATHER_ALERT_SEVERITIES.MODERATE, WEATHER_ALERT_TYPES.WIND, 'Status Yellow - Wind warning'],
    ],
  );
  assert.equal(alerts[0].start, '2026-10-24T06:00:00.000Z');
  assert.equal(alerts[0].end, '2026-10-24T13:00:00.000Z');
  assert.doesNotMatch(alerts[0].description, /<|&nbsp;/);
  assert.match(alerts[0].description, /^Status Orange - Rain warning for Kerry\n/);
  for (const alert of alerts) {
    assert.ok(alert.event.length <= 100);
  }
});

test('the phenomena of Met Éireann map to the types of the core', () => {
  const cases = {
    Wind: 'wind',
    Rain: 'rain',
    'Snow-Ice': 'snow',
    'Snow/Ice': 'snow',
    Thunderstorm: 'thunderstorm',
    Fog: 'fog',
    'Low Temperature': 'cold',
    'High Temperature': 'heat',
    'Coastal Event': 'coastal',
    Flooding: 'flood',
    'Something new': 'other',
  };
  for (const [raw, type] of Object.entries(cases)) {
    assert.equal(typeOf(raw), type, raw);
    if (type !== 'other') {
      assert.ok(Object.values(WEATHER_ALERT_TYPES).includes(type), type);
    }
  }
  const [alert] = toAlerts(
    parseWarnings([{ issued: 'x', level: 'red', type: 'Volcano', regions: ['EI07'] }], 0),
  );
  assert.equal(alert.type, undefined, 'an unknown phenomenon has no type');
  assert.equal(alert.severity, 'extreme');
  assert.equal(alert.event, 'Volcano warning');
});

test('HTML entities and lists become plain text', () => {
  assert.equal(
    htmlToText('<p>A&nbsp;&amp;&#233;&#x41;</p><ul><li>x</li><li>y</li></ul>'),
    'A &éA\n- x\n- y',
  );
  assert.equal(htmlToText(null), '');
});

test('the identity of a warning survives its renumbering in the list', () => {
  const renumbered = loadFixture('real-warnings-ireland.json').map((warning, index) => ({
    ...warning,
    id: index + 100,
  }));
  assert.deepEqual(diffWarnings(real(), parseWarnings(renumbered, FIXTURE_NOW)), []);
});

test('changes: issued, upgraded, downgraded, updated, lifted', () => {
  const before = warningsOf(real(), 'EI10');
  const [orange, yellowRain, yellowWind] = before;
  const after = [
    { ...orange, level: 'red', rank: 3 },
    { ...yellowRain, updated: yellowRain.updated + 60000 },
    { ...yellowRain, id: '42', level: 'yellow', type: 'fog' },
  ];
  const changes = diffWarnings(before, after).map(({ change, warning }) => [change, warning.id]);
  assert.deepEqual(changes, [
    ['upgraded', orange.id],
    ['updated', yellowRain.id],
    ['issued', '42'],
    ['lifted', yellowWind.id],
  ]);
  assert.deepEqual(
    diffWarnings([orange], [{ ...orange, level: 'yellow', rank: 1 }]).map(({ change }) => change),
    ['downgraded'],
  );
  assert.deepEqual(diffWarnings(before, before), []);
});

test('the warning list is read once per 30 minutes, a failure keeps the last one', async () => {
  const now = manualClock(FIXTURE_NOW);
  let fail = false;
  const fetchImpl = fakeFetch(() =>
    fail ? { status: 503, body: '' } : { body: loadFixture('real-warnings-ireland.json') },
  );
  const store = createWarningStore({ fetchImpl, now, logger: silentLogger() });
  assert.equal(store.current(), null);
  assert.equal((await store.load()).length, 5);
  assert.equal((await store.load()).length, 5);
  assert.equal(fetchImpl.calls.length, 1);
  now.advance(WARNINGS_MAX_AGE_MS);
  fail = true;
  await assert.rejects(store.refresh());
  assert.equal((await store.load()).length, 5, 'the last list, still recent');
  now.advance(3 * 60 * 60 * 1000);
  assert.equal(await store.load(), null, 'too old: unknown');
});

test('a 429 pauses the warning calls for an hour', async () => {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(() => ({ status: 429, body: '' }));
  const store = createWarningStore({ fetchImpl, now, logger: silentLogger() });
  await assert.rejects(store.refresh());
  now.advance(30 * 60 * 1000);
  await assert.rejects(store.refresh(), /paused/);
  assert.equal(fetchImpl.calls.length, 1);
  now.advance(31 * 60 * 1000);
  await assert.rejects(store.refresh());
  assert.equal(fetchImpl.calls.length, 2);
});

test('after a failure, readers do not call again for 5 minutes', async () => {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(() => ({ status: 503, body: '' }));
  const store = createWarningStore({ fetchImpl, now, logger: silentLogger() });
  assert.equal(await store.load(), null);
  assert.equal(await store.load(), null);
  assert.equal(fetchImpl.calls.length, 1, 'a dashboard open does not wait 10 s again');
  now.advance(RETRY_AFTER_FAILURE_MS);
  await store.load();
  assert.equal(fetchImpl.calls.length, 2);
});
