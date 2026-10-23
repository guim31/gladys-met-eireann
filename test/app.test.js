// -----------------------------------------------------------------------------
// The integration end to end, against the fake Gladys of the SDK
// (@gladysassistant/integration-sdk/testing): a real GladysIntegration whose
// transport is in memory, with the checks of the core on what it sends.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { WARNINGS_URL } from '../src/api.js';
import { createApp } from '../src/app.js';
import { MESSAGES } from '../src/texts.js';
import {
  FIXTURE_NOW,
  HOUSES,
  asGladysHouse,
  fakeFetch,
  loadFixture,
  loadText,
  manualClock,
  meRoute,
  silentLogger,
  withHours,
} from './helpers/fixtures.js';

const MINUTE = 60 * 1000;

/**
 * @param {object} [options] - { houses, config, route }.
 * @returns {Promise<object>} { gladys, app, fetchImpl, now }.
 */
async function start({ houses = [HOUSES.dublin], config = {}, route } = {}) {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(route ?? meRoute());
  const gladys = createFakeGladys({ houses: houses.map(asGladysHouse), config });
  const app = createApp(gladys, {
    fetchImpl,
    now,
    random: () => 0,
    timeZone: 'Europe/Dublin',
    logger: silentLogger(),
    // No real timer: the tests must not keep the process alive.
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  await gladys.connect();
  await app.scheduler.settled();
  return { gladys, app, fetchImpl, now };
}

const forecastCalls = (fetchImpl) => fetchImpl.calls.filter((call) => call.url !== WARNINGS_URL);
const warningCalls = (fetchImpl) => fetchImpl.calls.filter((call) => call.url === WARNINGS_URL);

test('at connection, the houses and the warnings are read; no device', async () => {
  const { gladys, fetchImpl } = await start({ houses: [HOUSES.dublin, HOUSES.cork] });
  assert.equal(forecastCalls(fetchImpl).length, 2);
  assert.equal(warningCalls(fetchImpl).length, 1, 'one warning list for every house');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  // A weather provider: no device, no state (no conformity test of devices
  // to run here).
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.deepEqual(gladys.fake.states, []);
});

test('a weather request is answered from memory, with the alerts of the county', async () => {
  const { gladys, fetchImpl } = await start({ houses: [HOUSES.galway] });
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.galway.latitude,
    longitude: HOUSES.galway.longitude,
    language: 'en',
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  const { weather } = ack.data;
  assert.equal(weather.hours.length, 24);
  assert.equal(weather.days.length, 8);
  assert.deepEqual(
    weather.alerts.map((alert) => `${alert.severity} ${alert.type}`),
    ['severe wind', 'moderate rain', 'moderate wind'],
  );
  assert.equal(fetchImpl.calls.length, 2, 'no new call');

  const dublin = await gladys.fake.weatherGet({
    latitude: HOUSES.dublin.latitude,
    longitude: HOUSES.dublin.longitude,
    language: 'en',
    units: 'us',
  });
  assert.equal(dublin.success, true);
  assert.equal(dublin.data.weather.temperature, 46.9);
  assert.equal(dublin.data.weather.alerts, undefined, 'no warning for Dublin');
});

test('outside the domain of Met Éireann, the core falls through to another provider', async () => {
  const { gladys } = await start();
  const ack = await gladys.fake.weatherGet({
    latitude: HOUSES.paris.latitude,
    longitude: HOUSES.paris.longitude,
    language: 'fr',
    units: 'metric',
  });
  assert.equal(ack.success, false);
  const noLocation = await gladys.fake.weatherGet({ language: 'en', units: 'metric' });
  assert.equal(noLocation.success, false);
});

test('only a house abroad: the status says no forecast', async () => {
  const { gladys } = await start({ houses: [HOUSES.paris] });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.noForecast,
  });
});

test('no located house: the status says where to set it', async () => {
  const { gladys, fetchImpl } = await start({ houses: [] });
  assert.equal(forecastCalls(fetchImpl).length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.noLocation,
  });
});

test('a refusal (403) shows in the status', async () => {
  const { gladys } = await start({ route: () => ({ status: 403, body: 'Forbidden' }) });
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: false,
    message: MESSAGES.forbidden,
  });
});

