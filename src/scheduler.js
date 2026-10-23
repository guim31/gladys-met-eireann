// -----------------------------------------------------------------------------
// The refresh timer: one cycle refreshes every located house, then waits for
// the next one.
//
// The cadence is not a setting: a cycle comes back when the cached answers
// expire, 30 minutes after they were fetched, as Met Éireann asks of a fair
// use of its open data (its models run every 3 to 6 hours). A random delay of
// up to 5 minutes is added: thousands of Gladys must not all call at the same
// second. Each cycle also reads the warning list once (app.js).
//
// A timer inside the container, not the Gladys device polling: a weather
// integration has no devices. It is a chain of timeouts rather than an
// interval, so that a failed cycle retried sooner re-plans cleanly.
//
// Houses at the same location share one call (forecast-store.js). A cycle
// stops at a 429 or a 403, which would repeat for every house; any other
// failure only skips its house. After a cycle where every call failed for a
// passing reason (network, 5xx), the next try comes sooner: 5, 10, 20, 40,
// then 60 minutes. Cycles never overlap: a cycle asked for while one runs is
// queued behind it.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './api.js';
import { createFailureLog } from './failure-log.js';

const MIN_INTERVAL_MS = 30 * 60 * 1000;
const JITTER_MS = 5 * 60 * 1000;
const RETRY_FIRST_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 60 * 60 * 1000;

/**
 * @description Create the refresh scheduler.
 * @param {object} options - Options.
 * @param {object} options.houses - The house registry (houses.js).
 * @param {object} options.store - The forecast store (forecast-store.js).
 * @param {Function} [options.onRefreshed] - `(house, entry) => Promise|void`,
 * called for every house after its forecast was refreshed.
 * @param {Function} [options.onCycle] - `(summary) => Promise|void`, called at
 * the end of each cycle with `{ houses, locations, refreshed, error, delayMs }`.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @param {Function} [options.random] - `() => [0, 1)`, for the tests.
 * @param {Function} [options.setTimer] - setTimeout, for the tests.
 * @param {Function} [options.clearTimer] - clearTimeout, for the tests.
 * @returns {object} The scheduler ({ start, stop, requestCycle, settled }).
 * @example
 * const scheduler = createScheduler({ houses, store });
 */
function createScheduler({
  houses,
  store,
  onRefreshed = () => {},
  onCycle = () => {},
  logger = console,
  now = Date.now,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  let running = null;
  let queued = false;
  let started = false;
  let failedCycles = 0;
  // Failures that repeat at every cycle are logged once (failure-log.js).
  const failures = createFailureLog(logger);

  /**
   * @description Arm the next cycle.
   * @param {number} delayMs - The delay.
   * @example
   * schedule(30 * 60000);
   */
  function schedule(delayMs) {
    if (!started) {
      return;
    }
    if (timer !== null) {
      clearTimer(timer);
    }
    timer = setTimer(() => {
      timer = null;
      return requestCycle();
    }, delayMs);
    // Never hold the process alive just for the timer.
    timer?.unref?.();
  }

  /**
   * @description The delay before the next cycle.
   * @param {Set<string>} keys - The locations of this cycle.
   * @param {object|null} error - The last error of the cycle.
   * @param {number} refreshed - How many locations were refreshed.
   * @returns {number} The delay in ms.
   * @example
   * nextDelay(keys, null, 1);
   */
  function nextDelay(keys, error, refreshed) {
    const jitter = Math.floor(random() * JITTER_MS);
    const blocked = store.blockedError();
    if (blocked !== null) {
      // Paused by a 429 or a 403: come back when the pause ends.
      return Math.max(0, store.blockedUntil - now()) + jitter;
    }
    if (error !== null && refreshed === 0) {
      failedCycles += 1;
      return Math.min(RETRY_FIRST_MS * 2 ** (failedCycles - 1), RETRY_MAX_MS) + jitter;
    }
    failedCycles = 0;
    const expiry = store.latestExpiry(keys);
    const untilExpiry = expiry === null ? 0 : expiry - now();
    return Math.max(MIN_INTERVAL_MS, untilExpiry) + jitter;
  }

  /**
   * @description Run one cycle: refresh every located house once.
   * @returns {Promise<object>} The summary.
   * @example
   * await cycle();
   */
  async function cycle() {
    const located = await houses.refresh();
    let refreshed = 0;
    let error = store.blockedError();

    // One call per distinct location, every house of it notified.
    const groups = new Map();
    for (const house of located) {
      const key = store.keyOf(house.latitude, house.longitude);
      groups.set(key, [...(groups.get(key) ?? []), house]);
    }

    if (error === null) {
      for (const group of groups.values()) {
        try {
          const entry = await store.refresh(group[0].latitude, group[0].longitude);
          refreshed += 1;
          for (const house of group) {
            try {
              await onRefreshed(house, entry);
              failures.recover(
                `observe:${house.id}`,
                `Post-refresh handling works again for "${house.name}"`,
              );
            } catch (err) {
              failures.fail(
                `observe:${house.id}`,
                `Post-refresh handling failed for "${house.name}": ${err.message}`,
              );
            }
          }
        } catch (err) {
          error = err;
          // The store already logged the failure of Met Éireann, once.
          logger.debug(`Refresh failed for "${group[0].name}": ${err.message}`);
          if (err.kind === ERROR_KINDS.THROTTLED || err.kind === ERROR_KINDS.FORBIDDEN) {
            break;
          }
        }
      }
    }
    const keys = new Set(groups.keys());
    store.prune(keys);

    const delayMs = nextDelay(keys, error, refreshed);
    const summary = {
      houses: located.length,
      locations: groups.size,
      refreshed,
      error,
      delayMs,
    };
    try {
      await onCycle(summary);
      failures.recover('end-of-cycle', 'End-of-cycle handling works again');
    } catch (err) {
      failures.fail('end-of-cycle', `End-of-cycle handling failed: ${err.message}`);
    }
    failures.recover('cycle', 'Refresh cycles run again');
    schedule(delayMs);
    return summary;
  }

  /**
   * @description Run a cycle now, or right after the one under way.
   * @returns {Promise<object>} The summary of the cycle that ran.
   * @example
   * await scheduler.requestCycle();
   */
  function requestCycle() {
    if (running !== null) {
      queued = true;
      return running;
    }
    running = cycle()
      .catch((err) => {
        failures.fail('cycle', `Refresh cycle failed: ${err.message}`);
        schedule(RETRY_FIRST_MS);
        return { houses: 0, locations: 0, refreshed: 0, error: err, delayMs: RETRY_FIRST_MS };
      })
      .finally(() => {
        running = null;
        if (queued) {
          queued = false;
          requestCycle();
        }
      });
    return running;
  }

  /**
   * @description Start the refreshes: a first cycle right away.
   * @returns {Promise<object>} The summary of the first cycle.
   * @example
   * await scheduler.start();
   */
  function start() {
    started = true;
    return requestCycle();
  }

  /**
   * @description Wait for the cycle under way, if any (and the one queued
   * behind it).
   * @returns {Promise<void>} Resolves once no cycle runs.
   * @example
   * await scheduler.settled();
   */
  async function settled() {
    while (running !== null) {
      await running;
    }
  }

  /**
   * @description Stop the refreshes.
   * @example
   * scheduler.stop();
   */
  function stop() {
    started = false;
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    requestCycle,
    settled,
    get started() {
      return started;
    },
  };
}

export { JITTER_MS, MIN_INTERVAL_MS, RETRY_FIRST_MS, RETRY_MAX_MS, createScheduler };
