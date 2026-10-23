// -----------------------------------------------------------------------------
// Slim metric forecast → the Gladys pivot weather format (contract B.18).
//
// The core whitelists, bounds and normalizes the payload (normalizeWeather):
// this module produces the fields it keeps, in the unit system of the
// request, and leaves out what Met Éireann does not give rather than sending
// a null.
//
//   current   the instant under way (the latest one not in the future):
//             temperature, condition of its period, humidity, pressure, dew
//             point, wind, gust, cloud cover, today's sunrise and sunset,
//             is_day;
//   hours     the hour under way and the next 23 (Gladys keeps 24), with the
//             precipitation of each hour and its probability;
//   days      today and the next 7 (Gladys keeps 8), see daily.js;
//   alerts    the Met Éireann warnings of the county of the house
//             (warnings.js): the core draws them on its weather widget and
//             runs its own weather-alert scene trigger on them.
//
// No apparent temperature, UV index nor visibility: the open forecast has
// none. Day and night come from the computed sun: the legacy symbols have no
// night variant.
// -----------------------------------------------------------------------------

import { buildDays } from './daily.js';
import { isSunUp, sunTimes } from './sun.js';
import { isDayFromSymbol, toCondition } from './symbols.js';
import { HOUR_MS, nextDayStart, startOfDay } from './time.js';
import { fromMetric, round } from './units.js';

const MAX_HOURS = 24;
const MAX_DAYS = 8;

/**
 * @description Copy the defined values of an object (drop null/undefined).
 * @param {object} fields - The candidate fields.
 * @returns {object} The fields with a value.
 * @example
 * compact({ a: 1, b: null }); // -> { a: 1 }
 */
function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
  );
}

/**
 * @description An instant as an ISO date.
 * @param {number|null} ms - The instant.
 * @returns {string|null} The ISO date.
 * @example
 * isoDate(0); // -> '1970-01-01T00:00:00.000Z'
 */
function isoDate(ms) {
  return ms === null || ms === undefined ? null : new Date(ms).toISOString();
}

/**
 * @description The instant describing the weather now: the latest one not in
 * the future (a forecast served from the cache an hour later moves on), or
 * the first one.
 * @param {Array<object>} points - The slim points, sorted.
 * @param {number} now - The current time in ms.
 * @returns {object} The point.
 * @example
 * currentPoint(forecast.points, Date.now());
 */
function currentPoint(points, now) {
  let current = points[0];
  for (const point of points) {
    if (point.time > now) {
      break;
    }
    current = point;
  }
  return current;
}

/**
 * @description The symbol of the period starting at an instant (1, 3 or 6
 * hours).
 * @param {object} point - A slim point.
 * @returns {string|null} The symbol code.
 * @example
 * symbolOfPoint(point);
 */
function symbolOfPoint(point) {
  return point.period?.symbol ?? null;
}

/**
 * @description Day or night at an instant: the variant of MET's symbol when
 * it has one (what Yr draws), else the computed sun.
 * @param {string|null} symbol - The symbol of the period.
 * @param {number} ms - The instant to judge when the symbol says nothing.
 * @param {number} latitude - Degrees.
 * @param {number} longitude - Degrees.
 * @returns {boolean} true by day.
 * @example
 * isDay('rain', Date.now(), 43.6, 1.44);
 */
function isDay(symbol, ms, latitude, longitude) {
  return isDayFromSymbol(symbol) ?? isSunUp(ms, latitude, longitude);
}

/**
 * @description Build the pivot weather of a forecast, in one unit system.
 * @param {object} forecast - The slim metric forecast (forecast.js).
 * @param {object} options - Options.
 * @param {number} options.latitude - The latitude of the house.
 * @param {number} options.longitude - Its longitude.
 * @param {string} options.units - 'metric' or 'us', as the core requested.
 * @param {string} options.timeZone - The time zone cutting the days.
 * @param {number} [options.now] - The current time in ms.
 * @param {Array<object>} [options.alerts] - The pivot alerts (warnings.js).
 * @returns {object} The pivot weather payload.
 * @example
 * buildWeather(forecast, { latitude, longitude, units: 'us', timeZone: 'Europe/Dublin' });
 */
function buildWeather(
  forecast,
  { latitude, longitude, units, timeZone, now = Date.now(), alerts = [] },
) {
  const convert = fromMetric(units);
  const current = currentPoint(forecast.points, now);
  const currentSymbol = symbolOfPoint(current);
  const todayStart = startOfDay(now, timeZone);
  const today = sunTimes(todayStart, nextDayStart(todayStart, timeZone), latitude, longitude);

  const weather = compact({
    temperature: convert.temperature(current.temperature),
    weather: toCondition(currentSymbol, {
      temperature: current.temperature,
      cloudCover: current.cloudCover,
    }),
    datetime: isoDate(current.time),
    apparent_temperature: convert.temperature(current.apparentTemperature),
    humidity: round(current.humidity, 0),
    pressure: convert.pressure(current.pressure),
    dew_point: convert.temperature(current.dewPoint),
    wind_speed: convert.speed(current.windSpeed),
    wind_direction: round(current.windDirection, 0),
    wind_gust: convert.speed(current.windGust),
    cloud_cover: round(current.cloudCover, 0),
    uv_index: round(current.uvIndex, 0),
    sunrise: isoDate(today.sunrise),
    sunset: isoDate(today.sunset),
    // The sun now, not at the start of the hour.
    is_day: isSunUp(now, latitude, longitude),
  });

  // The hour under way and the following ones, while the forecast is hourly.
  weather.hours = forecast.points
    .filter((point) => point.next1 !== null && point.time + HOUR_MS > now)
    .slice(0, MAX_HOURS)
    .map((point) =>
      compact({
        temperature: convert.temperature(point.temperature),
        weather: toCondition(point.next1.symbol, {
          temperature: point.temperature,
          cloudCover: point.cloudCover,
        }),
        datetime: isoDate(point.time),
        apparent_temperature: convert.temperature(point.apparentTemperature),
        humidity: round(point.humidity, 0),
        pressure: convert.pressure(point.pressure),
        wind_speed: convert.speed(point.windSpeed),
        wind_direction: round(point.windDirection, 0),
        wind_gust: convert.speed(point.windGust),
        cloud_cover: round(point.cloudCover, 0),
        precipitation: convert.precipitation(point.next1.precipitation),
        precipitation_probability: round(point.next1.probability, 0),
        uv_index: round(point.uvIndex, 0),
        is_day: isDay(point.next1.symbol, point.time + HOUR_MS / 2, latitude, longitude),
      }),
    );

  weather.days = buildDays(forecast, { latitude, longitude, timeZone })
    .filter((day) => day.end > now)
    .slice(0, MAX_DAYS)
    .map((day) =>
      compact({
        temperature_min: convert.temperature(day.temperatureMin),
        temperature_max: convert.temperature(day.temperatureMax),
        datetime: isoDate(day.start),
        weather: day.symbol === null ? null : day.condition,
        humidity: round(day.humidity, 0),
        wind_speed: convert.speed(day.windSpeed),
        wind_direction: round(day.windDirection, 0),
        wind_gust: convert.speed(day.windGust),
        precipitation: convert.precipitation(day.precipitation),
        precipitation_probability: round(day.probability, 0),
        uv_index: round(day.uvIndex, 0),
        sunrise: isoDate(day.sunrise),
        sunset: isoDate(day.sunset),
      }),
    );

  if (alerts.length > 0) {
    weather.alerts = alerts;
  }
  return weather;
}

export { MAX_DAYS, MAX_HOURS, buildWeather, currentPoint, isDay, symbolOfPoint };
