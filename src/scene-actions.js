// -----------------------------------------------------------------------------
// Scene actions: read-only questions a scene asks the forecast, then gates on.
//
//   get_precipitation_next_hour  "will it rain (or snow) within the hour?" —
//                                close the awning, skip the sprinkler, warn
//                                before leaving;
//   get_day_forecast             "what will today / tomorrow be like?" — the
//                                morning message, the evening plan for the
//                                garden or the heating;
//   get_warnings                 "is there a Met Éireann warning for my
//                                county?" — the highest level, in effect or
//                                announced, to gate a scene on it.
//
// They read what the scheduler keeps in memory: no call (a call is made only
// when the house has no recent forecast). Outputs are scalars the following
// actions of the scene can read; a value Met Éireann does not give is left
// out rather than sent as a fake number. Temperatures, wind and precipitation
// follow the `units` setting, the sentence the `language` setting.
// -----------------------------------------------------------------------------

import { COUNTIES } from './counties.js';
import { buildDays } from './daily.js';
import { readNextHour } from './next-hour.js';
import {
  MESSAGES,
  conditionName,
  daySentence,
  nextHourSentence,
  pick,
  warningsSentence,
} from './texts.js';
import { warningsOf } from './warnings.js';
import { fromMetric, round, unitLabels } from './units.js';

const SCENE_ACTIONS = Object.freeze({
  GET_PRECIPITATION_NEXT_HOUR: 'get_precipitation_next_hour',
  GET_DAY_FORECAST: 'get_day_forecast',
  GET_WARNINGS: 'get_warnings',
});

const DAYS = Object.freeze({ TODAY: 'today', TOMORROW: 'tomorrow' });

/**
 * @description The outputs of the next-hour action, also the variables of
 * the trigger.
 * @param {object} reading - A readNextHour() result.
 * @param {object} options - Options.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @returns {object} `{ available, precipitation_expected, minutes_until?,
 * precipitation_type?, intensity?, thunder?, precipitation?, probability?,
 * summary }`.
 * @example
 * buildNextHourOutputs(reading, { language: 'en', units: 'metric' });
 */
function buildNextHourOutputs(reading, { language, units }) {
  const outputs = {
    available: reading.available,
    precipitation_expected: reading.available && reading.minutesUntil !== null,
    summary: nextHourSentence(reading, language),
  };
  if (outputs.precipitation_expected) {
    outputs.minutes_until = reading.minutesUntil;
    outputs.precipitation_type = reading.type;
    outputs.intensity = reading.intensity;
    outputs.thunder = reading.thunder;
    outputs.precipitation = fromMetric(units).precipitation(reading.amount);
    if (reading.probability !== null) {
      outputs.probability = reading.probability;
    }
  }
  return outputs;
}

/**
 * @description Run the next-hour action on a forecast.
 * @param {object} forecast - The slim forecast of the house.
 * @param {object} options - Options.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} The outputs.
 * @example
 * precipitationNextHour(entry.forecast, { language: 'fr', units: 'metric' });
 */
function precipitationNextHour(forecast, { language, units, now = Date.now() }) {
  return buildNextHourOutputs(readNextHour(forecast, now), { language, units });
}

/**
 * @description Run the day action on a forecast.
 * @param {object} forecast - The slim forecast of the house.
 * @param {object} options - Options.
 * @param {object} options.house - The house (`latitude`, `longitude`).
 * @param {any} options.day - The "Day" field: 'today' (default) or 'tomorrow'.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.units - 'metric' or 'us'.
 * @param {string} options.timeZone - The time zone cutting the days.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} `{ available, condition?, condition_name?,
 * temperature_min?, temperature_max?, precipitation?,
 * precipitation_probability?, wind_speed?, wind_gust?, summary }`.
 * @example
 * dayForecast(entry.forecast, { house, day: 'tomorrow', language: 'en', units: 'metric', timeZone });
 */
function dayForecast(forecast, { house, day, language, units, timeZone, now = Date.now() }) {
  const which = day === DAYS.TOMORROW ? DAYS.TOMORROW : DAYS.TODAY;
  const days = buildDays(forecast, {
    latitude: house.latitude,
    longitude: house.longitude,
    timeZone,
  }).filter((candidate) => candidate.end > now);
  // Today is the day holding now; tomorrow the one after it.
  const today = days.findIndex((candidate) => candidate.start <= now);
  const target = today === -1 ? undefined : days[which === DAYS.TODAY ? today : today + 1];
  if (target === undefined) {
    return { available: false, summary: pick(MESSAGES, 'noDayForecast', language) };
  }
  const convert = fromMetric(units);
  const outputs = {
    available: true,
    condition: target.condition,
    condition_name: conditionName(target.condition, language),
    temperature_min: convert.temperature(target.temperatureMin),
    temperature_max: convert.temperature(target.temperatureMax),
  };
  const optional = {
    precipitation: convert.precipitation(target.precipitation),
    precipitation_probability: round(target.probability, 0),
    wind_speed: convert.speed(target.windSpeed),
    wind_gust: convert.speed(target.windGust),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== null) {
      outputs[key] = value;
    }
  }
  outputs.summary = daySentence(
    {
      day: which,
      condition: target.condition,
      min: outputs.temperature_min,
      max: outputs.temperature_max,
      precipitation: optional.precipitation,
      probability: optional.precipitation_probability,
      labels: unitLabels(units),
    },
    language,
  );
  return outputs;
}

/**
 * @description Run the warnings action: the warnings of the county of a
 * house, the highest level first.
 * @param {Array<object>|null} warnings - Every parsed warning of Ireland, or
 * null when unknown.
 * @param {object} options - Options.
 * @param {string|null} options.county - The county code of the house.
 * @param {string} options.language - 'en', 'fr', 'de' or 'es'.
 * @param {string} options.timeZone - The time zone of the sentence.
 * @param {number} [options.now] - The current time in ms.
 * @returns {object} `{ available, county?, has_warning?, warning_count?,
 * level?, in_effect?, warning_type?, headline?, summary }`; `level` is
 * none, yellow, orange or red.
 * @example
 * currentWarnings(warnings, { county: 'EI11', language: 'en', timeZone });
 */
function currentWarnings(warnings, { county, language, timeZone, now = Date.now() }) {
  if (county === null) {
    return { available: false, summary: pick(MESSAGES, 'noCounty', language) };
  }
  if (warnings === null) {
    return { available: false, summary: pick(MESSAGES, 'warningsUnknown', language) };
  }
  const name = COUNTIES[county] ?? county;
  const mine = warningsOf(warnings, county);
  const [highest] = mine;
  const outputs = {
    available: true,
    county: name,
    has_warning: mine.length > 0,
    warning_count: mine.length,
    level: highest?.level ?? 'none',
    in_effect: mine.some((warning) => warning.onset === null || warning.onset <= now),
  };
  if (highest !== undefined) {
    outputs.warning_type = highest.type;
    outputs.headline = highest.headline.slice(0, 500);
  }
  outputs.summary = warningsSentence(mine, { county: name, timeZone, now }, language);
  return outputs;
}

export {
  DAYS,
  SCENE_ACTIONS,
  buildNextHourOutputs,
  currentWarnings,
  dayForecast,
  precipitationNextHour,
};
