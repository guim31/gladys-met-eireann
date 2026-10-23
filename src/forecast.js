// -----------------------------------------------------------------------------
// Parse a Met Éireann forecast (the MET Norway "classic" XML format,
// weatherapi-0.4.xsd) into the slim forecast the integration caches.
//
// The answer is a flat list of `<time>` elements of two kinds:
//   - instants (`from` = `to`): the state of the air at that time
//     (temperature, wind and its direction, gust, humidity, pressure, clouds,
//     dew point, global radiation);
//   - periods (`from` < `to`): the symbol and the precipitation of the period
//     (amount, min, max, probability).
// Hourly for about 3 days (HARMONIE model), then every 3 hours, then every 6
// hours (ECMWF) up to about 10 days. The periods have the length of the step.
// Every time is UTC, every value metric.
//
// A period is attached to the instant it STARTS at, the way Locationforecast
// 2.0 does (`next_1_hours`). The first period of an answer starts at the
// current hour, which has no instant (the instants start at the next hour):
// it gets a point of its own, with the values of the instant that ends it,
// so the hour under way has a forecast.
//
// The symbols are MET Norway's legacy numbers (1 Sun … 50 HeavySnow), turned
// into the current `symbol_code` names (symbols.js) by the official legend
// (`Old ID` column of MET Norway's weathericons legend).
//
// Outside the domain of the models (far from Ireland), the answer is an empty
// `<product/>`: no forecast for this location.
//
// Plain parsing on purpose: the format is generated, flat and stable, and a
// regular expression per element keeps the image free of an XML dependency.
// -----------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

// MET Norway legacy symbol number -> current symbol code.
const LEGACY_SYMBOLS = Object.freeze({
  1: 'clearsky',
  2: 'fair',
  3: 'partlycloudy',
  4: 'cloudy',
  5: 'rainshowers',
  6: 'rainshowersandthunder',
  7: 'sleetshowers',
  8: 'snowshowers',
  9: 'rain',
  10: 'heavyrain',
  11: 'heavyrainandthunder',
  12: 'sleet',
  13: 'snow',
  14: 'snowandthunder',
  15: 'fog',
  20: 'sleetshowersandthunder',
  21: 'snowshowersandthunder',
  22: 'rainandthunder',
  23: 'sleetandthunder',
  24: 'lightrainshowersandthunder',
  25: 'heavyrainshowersandthunder',
  26: 'lightssleetshowersandthunder',
  27: 'heavysleetshowersandthunder',
  28: 'lightssnowshowersandthunder',
  29: 'heavysnowshowersandthunder',
  30: 'lightrainandthunder',
  31: 'lightsleetandthunder',
  32: 'heavysleetandthunder',
  33: 'lightsnowandthunder',
  34: 'heavysnowandthunder',
  40: 'lightrainshowers',
  41: 'heavyrainshowers',
  42: 'lightsleetshowers',
  43: 'heavysleetshowers',
  44: 'lightsnowshowers',
  45: 'heavysnowshowers',
  46: 'lightrain',
  47: 'lightsleet',
  48: 'heavysleet',
  49: 'lightsnow',
  50: 'heavysnow',
});

/**
 * @description Read a finite number, null otherwise.
 * @param {any} value - The raw value (a number or an attribute string).
 * @returns {number|null} The number.
 * @example
 * num('8.3'); // -> 8.3
 */
