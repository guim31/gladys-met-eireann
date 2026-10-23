// -----------------------------------------------------------------------------
// Scene trigger "Precipitation expected within the hour".
//
// After each refresh cycle, the next hour of every house (next-hour.js) is
// compared with the previous reading: when the previous one was dry and the
// new one holds precipitation, the trigger fires once, with what is coming
// and when. The event carries the filters of the scene card (house, type,
// intensity) and the variables a scene can put in a message.
//
// The reading is redone on every cycle, even when MET Norway answered 304:
// the forecast did not change, but the hour did — rain forecast at 17:00 is
// "within the hour" from 16:00 on.
//
// What it is not: a radar. MET Norway's step is the hour outside the Nordic
// countries, and the reading follows the refresh cadence (about 30 minutes):
// a shower that starts between two refreshes is announced by the next one,
// as "now" (`minutes_until` 0).
//
// Two guards against noise:
//   - the first reading of a house after a start is a baseline, it never
//     fires (a restart during a shower must not announce it again);
//   - a house fires at most once an hour: a model run can drop a shower and
//     the next one bring it back.
// -----------------------------------------------------------------------------

import { readNextHour, isPrecipitationAnnounced } from './next-hour.js';
import { buildNextHourOutputs } from './scene-actions.js';

const SCENE_TRIGGERS = Object.freeze({ PRECIPITATION_EXPECTED: 'precipitation_expected' });

const COOLDOWN_MS = 60 * 60 * 1000;

/**
 * @description Build the event data of the trigger. Flat, as the core wants
 * it: the filter keys (`house` is the selector the scene card stores) and the
 * variable keys of the manifest declaration.
 * @param {object} house - The house.
 * @param {object} reading - The reading announcing precipitation.
 * @param {object} options - Options.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @returns {object} The event data.
 * @example
 * buildEventData(house, reading, { language: 'en', units: 'metric' });
 */
function buildEventData(house, reading, { language, units }) {
  // The same values as the next-hour action, minus its two flags: an event
  // only exists when precipitation is expected.
  const outputs = buildNextHourOutputs(reading, { language, units });
  delete outputs.available;
  delete outputs.precipitation_expected;
  return { house: house.selector, house_name: house.name, ...outputs };
}

/**
 * @description Create the watcher of the precipitation trigger.
 * @param {object} options - Options.
 * @param {Function} options.publish - `(key, data) => Promise`, the SDK
 * publishSceneEvent.
 * @param {Function} options.getLanguage - `() => 'en'|'fr'|'de'|'es'`.
 * @param {Function} options.getUnits - `() => 'metric'|'us'`.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @returns {object} The watcher ({ observe, forget, reset }).
 * @example
 * const watcher = createPrecipitationWatcher({ publish, getLanguage, getUnits });
 */
function createPrecipitationWatcher({
  publish,
  getLanguage,
  getUnits,
  logger = console,
  now = Date.now,
}) {
  // house id -> { reading, lastFiredAt }
  const states = new Map();

  /**
   * @description Compare the next hour of a house with its previous reading,
   * and fire the trigger on the dry → wet transition.
   * @param {object} house - The house.
   * @param {object} forecast - Its slim forecast.
   * @returns {Promise<object|null>} The published event data, or null.
   * @example
   * await watcher.observe(house, entry.forecast);
   */
  async function observe(house, forecast) {
    const reading = readNextHour(forecast, now());
    const state = states.get(house.id) ?? { reading: null, lastFiredAt: null };
    const announced = isPrecipitationAnnounced(state.reading, reading);
    states.set(house.id, { ...state, reading });
    if (!announced) {
      return null;
    }
    if (state.lastFiredAt !== null && now() - state.lastFiredAt < COOLDOWN_MS) {
      logger.debug(`Precipitation trigger for "${house.name}" skipped (cooldown)`);
      return null;
    }
    states.set(house.id, { reading, lastFiredAt: now() });
    const data = buildEventData(house, reading, { language: getLanguage(), units: getUnits() });
    try {
      logger.debug(`Scene event ${SCENE_TRIGGERS.PRECIPITATION_EXPECTED} for "${house.name}"`);
      await publish(SCENE_TRIGGERS.PRECIPITATION_EXPECTED, data);
    } catch (err) {
      // Refused (core too old, disconnected, rate limited): logged, never
      // thrown — the refresh cycle carries on.
      logger.warn(`Scene event refused: ${err.message}`);
    }
    return data;
  }

  /**
   * @description Forget the houses that disappeared (deleted, unlocated).
   * @param {Set<any>} ids - The ids of the current houses.
   * @example
   * watcher.forget(new Set([1, 2]));
   */
  function forget(ids) {
    for (const id of states.keys()) {
      if (!ids.has(id)) {
        states.delete(id);
      }
    }
  }

  /**
   * @description Forget everything: the next reading of each house is a new
   * baseline (another altitude, for instance).
   * @example
   * watcher.reset();
   */
  function reset() {
    states.clear();
  }

  return { observe, forget, reset };
}

export { COOLDOWN_MS, SCENE_TRIGGERS, buildEventData, createPrecipitationWatcher };
