// -----------------------------------------------------------------------------
// Scene trigger "Met Éireann warning changed".
//
// After each refresh cycle, the warnings of the county of every house are
// compared with the previous reading (warnings.js diffWarnings): a warning
// issued, upgraded, downgraded, updated (same level, new text or times) or
// lifted fires the trigger once, with the filters of the scene card (house,
// change, level, phenomenon) and the variables a scene can put in a message.
//
// What it adds to the core's own weather-alert trigger, which also sees these
// warnings through the alerts of the weather answer: the Met Éireann colours
// (the core only knows CAP severities), downgrades and updates (the core
// fires on new or higher alerts and on their end only), the county, and a
// sentence in the language of the user (the warning texts are English).
//
// Guards against noise:
//   - the first reading of a house after a start (or after its county
//     changed) is a baseline, it never fires: a restart during a storm must
//     not announce every warning again;
//   - an unknown list (Met Éireann unreachable) is no reading: a failure
//     never looks like every warning being lifted.
// -----------------------------------------------------------------------------

import { COUNTIES } from './counties.js';
import { diffWarnings, warningsOf } from './warnings.js';
import { warningChangeSentence } from './texts.js';

const SCENE_TRIGGERS_WARNINGS = Object.freeze({ WARNING_CHANGED: 'warning_changed' });

/**
 * @description Build the event data of the trigger: flat, the filter keys
 * (`house` is the selector the scene card stores) and the variable keys of
 * the manifest declaration.
 * @param {object} house - The house.
 * @param {object} change - `{ change, warning }` (diffWarnings).
 * @param {object} options - Options.
 * @param {string} options.county - The county code.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.timeZone - An IANA time zone name.
 * @param {number} options.now - The current time in ms.
 * @returns {object} The event data.
 * @example
 * buildWarningEventData(house, change, { county: 'EI11', language: 'en', timeZone, now });
 */
function buildWarningEventData(house, { change, warning }, { county, language, timeZone, now }) {
  const countyName = COUNTIES[county] ?? county;
  return {
    house: house.selector,
    change,
    level: warning.level,
    warning_type: warning.type,
    house_name: house.name,
    county: countyName,
    headline: warning.headline.slice(0, 500),
    description: warning.description.slice(0, 2000),
    summary: warningChangeSentence(
      { change, warning, county: countyName, timeZone, now },
      language,
    ),
  };
}

/**
 * @description Create the watcher of the warning trigger.
 * @param {object} options - Options.
 * @param {Function} options.publish - `(key, data) => Promise`, the SDK
 * publishSceneEvent.
 * @param {Function} options.getLanguage - `() => 'en'|'fr'|'de'|'es'`.
 * @param {Function} options.getCounty - `(house) => code|null`.
 * @param {string} options.timeZone - The time zone of the sentences.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @returns {object} The watcher ({ observe, forget, reset }).
 * @example
 * const watcher = createWarningWatcher({ publish, getLanguage, getCounty, timeZone });
 */
function createWarningWatcher({
  publish,
  getLanguage,
  getCounty,
  timeZone,
  logger = console,
  now = Date.now,
}) {
  // house id -> { county, warnings }
  const states = new Map();

  /**
   * @description Compare the warnings of a house's county with the previous
   * reading, and fire the trigger for each change.
   * @param {object} house - The house.
   * @param {Array<object>|null} warnings - Every parsed warning of Ireland,
   * or null when unknown.
   * @returns {Promise<Array<object>>} The published event data.
   * @example
   * await watcher.observe(house, warnings);
   */
  async function observe(house, warnings) {
    if (warnings === null) {
      return [];
    }
    const county = getCounty(house);
    const current = warningsOf(warnings, county);
    const state = states.get(house.id);
    states.set(house.id, { county, warnings: current });
    if (state === undefined || state.county !== county) {
      return [];
    }
    const published = [];
    for (const change of diffWarnings(state.warnings, current)) {
      const data = buildWarningEventData(house, change, {
        county,
        language: getLanguage(),
        timeZone,
        now: now(),
      });
      // One line per warning change: a rare, user-visible event.
      logger.info(`Warning ${change.change} for "${house.name}": ${change.warning.title}`);
      try {
        await publish(SCENE_TRIGGERS_WARNINGS.WARNING_CHANGED, data);
      } catch (err) {
        // Refused (core too old, disconnected, rate limited): logged, never
        // thrown — the refresh cycle carries on.
        logger.warn(`Scene event refused: ${err.message}`);
      }
      published.push(data);
    }
    return published;
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
   * @description Forget everything: the next reading is a new baseline.
   * @example
   * watcher.reset();
   */
  function reset() {
    states.clear();
  }

  return { observe, forget, reset };
}

export { SCENE_TRIGGERS_WARNINGS, buildWarningEventData, createWarningWatcher };
