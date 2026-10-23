// -----------------------------------------------------------------------------
// The forecast store: the last forecast of each location, and the only thing
// that ever calls the Met Éireann forecast API.
//
// Every reader — the core's weather requests (dashboard, chat, the core's
// 30-minute alert check), the scene actions, the "Test" button — is served
// from memory. The scheduler (scheduler.js) refreshes the houses; a reader
// only causes a call for a location nobody refreshed recently (a house added
// since the last cycle), and concurrent requests for one location share one
// call.
//
// The cadence is enforced HERE, so that no caller can break it:
//   - one call per location every 30 minutes at most: refresh() serves the
//     cache until then, however often it is asked (Met Éireann sends no
//     `Expires` and ignores `If-Modified-Since`; its models run every 3 to 6
//     hours);
//   - a 429 blocks every call, with a doubling delay (10 minutes, up to
//     2 hours) or the server's `Retry-After`;
//   - a 403 blocks every call for 6 hours: insisting would get the
//     integration banned for every Gladys user.
//
// When a call fails, a forecast up to 3 hours old is still served: an hour-old
// forecast beats the core falling back to another provider or an empty
// dashboard. Older, the request fails and the core moves on.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, MetEireannError, fetchForecast } from './api.js';
import { createFailureLog } from './failure-log.js';
import { parseForecast } from './forecast.js';

// Beyond this, a cached forecast is no longer served when a refresh fails.
const STALE_MAX_MS = 3 * 60 * 60 * 1000;

// An answer is taken as valid this long: the floor between two calls.
const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

const THROTTLE_FIRST_MS = 10 * 60 * 1000;
const THROTTLE_MAX_MS = 2 * 60 * 60 * 1000;
const FORBIDDEN_BLOCK_MS = 6 * 60 * 60 * 1000;
// A location without forecast (outside the domain of the models) is not
// asked again for this long.
const NO_FORECAST_MS = DEFAULT_EXPIRY_MS;

/**
 * @description The cache key of a location: the coordinates as sent (4
 * decimals).
 * @param {number} latitude - The latitude.
 * @param {number} longitude - The longitude.
 * @returns {string} The key.
 * @example
 * locationKey(53.349812, -6.2603); // -> '53.3498,-6.2603'
 */
