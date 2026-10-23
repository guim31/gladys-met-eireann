// -----------------------------------------------------------------------------
// The integration, wired to a Gladys client.
//
// Met Éireann is a WEATHER integration (manifest `type: "weather"`, contract
// B.18): no devices, no discovery — a provider API. Gladys asks for the
// weather of a house, the integration answers in the pivot format, with the
// Met Éireann warnings of its county as alerts, and the core feeds its
// weather widget, its weather-alert trigger and the chat assistant with it.
//
//   onWeatherGet       the pivot payload, from the forecast in memory;
//   onSceneAction      "precipitation of the next hour", "forecast of the
//                      day" and "Met Éireann warnings" (scene-actions.js);
//   publishSceneEvent  "precipitation expected within the hour"
//                      (scene-triggers.js) and "Met Éireann warning changed"
//                      (warning-triggers.js);
//   requestWeatherRefresh  after a warning change, so that the core's own
//                      weather-alert trigger sees it within a minute;
//   onAction           "Test Met Éireann".
//
// No widget: the weather widget of the core already draws everything the
// forecast has (current conditions, 24 hours with their rain, 8 days, the
// warnings).
//
// One timer refreshes every located house and the warning list every 30
// minutes (scheduler.js); everything else reads the stores (forecast-store.js,
// warnings.js). The SDK client is injected, so the tests drive this module
// with the fake Gladys of the SDK.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './api.js';
import { normalizeConfig } from './config.js';
import { COUNTIES, resolveCounty } from './counties.js';
import { createFailureLog } from './failure-log.js';
import { createForecastStore } from './forecast-store.js';
import { createHouseRegistry } from './houses.js';
import { buildWeather } from './pivot.js';
import {
  SCENE_ACTIONS,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
} from './scene-actions.js';
import { createPrecipitationWatcher } from './scene-triggers.js';
import { createScheduler, JITTER_MS, MIN_INTERVAL_MS } from './scheduler.js';
import { MESSAGES, localized, resolveLanguage, template, warningName } from './texts.js';
import { systemTimeZone } from './time.js';
import { UNIT_SYSTEMS, fromMetric } from './units.js';
import { createWarningWatcher } from './warning-triggers.js';
import { createWarningStore, parseWarnings, toAlerts, warningsOf } from './warnings.js';

// A forecast checked less than this ago is served as is; older, a reader
// asks the store, which calls Met Éireann only once the answer has expired.
const READER_MAX_AGE_MS = MIN_INTERVAL_MS + JITTER_MS + 5 * 60 * 1000;

/**
 * @description The connection status matching the last refresh cycle.
 * @param {object|null} summary - The last cycle summary.
 * @returns {{connected: boolean, message?: object}} The status.
 * @example
 * connectionStatus({ houses: 1, refreshed: 1, error: null });
 */
function connectionStatus(summary) {
  if (summary !== null && summary.houses === 0) {
    return { connected: false, message: MESSAGES.noLocation };
  }
  const error = summary?.error ?? null;
  if (error === null || summary.refreshed > 0) {
    return { connected: true };
  }
  switch (error.kind) {
    case ERROR_KINDS.THROTTLED:
      return { connected: false, message: MESSAGES.throttled };
    case ERROR_KINDS.FORBIDDEN:
      return { connected: false, message: MESSAGES.forbidden };
    case ERROR_KINDS.REQUEST:
    case ERROR_KINDS.INVALID:
      return { connected: false, message: MESSAGES.noForecast };
    default:
      return { connected: false, message: MESSAGES.unreachable };
  }
}

/**
 * @description Format the time of a forecast, 24-hour, in the time zone of
 * Gladys.
 * @param {number} ms - The instant.
 * @param {string} timeZone - An IANA time zone name.
 * @returns {string} 'HH:MM'.
 * @example
 * formatClock(Date.UTC(2026, 9, 12, 13, 5), 'Europe/Paris'); // -> '15:05'
 */
function formatClock(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(ms);
}

