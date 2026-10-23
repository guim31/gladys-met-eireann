// -----------------------------------------------------------------------------
// What the integration writes in its logs, and the timer that refreshes on its
// own. At the default level (info), the logs keep the lifecycle only: a
// normal refresh cycle writes nothing, and a failure that repeats at every
// cycle is one warning, then one line when it works again. The rest is debug
// (LOG_LEVEL=debug).
//
// The refreshes come from the timer of the container (scheduler.js), never
// from the device polling of the core: a weather provider has no device, and
// the core 5.2.0 polls nothing created without `should_poll` (Gladys#3198).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import {
  FIXTURE_NOW,
  HOUSES,
  asGladysHouse,
  fakeFetch,
  manualClock,
  meRoute,
  recordingLogger,
} from './helpers/fixtures.js';

/**
 * @param {object} [options] - { route }.
 * @returns {Promise<object>} { gladys, app, fetchImpl, now, logger, fireTimer }.
 */
async function start({ route } = {}) {
  const now = manualClock(FIXTURE_NOW);
  const fetchImpl = fakeFetch(route ? route(now) : meRoute());
  const gladys = createFakeGladys({ houses: [asGladysHouse(HOUSES.dublin)] });
  const logger = recordingLogger();
  const timers = [];
  const app = createApp(gladys, {
    fetchImpl,
    now,
    random: () => 0,
    timeZone: 'Europe/Dublin',
    logger,
    setTimer: (fn, delay) => {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      timer.cleared = true;
    },
  });
  await gladys.connect();
  await app.scheduler.settled();
  // Let the time pass until the armed timer fires, as setTimeout would.
  const fireTimer = async () => {
    const timer = timers.filter((candidate) => !candidate.cleared).at(-1);
    assert.ok(timer, 'a next refresh is armed');
    timer.cleared = true;
    now.advance(timer.delay);
    await timer.fn();
    await app.scheduler.settled();
  };
  return { gladys, app, fetchImpl, now, logger, fireTimer };
}

test('the timer of the container refreshes on its own, without any poll of the core', async () => {
  const { gladys, fetchImpl, fireTimer } = await start();
  // A forecast and the warning list per cycle.
  assert.equal(fetchImpl.calls.length, 2, 'the first cycle runs at connection');
  await fireTimer();
  assert.equal(fetchImpl.calls.length, 4, 'the armed timer called Met Éireann again');
  await fireTimer();
  assert.equal(fetchImpl.calls.length, 6, 'and it re-arms itself');
  // A weather provider: no device for the core to poll.
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('normal refresh cycles write nothing at info level', async () => {
  const { logger, fireTimer } = await start();
  await fireTimer();
  await fireTimer();
  assert.deepEqual(logger.at('info'), []);
  assert.deepEqual(logger.at('warn'), []);
  assert.deepEqual(logger.at('error'), []);
  assert.ok(logger.at('debug').length > 0, 'the cycles are still told in debug');
});

test('a failure that repeats is one warning, then one line when Met Éireann answers again', async () => {
  let down = true;
  const { logger, fetchImpl, fireTimer } = await start({
    route: () => (url) => (down ? { status: 503, body: 'down' } : meRoute()(url)),
  });
  await fireTimer();
  await fireTimer();
  assert.equal(fetchImpl.calls.length, 6, 'three failed cycles');
  // One for the forecast, one for the warnings, never repeated.
  assert.equal(logger.at('warn').length, 2, logger.at('warn').join('\n'));
  assert.match(logger.at('warn')[0], /HTTP 503/);
  assert.deepEqual(logger.at('info'), []);

  down = false;
  await fireTimer();
  assert.deepEqual(logger.at('info').sort(), [
    'Met Éireann answers again',
    'The Met Éireann warnings are readable again',
  ]);
  await fireTimer();
  assert.equal(logger.at('warn').length, 2);
  assert.equal(logger.at('info').length, 2, 'nothing more once it works');
  assert.deepEqual(logger.at('error'), []);
});

test('no log line carries the address of the API', async () => {
  const { logger, fireTimer } = await start({
    route: () => () => ({ status: 500, body: 'oops' }),
  });
  await fireTimer();
  for (const { message } of logger.lines) {
    assert.doesNotMatch(message, /https?:\/\//);
  }
});

test('a repeated failure of another kind warns again', async () => {
  let status = 503;
  const { logger, fireTimer } = await start({
    route: () => () => ({ status, body: 'nope' }),
  });
  status = 429;
  await fireTimer();
  // The forecast and the warnings, each once more.
  assert.equal(logger.at('warn').length, 4);
  assert.match(logger.at('warn')[2], /429/);
  assert.match(logger.at('warn')[3], /429/);
});