function num(value) {
  if (typeof value === 'string' && value.trim() !== '') {
    return num(Number(value));
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * @description Read the attributes of a tag.
 * @param {string} text - The inside of a tag, after its name.
 * @returns {object} The attributes.
 * @example
 * readAttributes(' id="TTT" value="8.3"'); // -> { id: 'TTT', value: '8.3' }
 */
function readAttributes(text) {
  const attributes = {};
  for (const [, name, value] of text.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes[name] = value;
  }
  return attributes;
}

/**
 * @description Read the child elements of a `<location>`, by name.
 * @param {string} body - The XML inside `<time>`.
 * @returns {object} `{ name: attributes }`.
 * @example
 * readElements('<temperature id="TTT" unit="celsius" value="8.3"/>');
 */
function readElements(body) {
  const elements = {};
  for (const [, name, attributes] of body.matchAll(/<([A-Za-z]+)\b([^>]*?)\/?>/g)) {
    if (name !== 'location') {
      elements[name] = readAttributes(attributes);
    }
  }
  return elements;
}

/**
 * @description The current symbol code of a legacy symbol number. Night
 * variants (number + 100) are folded: day and night come from the sun.
 * @param {any} value - The `number` attribute.
 * @returns {string|null} The symbol code, or null when unknown.
 * @example
 * legacySymbol('46'); // -> 'lightrain'
 */
function legacySymbol(value) {
  const number = num(value);
  if (number === null) {
    return null;
  }
  return LEGACY_SYMBOLS[Math.round(number) % 100] ?? null;
}

/**
 * @description Parse a Met Éireann forecast.
 * @param {string} xml - The XML body.
 * @returns {object} The slim forecast: `{ latitude, longitude, altitude,
 * updatedAt (ms or null), points: [{ time (ms), temperature,
 * apparentTemperature, humidity, pressure, dewPoint, windSpeed,
 * windDirection, windGust, cloudCover, fog, uvIndex, next1, period }] }`,
 * the points sorted by time. `period` is the period starting at the point
 * (`{ hours, symbol, precipitation, precipitationMin, precipitationMax,
 * probability }`), `next1` the same when it lasts one hour.
 * @throws {Error} When the body holds no usable instant.
 * @example
 * const forecast = parseForecast(await response.text());
 */
function parseForecast(xml) {
  if (typeof xml !== 'string' || !/<weatherdata\b/.test(xml)) {
    throw new Error('The Met Éireann response is not a forecast');
  }
  const instants = new Map();
  const periods = new Map();
  let location = null;
  for (const [, attributes, body] of xml.matchAll(/<time\b([^>]*)>([\s\S]*?)<\/time>/g)) {
    const { from, to } = readAttributes(attributes);
    const start = Date.parse(from);
    const end = Date.parse(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      continue;
    }
    const elements = readElements(body);
    if (start === end) {
      const temperature = num(elements.temperature?.value);
      if (temperature === null) {
        continue;
      }
      if (elements.temperature.unit !== undefined && elements.temperature.unit !== 'celsius') {
        // The API only speaks metric: anything else is a change worth refusing.
        throw new Error(`Unexpected temperature unit "${elements.temperature.unit}"`);
      }
      location ??= readAttributes(body.match(/<location\b([^>]*)>/)?.[1] ?? '');
      instants.set(start, {
        time: start,
        temperature,
        apparentTemperature: null,
        humidity: num(elements.humidity?.value),
        pressure: num(elements.pressure?.value),
        dewPoint: num(elements.dewpointTemperature?.value),
        windSpeed: num(elements.windSpeed?.mps),
        windDirection: num(elements.windDirection?.deg),
        windGust: num(elements.windGust?.mps),
        cloudCover: num(elements.cloudiness?.percent),
        fog: num(elements.fog?.percent),
        uvIndex: null,
      });
    } else if (end > start && !periods.has(start)) {
      const precipitation = elements.precipitation ?? {};
      periods.set(start, {
        end,
        period: {
          hours: Math.round((end - start) / HOUR_MS),
          symbol: legacySymbol(elements.symbol?.number),
          precipitation: num(precipitation.value),
          precipitationMin: num(precipitation.minvalue),
          precipitationMax: num(precipitation.maxvalue),
          probability: num(precipitation.probability),
        },
      });
    }
  }
  if (instants.size === 0) {
    throw new Error('Met Éireann has no forecast for this location');
  }

  const points = [];
  for (const [start, { end, period }] of periods) {
    let instant = instants.get(start);
    if (instant === undefined) {
      // The hour under way: the values of the instant that ends it.
      const closing = instants.get(end);
      if (closing === undefined) {
        continue;
      }
      instant = { ...closing, time: start };
      instants.set(start, instant);
    }
    instant.period = period;
  }
  for (const instant of instants.values()) {
    const period = instant.period ?? null;
    points.push({ ...instant, period, next1: period?.hours === 1 ? period : null });
  }
  points.sort((a, b) => a.time - b.time);

  // When the run of the first model (HARMONIE near Ireland) was finished.
  const runEnded = Date.parse(xml.match(/<model\b[^>]*\brunended="([^"]*)"/)?.[1] ?? '');
  return {
    latitude: num(location?.latitude),
    longitude: num(location?.longitude),
    altitude: num(location?.altitude),
    updatedAt: Number.isFinite(runEnded) ? runEnded : null,
    points,
  };
}

export { LEGACY_SYMBOLS, legacySymbol, num, parseForecast, readAttributes };