test('the scene actions answer in the language and the units set', async () => {
  const { gladys } = await start({
    houses: [HOUSES.dublin, HOUSES.cork],
    config: { language: 'es', units: 'us' },
  });
  const nextHour = await gladys.fake.sceneAction('get_precipitation_next_hour', { house: 'home' });
  assert.deepEqual(nextHour.data.outputs, {
    available: true,
    precipitation_expected: false,
    summary: 'No se esperan precipitaciones en la próxima hora.',
  });
  const tomorrow = await gladys.fake.sceneAction('get_day_forecast', {
    house: 'cottage',
    day: 'tomorrow',
  });
  assert.equal(tomorrow.success, true);
  assert.match(tomorrow.data.outputs.summary, /^Mañana: .* °F/);
  const warnings = await gladys.fake.sceneAction('get_warnings', { house: 'cottage' });
  assert.equal(warnings.data.outputs.county, 'Cork');
  assert.equal(warnings.data.outputs.level, 'yellow');
  assert.match(
    warnings.data.outputs.summary,
    /^1 aviso de Met Éireann para Cork: Aviso amarillo por lluvia/,
  );
  const unknown = await gladys.fake.sceneAction('get_day_forecast', { house: 'nowhere' });
  assert.equal(unknown.success, false);
});

test('the county setting overrides the guess', async () => {
  const { gladys } = await start({ config: { county: 'EI11', language: 'en' } });
  const ack = await gladys.fake.sceneAction('get_warnings', {});
  assert.equal(ack.data.outputs.county, 'Kerry');
  assert.equal(ack.data.outputs.level, 'orange');
});

test('a warning change fires the trigger and nudges the core', async () => {
  let warnings = loadFixture('real-warnings-ireland.json');
  const route = meRoute({ warnings: () => warnings });
  const { gladys, app, now } = await start({
    houses: [HOUSES.cork],
    route,
    config: { language: 'en' },
  });
  assert.deepEqual(gladys.fake.sceneEvents, [], 'the first reading is a baseline');
  // Met Éireann extends the rain warning to Dublin and lifts it in Cork.
  warnings = warnings.map((warning) =>
    warning.level === 'yellow' && warning.type === 'Rain'
      ? { ...warning, regions: warning.regions.filter((region) => region !== 'EI04') }
      : warning,
  );
  now.advance(31 * MINUTE);
  await app.scheduler.requestCycle();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  const [event] = gladys.fake.sceneEvents;
  assert.equal(event.key, 'warning_changed');
  assert.equal(event.data.change, 'lifted');
  assert.equal(event.data.summary, 'Yellow rain warning lifted for Cork.');
  assert.equal(gladys.fake.weatherRefreshes, 1);
});

test('the precipitation trigger fires through Gladys when rain comes into the hour', async () => {
  let wet = false;
  const route = meRoute({
    forecast: (house) =>
      wet
        ? withHours(loadText(house.fixture), {
            '2026-10-23T19:00:00Z': { symbol: 46, amount: 0.4, probability: 65 },
          })
        : loadText(house.fixture),
  });
  const { gladys, app, now } = await start({ route, config: { language: 'en' } });
  wet = true;
  now.advance(31 * MINUTE);
  await app.scheduler.requestCycle();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: 'precipitation_expected',
      data: {
        house: 'home',
        house_name: 'Home',
        // 18:41: the rain of 19:00 starts in 19 minutes.
        summary: 'Light rain expected in 19 minutes (65% chance).',
        minutes_until: 19,
        precipitation_type: 'rain',
        intensity: 'light',
        thunder: false,
        precipitation: 0.4,
        probability: 65,
      },
    },
  ]);
});

test('the test action reports the temperature and the warnings in four languages', async () => {
  const { gladys } = await start({ houses: [HOUSES.cork] });
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  const { message } = ack.data;
  assert.match(
    message.en,
    /^It works: 47\.7 °F \(8\.7 °C\) now at Cottage, forecast of 16:35\. 1 Met Éireann warning for Cork: Yellow rain warning\.$/,
  );
  assert.equal(
    message.fr,
    'Ça fonctionne : 8,7 °C en ce moment à Cottage, prévision de 16:35. 1 vigilance Met Éireann pour Cork : Vigilance pluie jaune.',
  );
  assert.deepEqual(Object.keys(message).sort(), ['de', 'en', 'es', 'fr']);
});

test('a new county setting refreshes at once', async () => {
  const { gladys, fetchImpl, now } = await start();
  now.advance(31 * MINUTE);
  await gladys.fake.configUpdated({ county: 'EI11', language: 'fr', units: 'auto' });
  assert.equal(warningCalls(fetchImpl).length, 2);
  await gladys.fake.configUpdated({ county: 'EI11', language: 'en', units: 'auto' });
  assert.equal(warningCalls(fetchImpl).length, 2, 'the language alone calls nothing');
});