/**
 * @description Create the integration on a Gladys client.
 * @param {object} gladys - The SDK client (GladysIntegration, or a fake).
 * @param {object} [options] - Options, for the tests.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - `() => ms`.
 * @param {Function} [options.random] - `() => [0, 1)`, the jitter.
 * @param {string} [options.timeZone] - The time zone cutting the days.
 * @param {object} [options.logger] - Logger with info/warn/debug/error.
 * @param {Function} [options.setTimer] - setTimeout.
 * @param {Function} [options.clearTimer] - clearTimeout.
 * @returns {object} The running parts ({ store, warningStore, scheduler,
 * houses, watcher, warningWatcher, config }).
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    now = Date.now,
    random,
    timeZone = systemTimeZone(),
    logger = console,
    setTimer,
    clearTimer,
  } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  // Language and units of the last request of the core, for the scenes.
  let lastLanguage = null;
  let lastUnits = null;
  let lastSummary = null;
  let lastStatus = null;
  const failures = createFailureLog(logger);

  const language = () => resolveLanguage(config.language, lastLanguage);
  const units = () => {
    const wanted = config.units === 'auto' ? lastUnits : config.units;
    return wanted === UNIT_SYSTEMS.US ? UNIT_SYSTEMS.US : UNIT_SYSTEMS.METRIC;
  };

  const houses = createHouseRegistry({ fetchHouses: () => gladys.getHouses(), logger });
  const store = createForecastStore({ fetchImpl, now, logger });
  const warningStore = createWarningStore({ fetchImpl, now, logger });
  const countyOfHouse = (house) => resolveCounty(config.county, house.latitude, house.longitude);
  const warningWatcher = createWarningWatcher({
    publish: (key, data) => gladys.publishSceneEvent(key, data),
    getLanguage: language,
    getCounty: countyOfHouse,
    timeZone,
    logger,
    now,
  });
  const watcher = createPrecipitationWatcher({
    publish: (key, data) => gladys.publishSceneEvent(key, data),
    getLanguage: language,
    getUnits: units,
    logger,
    now,
  });

  /**
   * @description Publish the connection status, only when it changed.
   * @returns {Promise<void>} Resolves once published (or refused).
   * @example
   * await publishStatus();
   */
  async function publishStatus() {
    const status = connectionStatus(lastSummary);
    const serialized = JSON.stringify(status);
    if (serialized === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = serialized;
      failures.recover('status', 'The connection status is published again');
    } catch (err) {
      // Retried at every cycle: logged once while it lasts.
      failures.fail('status', `Unable to publish the connection status: ${err.message}`);
    }
  }

  /**
   * @description Read the warning list (every 30 minutes at most) and fire
   * the warning trigger of every house on its changes. After a change, the
   * core is asked to pull the weather again, for its own alert trigger.
   * @returns {Promise<void>} Resolves once observed.
   * @example
   * await observeWarnings();
   */
  async function observeWarnings() {
    let warnings;
    try {
      warnings = parseWarnings((await warningStore.refresh()).raw, now());
    } catch {
      // Logged once by the store; no reading, so no false "lifted".
      return;
    }
    let changed = false;
    for (const house of houses.list()) {
      const published = await warningWatcher.observe(house, warnings);
      changed ||= published.length > 0;
    }
    if (changed) {
      try {
        await gladys.requestWeatherRefresh();
      } catch (err) {
        logger.debug(`Weather refresh request refused: ${err.message}`);
      }
    }
  }

  const scheduler = createScheduler({
    houses,
    store,
    logger,
    now,
    ...(random ? { random } : {}),
    ...(setTimer ? { setTimer } : {}),
    ...(clearTimer ? { clearTimer } : {}),
    onRefreshed: (house, entry) => watcher.observe(house, entry.forecast),
    onCycle: async (summary) => {
      lastSummary = summary;
      const ids = new Set(houses.list().map((house) => house.id));
      watcher.forget(ids);
      warningWatcher.forget(ids);
      await observeWarnings();
      // Every cycle, every 30 minutes or so: debug, not info.
      logger.debug(
        `Refreshed ${summary.refreshed} location(s) of ${summary.houses} house(s); next refresh in ${Math.round(summary.delayMs / 60000)} min`,
      );
      await publishStatus();
    },
  });

  /**
   * @description The house a scene action targets, reading the houses once
   * more when none is known yet.
   * @param {any} wanted - The "House" field (a selector).
   * @returns {Promise<object>} The house.
   * @example
   * await resolveHouse('');
   */
  async function resolveHouse(wanted) {
    if (houses.list().length === 0) {
      await houses.refresh();
    }
    return houses.resolve(wanted);
  }

  /**
   * @description The forecast of a house for a reader.
   * @param {object} house - The house (`latitude`, `longitude`).
   * @returns {Promise<object>} The store entry.
   * @example
   * await loadHouse(house);
   */
  function loadHouse(house) {
    return store.load(house.latitude, house.longitude, { maxAgeMs: READER_MAX_AGE_MS });
  }

  // --- Weather request: the dashboard, the chat, the alert scenes -------------
  gladys.onWeatherGet(async ({ latitude, longitude, language: requested, units: wanted } = {}) => {
    if (typeof requested === 'string' && requested !== '') {
      lastLanguage = requested;
    }
    const unitSystem = wanted === UNIT_SYSTEMS.US ? UNIT_SYSTEMS.US : UNIT_SYSTEMS.METRIC;
    lastUnits = unitSystem;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('The house has no location');
    }
    const { forecast } = await loadHouse({ latitude, longitude });
    const county = resolveCounty(config.county, latitude, longitude);
    const warnings = county === null ? null : await warningStore.load();
    return buildWeather(forecast, {
      latitude,
      longitude,
      units: unitSystem,
      timeZone,
      now: now(),
      alerts: warnings === null ? [] : toAlerts(warningsOf(warnings, county)),
    });
  });

  // --- Scene action: precipitation of the next hour -------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_PRECIPITATION_NEXT_HOUR, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    const { forecast } = await loadHouse(house);
    return precipitationNextHour(forecast, { language: language(), units: units(), now: now() });
  });

  // --- Scene action: forecast of today or tomorrow -------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_DAY_FORECAST, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    const { forecast } = await loadHouse(house);
    return dayForecast(forecast, {
      house,
      day: fields?.day,
      language: language(),
      units: units(),
      timeZone,
      now: now(),
    });
  });

  // --- Scene action: Met Éireann warnings ----------------------------------
  gladys.onSceneAction(SCENE_ACTIONS.GET_WARNINGS, async (fields = {}) => {
    const house = await resolveHouse(fields?.house);
    const county = countyOfHouse(house);
    return currentWarnings(county === null ? null : await warningStore.load(), {
      county,
      language: language(),
      timeZone,
      now: now(),
    });
  });

  // --- Configuration action: test Met Éireann --------------------------------
  gladys.onAction('test_connection', async () => {
    const house = await resolveHouse('');
    const entry = await store.refresh(house.latitude, house.longitude);
    const point = buildWeather(entry.forecast, {
      latitude: house.latitude,
      longitude: house.longitude,
      units: UNIT_SYSTEMS.METRIC,
      timeZone,
      now: now(),
    });
    const { updatedAt } = entry.forecast;
    // A refresh that failed before may now work: refresh the others too.
    if (lastSummary?.error) {
      scheduler.requestCycle();
    }
    const county = countyOfHouse(house);
    const warnings = county === null ? null : await warningStore.load();
    const warningText = (lang) => {
      if (county === null) {
        return MESSAGES.noCounty[lang];
      }
      if (warnings === null) {
        return MESSAGES.warningsUnknown[lang];
      }
      // The count and the highest warning: an action answer stays short.
      const mine = warningsOf(warnings, county);
      const count = template('warningCount', lang)(mine.length, COUNTIES[county]);
      return mine.length === 0
        ? count
        : `${count}${lang === 'fr' ? ' : ' : ': '}${warningName(mine[0], lang)}.`;
    };
    return localized('testSucceeded', {
      us: fromMetric(UNIT_SYSTEMS.US).temperature(point.temperature),
      metric: point.temperature,
      house: house.name,
      time: formatClock(updatedAt ?? entry.fetchedAt, timeZone),
      warnings: Object.fromEntries(
        ['en', 'fr', 'de', 'es'].map((lang) => [lang, warningText(lang)]),
      ),
    });
  });

  // --- Configuration ---------------------------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    const previousCounty = config.county;
    config = normalizeConfig(raw);
    if (config.county !== previousCounty) {
      // Another county, other warnings: the watcher takes a new baseline by
      // itself (its state remembers the county of each house).
      logger.info(`County changed to ${COUNTIES[config.county] ?? 'automatic'}`);
      if (scheduler.started) {
        await scheduler.requestCycle();
      }
    }
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      // Gladys may have restarted: publish the status again.
      lastStatus = null;
      if (!scheduler.started) {
        // The first cycle runs in the background: the connection must not
        // wait for Met Éireann.
        scheduler.start();
      } else {
        await houses.refresh();
        await publishStatus();
      }
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
    }
  });

  return {
    store,
    warningStore,
    scheduler,
    houses,
    watcher,
    warningWatcher,
    get config() {
      return config;
    },
  };
}

export { READER_MAX_AGE_MS, connectionStatus, createApp, formatClock };
