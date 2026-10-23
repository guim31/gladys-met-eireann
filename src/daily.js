// -----------------------------------------------------------------------------
// The days of the forecast, built from the instants.
//
// Met Éireann has no daily block: the days are cut at the local midnights of
// Gladys (time.js) and summed up here, the way Home Assistant's `met_eireann`
// integration and Yr do.
//
//   temperature   the lowest and highest of the instants of the day (hourly
//                 for about 3 days, then every 3, then every 6 hours);
//   precipitation the sum of the periods (1, 3 or 6 hours, without
//                 overlap), each counted in the day holding its middle;
//   probability   the highest probability of those periods;
//   condition     the symbol of the longest period centred nearest local
//                 noon (the daytime weather);
//   wind          the strongest wind of the instants, its direction, and the
//                 strongest gust;
//   sun           sunrise and sunset, computed (sun.js).
//
// Today only holds what is still to come: Met Éireann forecasts from the
// current hour, so today's minimum is the minimum of the rest of the day.
// -----------------------------------------------------------------------------

import { toCondition } from './symbols.js';
import { sunTimes } from './sun.js';
import { HOUR_MS, nextDayStart, startOfDay } from './time.js';

/**
 * @description The precipitation timeline: the period of each instant, in
 * order, without overlap.
 * @param {Array<object>} points - The slim points, sorted.
 * @returns {Array<object>} `[{ start, end, hours, symbol, precipitation,
 * probability }]` (ms; precipitation and probability may be null).
 * @example
 * precipitationTimeline(forecast.points);
 */
function precipitationTimeline(points) {
  const periods = [];
  let coveredUntil = -Infinity;
  for (const point of points) {
    if (point.period === null || point.time < coveredUntil) {
      continue;
    }
    const end = point.time + point.period.hours * HOUR_MS;
    periods.push({
      start: point.time,
      end,
      hours: point.period.hours,
      symbol: point.period.symbol,
      precipitation: point.period.precipitation,
      probability: point.period.probability,
    });
    coveredUntil = end;
  }
  return periods;
}

/**
 * @description Pick the highest of two values, either of which may be null.
 * @param {number|null} a - A value.
 * @param {number|null} b - Another value.
 * @returns {number|null} The highest.
 * @example
 * maxOf(null, 3); // -> 3
 */
function maxOf(a, b) {
  if (a === null) {
    return b;
  }
  return b === null ? a : Math.max(a, b);
}

/**
 * @description Pick the lowest of two values, either of which may be null.
 * @param {number|null} a - A value.
 * @param {number|null} b - Another value.
 * @returns {number|null} The lowest.
 * @example
 * minOf(null, 3); // -> 3
 */
function minOf(a, b) {
  if (a === null) {
    return b;
  }
  return b === null ? a : Math.min(a, b);
}

/**
 * @description Build the days of a forecast.
 * @param {object} forecast - The slim forecast (forecast.js).
 * @param {object} options - Options.
 * @param {number} options.latitude - The latitude of the house.
 * @param {number} options.longitude - Its longitude.
 * @param {string} options.timeZone - The time zone cutting the days.
 * @returns {Array<object>} `[{ start, end, temperatureMin, temperatureMax,
 * symbol, condition, precipitation, probability, windSpeed, windDirection,
 * windGust, uvIndex, humidity, sunrise, sunset }]` (times in ms): the
 * first day of the forecast, then every day it covers to the end, in order.
 * @example
 * buildDays(forecast, { latitude: 43.6, longitude: 1.44, timeZone: 'Europe/Paris' });
 */
function buildDays(forecast, { latitude, longitude, timeZone }) {
  const days = new Map();
  const dayOf = (ms) => {
    const start = startOfDay(ms, timeZone);
    let day = days.get(start);
    if (day === undefined) {
      day = {
        start,
        end: nextDayStart(start, timeZone),
        instants: 0,
        temperatureMin: null,
        temperatureMax: null,
        precipitation: null,
        probability: null,
        windSpeed: null,
        windDirection: null,
        windGust: null,
        uvIndex: null,
        humiditySum: 0,
        humidityCount: 0,
        symbols: [],
      };
      days.set(start, day);
    }
    return day;
  };

  for (const point of forecast.points) {
    const day = dayOf(point.time);
    day.instants += 1;
    day.temperatureMin = minOf(day.temperatureMin, point.temperature);
    day.temperatureMax = maxOf(day.temperatureMax, point.temperature);
    if (point.windSpeed !== null && (day.windSpeed === null || point.windSpeed > day.windSpeed)) {
      day.windSpeed = point.windSpeed;
      day.windDirection = point.windDirection;
    }
    day.windGust = maxOf(day.windGust, point.windGust);
    day.uvIndex = maxOf(day.uvIndex, point.uvIndex);
    if (point.humidity !== null) {
      day.humiditySum += point.humidity;
      day.humidityCount += 1;
    }
  }

  for (const period of precipitationTimeline(forecast.points)) {
    const middle = (period.start + period.end) / 2;
    const day = dayOf(middle);
    if (period.symbol !== null) {
      day.symbols.push({ middle, symbol: period.symbol, hours: period.hours });
    }
    if (period.precipitation !== null) {
      day.precipitation = (day.precipitation ?? 0) + period.precipitation;
    }
    day.probability = maxOf(day.probability, period.probability);
  }

  // The forecast stops at midnight UTC: a last day it barely enters would
  // show the extremes of a few night hours as the day's.
  const coveredUntil = (forecast.points.at(-1)?.time ?? 0) + 6 * HOUR_MS;
  return [...days.values()]
    .filter((day) => day.instants > 0 && day.temperatureMin !== null)
    .sort((a, b) => a.start - b.start)
    .filter((day, index) => index === 0 || coveredUntil >= day.end)
    .map((day) => {
      // Local noon: 12 hours after midnight, but within the day of 23 or
      // 25 hours of a daylight saving switch.
      const noon = Math.min(day.start + 12 * HOUR_MS, day.end - HOUR_MS);
      // A 6-hour period describes the daytime better than one hour: prefer
      // the longest, then the nearest to noon.
      const [best] = [...day.symbols].sort(
        (a, b) => b.hours - a.hours || Math.abs(a.middle - noon) - Math.abs(b.middle - noon),
      );
      const symbol = best?.symbol ?? null;
      const { sunrise, sunset } = sunTimes(day.start, day.end, latitude, longitude);
      return {
        start: day.start,
        end: day.end,
        temperatureMin: day.temperatureMin,
        temperatureMax: day.temperatureMax,
        symbol,
        condition: toCondition(symbol, { temperature: day.temperatureMax }),
        precipitation: day.precipitation,
        probability: day.probability,
        windSpeed: day.windSpeed,
        windDirection: day.windDirection,
        windGust: day.windGust,
        uvIndex: day.uvIndex,
        humidity: day.humidityCount > 0 ? day.humiditySum / day.humidityCount : null,
        sunrise,
        sunset,
      };
    });
}

export { buildDays, precipitationTimeline };
