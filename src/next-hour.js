// -----------------------------------------------------------------------------
// Precipitation within the hour, from the hourly part of the forecast.
//
// MET Norway's finest step outside the Nordic countries is the hour: each
// hourly instant has a `next_1_hours` with the amount of precipitation (mm)
// and the symbol of that hour. "Within the hour" therefore reads two hours:
// the one under way and the next one — at 15:05, 15:00-16:00 and 16:00-17:00
// (the latter starts in 55 minutes); at 15:55, the next one starts in 5.
//
// An hour is wet from 0.1 mm, the resolution of the API. What falls comes from
// the symbol (rain, sleet or snow, with or without thunder); a wet hour whose
// symbol shows no precipitation (a trace under a cloudy symbol) is snow at or
// below 0 °C, rain above. The intensity is MET's own word in the symbol
// (light, heavy, or neither: moderate), else the amount: light under
// 2.5 mm/h, moderate up to 7.6 mm/h, heavy above — the usual rainfall rates.
//
// The probability of precipitation exists only where MET runs its ensemble
// models (the Nordic countries): elsewhere it is left out.
//
// Nowcast 2.0, minute by minute from the radars, also only covers the Nordic
// countries: it is not used, so the start is given to the hour.
//
// A forecast without an hourly step covering now is "not available": the
// trigger stays silent and the scene action says so, instead of reading
// "dry" into missing data.
// -----------------------------------------------------------------------------

import { PRECIPITATION_KINDS, SYMBOL_INTENSITIES, describeSymbol } from './symbols.js';
import { HOUR_MS } from './time.js';

const WET_MM = 0.1;
const MODERATE_MM_H = 2.5;
const HEAVY_MM_H = 7.6;

const INTENSITIES = Object.freeze({ LIGHT: 'light', MODERATE: 'moderate', HEAVY: 'heavy' });

const PRECIPITATION_TYPES = Object.freeze({
  RAIN: PRECIPITATION_KINDS.RAIN,
  SLEET: PRECIPITATION_KINDS.SLEET,
  SNOW: PRECIPITATION_KINDS.SNOW,
});

/**
 * @description Whether an hour is wet.
 * @param {object} point - A slim hourly point.
 * @returns {boolean} True when at least 0.1 mm falls during its next hour.
 * @example
 * isWet({ next1: { precipitation: 0.3 } }); // -> true
 */
function isWet(point) {
  const amount = point.next1?.precipitation ?? null;
  return amount !== null && amount >= WET_MM;
}

/**
 * @description The intensity class of an amount over one hour.
 * @param {number} amount - mm in the hour.
 * @returns {string} One of INTENSITIES.
 * @example
 * intensityOfAmount(3); // -> 'moderate'
 */
function intensityOfAmount(amount) {
  if (amount >= HEAVY_MM_H) {
    return INTENSITIES.HEAVY;
  }
  if (amount >= MODERATE_MM_H) {
    return INTENSITIES.MODERATE;
  }
  return INTENSITIES.LIGHT;
}

/**
 * @description What falls during a wet hour, how hard, and with thunder.
 * @param {object} point - A wet slim hourly point.
 * @returns {{type: string, intensity: string, thunder: boolean}} The details.
 * @example
 * describeWetHour({ temperature: 5, next1: { symbol: 'lightrain', precipitation: 0.4 } });
 */
function describeWetHour(point) {
  const symbol = describeSymbol(point.next1.symbol);
  if (symbol?.kind) {
    return {
      type: symbol.kind,
      intensity:
        symbol.intensity === SYMBOL_INTENSITIES.LIGHT
          ? INTENSITIES.LIGHT
          : symbol.intensity === SYMBOL_INTENSITIES.HEAVY
            ? INTENSITIES.HEAVY
            : INTENSITIES.MODERATE,
      thunder: symbol.thunder,
    };
  }
  return {
    type: point.temperature <= 0 ? PRECIPITATION_TYPES.SNOW : PRECIPITATION_TYPES.RAIN,
    intensity: intensityOfAmount(point.next1.precipitation),
    thunder: false,
  };
}

/**
 * @description Read the next hour of a forecast.
 * @param {object} forecast - The slim forecast.
 * @param {number} now - The current time in ms.
 * @returns {object} `{ available: false }`, or `{ available: true, wetNow,
 * minutesUntil (null when dry), type, intensity, thunder, amount (mm in the
 * first wet hour), probability (0-100 or null), start (ms) }`.
 * @example
 * readNextHour(forecast, Date.now());
 */
function readNextHour(forecast, now) {
  const hourly = forecast.points.filter((point) => point.next1 !== null);
  const index = hourly.findIndex((point) => point.time <= now && now < point.time + HOUR_MS);
  const current = hourly[index];
  const next = hourly[index + 1];
  if (current === undefined || next === undefined || next.time !== current.time + HOUR_MS) {
    return { available: false };
  }
  const wet = [current, next].find(isWet);
  if (wet === undefined) {
    return {
      available: true,
      wetNow: false,
      minutesUntil: null,
      type: null,
      intensity: null,
      thunder: false,
      amount: 0,
      probability: null,
      start: null,
    };
  }
  const probability = wet.next1.probability;
  return {
    available: true,
    wetNow: wet === current,
    minutesUntil: wet === current ? 0 : Math.max(1, Math.round((wet.time - now) / 60000)),
    ...describeWetHour(wet),
    amount: wet.next1.precipitation,
    probability: probability === null ? null : Math.round(probability),
    start: wet.time,
  };
}

/**
 * @description Whether a new reading announces precipitation the previous
 * one did not: the transition the trigger fires on. The first reading of a
 * house is a baseline (null previous): it never fires — a restart during a
 * shower must not announce it again.
 * @param {object|null} previous - The previous reading of the house.
 * @param {object} current - The new reading.
 * @returns {boolean} True when the trigger should fire.
 * @example
 * isPrecipitationAnnounced(previousReading, reading);
 */
function isPrecipitationAnnounced(previous, current) {
  if (!current.available || current.minutesUntil === null) {
    return false;
  }
  if (previous === null || !previous.available) {
    return false;
  }
  return previous.minutesUntil === null;
}

export {
  HEAVY_MM_H,
  INTENSITIES,
  MODERATE_MM_H,
  PRECIPITATION_TYPES,
  WET_MM,
  describeWetHour,
  intensityOfAmount,
  isPrecipitationAnnounced,
  isWet,
  readNextHour,
};