function locationKey(latitude, longitude) {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/**
 * @description Create the forecast store.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch, injectable for the tests.
 * @param {Function} [options.now] - `() => ms`, injectable for the tests.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @returns {object} The store.
 * @example
 * const store = createForecastStore();
 */
function createForecastStore({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = console,
} = {}) {
  // key -> { forecast, fetchedAt, checkedAt, expiresAt }
  const entries = new Map();
  // key -> Promise of the call under way
  const inflight = new Map();
  // key -> { until, error } of the locations Met Éireann has no forecast for
  const missing = new Map();
  // { kind, message, at } of the last failed call, null after a success.
  let lastError = null;
  let blockedUntil = 0;
  let blockedKind = null;
  let throttleMs = THROTTLE_FIRST_MS;
  // One warning when Met Éireann starts failing, one line when it answers again.
  const failures = createFailureLog(logger);
  let calls = 0;

  /**
   * @description Why calls are refused right now, if they are.
   * @returns {MetEireannError|null} The error to throw, or null.
   * @example
   * store.blockedError();
   */
  function blockedError() {
    if (blockedUntil > now()) {
      return new MetEireannError(
        blockedKind,
        `Met Éireann calls paused until ${new Date(blockedUntil).toISOString()} (${blockedKind})`,
      );
    }
    return null;
  }

  /**
   * @description Remember a failure, and pause the calls when MET asks.
   * @param {MetEireannError} err - The error.
   * @example
   * recordFailure(err);
   */
  function recordFailure(err, key) {
    const kind = err.kind ?? ERROR_KINDS.NETWORK;
    lastError = { kind, message: err.message, at: now() };
    if (kind === ERROR_KINDS.THROTTLED) {
      const delay = Math.min(Math.max(err.retryAfterMs ?? 0, throttleMs), THROTTLE_MAX_MS);
      blockedUntil = now() + delay;
      blockedKind = kind;
      throttleMs = Math.min(throttleMs * 2, THROTTLE_MAX_MS);
      failures.fail(
        'met',
        `Met Éireann throttles the requests (429): pausing ${Math.round(delay / 60000)} min`,
        { kind },
      );
    } else if (kind === ERROR_KINDS.FORBIDDEN) {
      blockedUntil = now() + FORBIDDEN_BLOCK_MS;
      blockedKind = kind;
      failures.fail('met', 'Met Éireann refused the requests (403): pausing 6 hours', {
        kind,
        level: 'error',
      });
    } else if (kind === ERROR_KINDS.INVALID) {
      // Usually a house outside the domain of the models: not an outage, and
      // not asked again before 30 minutes.
      missing.set(key, { until: now() + NO_FORECAST_MS, error: err });
      failures.fail(`met:${key}`, `No usable Met Éireann forecast for a house: ${err.message}`, {
        kind,
        level: 'info',
      });
    } else {
      // One key per location: a house that fails must not hide, or be hidden
      // by, one that works.
      failures.fail(`met:${key}`, `Met Éireann request failed: ${err.message}`, { kind });
    }
  }

  /**
   * @description Call the API for a location — unless its cached answer has
   * not expired yet — sharing a call under way.
   * @param {number} latitude - The latitude.
   * @param {number} longitude - The longitude.
   * @returns {Promise<object>} The entry `{ forecast, fetchedAt, checkedAt,
   * expiresAt }`.
   * @throws {MetEireannError} When the call fails or is paused.
   * @example
   * await store.refresh(53.3498, -6.2603);
   */
  function refresh(latitude, longitude) {
    const key = locationKey(latitude, longitude);
    const cached = entries.get(key);
    if (cached !== undefined && cached.expiresAt > now()) {
      return Promise.resolve(cached);
    }
    const pending = inflight.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const absent = missing.get(key);
    if (absent !== undefined && absent.until > now()) {
      return Promise.reject(absent.error);
    }
    const blocked = blockedError();
    if (blocked !== null) {
      return Promise.reject(blocked);
    }
    const call = (async () => {
      calls += 1;
      try {
        const xml = await fetchForecast({ latitude, longitude, fetchImpl, now });
        let forecast;
        try {
          forecast = parseForecast(xml);
        } catch (err) {
          throw new MetEireannError(ERROR_KINDS.INVALID, err.message, { status: 200 });
        }
        const at = now();
        const entry = { forecast, fetchedAt: at, checkedAt: at, expiresAt: at + DEFAULT_EXPIRY_MS };
        entries.set(key, entry);
        missing.delete(key);
        lastError = null;
        throttleMs = THROTTLE_FIRST_MS;
        failures.recover('met', 'Met Éireann answers again');
        failures.recover(`met:${key}`, 'Met Éireann answers again');
        return entry;
      } catch (err) {
        recordFailure(err, key);
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, call);
    return call;
  }

  /**
   * @description The cached entry of a location, whatever its age.
   * @param {number} latitude - The latitude.
   * @param {number} longitude - The longitude.
   * @returns {object|null} The entry, or null.
   * @example
   * store.peek(53.3498, -6.2603);
   */
  function peek(latitude, longitude) {
    return entries.get(locationKey(latitude, longitude)) ?? null;
  }

  /**
   * @description The forecast of a location for a reader: the cached one when
   * checked less than `maxAgeMs` ago, else a refresh — falling back to a
   * cached one up to 3 hours old when the call fails.
   * @param {number} latitude - The latitude.
   * @param {number} longitude - The longitude.
   * @param {object} options - Options.
   * @param {number} options.maxAgeMs - The age under which the cache is used
   * without asking Met Éireann.
   * @returns {Promise<object>} The entry, with `stale`.
   * @throws {MetEireannError} When there is nothing to serve.
   * @example
   * const { forecast } = await store.load(53.3498, -6.2603, { maxAgeMs: 35 * 60000 });
   */
  async function load(latitude, longitude, { maxAgeMs }) {
    const cached = peek(latitude, longitude);
    if (cached !== null && now() - cached.checkedAt <= maxAgeMs) {
      return { ...cached, stale: false };
    }
    try {
      return { ...(await refresh(latitude, longitude)), stale: false };
    } catch (err) {
      if (cached !== null && now() - cached.checkedAt <= STALE_MAX_MS) {
        const minutes = Math.round((now() - cached.checkedAt) / 60000);
        // The failure itself was logged once by recordFailure.
        logger.debug(`Serving a forecast checked ${minutes} min ago: ${err.message}`);
        return { ...cached, stale: true };
      }
      throw err;
    }
  }

  /**
   * @description The earliest instant a cached location may be asked again.
   * @param {Set<string>} keys - The keys of the locations to consider.
   * @returns {number|null} The latest expiry among them, in ms, or null.
   * @example
   * store.latestExpiry(new Set(['53.3498,-6.2603']));
   */
  function latestExpiry(keys) {
    let latest = null;
    for (const key of keys) {
      const entry = entries.get(key);
      if (entry !== undefined && (latest === null || entry.expiresAt > latest)) {
        latest = entry.expiresAt;
      }
    }
    return latest;
  }

  /**
   * @description Drop the entries of locations no longer refreshed, once they
   * are too old to be served: memory stays bounded by the houses.
   * @param {Set<string>} keep - The keys of the refreshed locations.
   * @example
   * store.prune(new Set(['53.3498,-6.2603']));
   */
  function prune(keep) {
    for (const [key, entry] of entries) {
      if (!keep.has(key) && now() - entry.checkedAt > STALE_MAX_MS) {
        entries.delete(key);
      }
    }
    for (const [key, absent] of missing) {
      if (absent.until <= now()) {
        missing.delete(key);
      }
    }
  }

  return {
    refresh,
    peek,
    load,
    latestExpiry,
    prune,
    blockedError,
    keyOf: locationKey,
    get lastError() {
      return lastError;
    },
    get blockedUntil() {
      return blockedUntil;
    },
    get calls() {
      return calls;
    },
    get size() {
      return entries.size;
    },
  };
}

export {
  DEFAULT_EXPIRY_MS,
  FORBIDDEN_BLOCK_MS,
  STALE_MAX_MS,
  THROTTLE_FIRST_MS,
  THROTTLE_MAX_MS,
  createForecastStore,
  locationKey,
};
