// -----------------------------------------------------------------------------
// MET Norway weather symbols → Gladys weather conditions.
//
// Every period of the forecast (`next_1_hours`, `next_6_hours`,
// `next_12_hours`) carries a `symbol_code`: one of the 41 symbols of the
// official legend (https://github.com/metno/weathericons, weather/legend.csv,
// also https://api.met.no/weatherapi/weathericon/2.0/documentation). The 21
// symbols drawn with a sun or a moon come in three variants, `_day`,
// `_night` and `_polartwilight` (sun just below the horizon during the polar
// night): 83 codes in all.
//
// Two codes of the legend are misspelled, and the API sends them as they are:
// `lightssleetshowersandthunder` and `lightssnowshowersandthunder` (double s).
// Both spellings are mapped, should MET fix them one day.
//
//   symbol                                  Gladys
//   clearsky                                clear
//   fair, partlycloudy                      partly-cloudy (as Home Assistant)
//   cloudy                                  cloud
//   fog                                     fog (freezing-fog at or below 0 °C)
//   lightrain(showers), rain(showers)       rain
//   heavyrain(showers)                      pouring
//   *sleet*                                 sleet
//   *snow*                                  snow
//   *rain*andthunder, *sleet*andthunder     thunderstorm
//   *snow*andthunder                        snow-thunderstorm
//
// The suffix is the day/night signal of MET: `_day` is day, `_night` and
// `_polartwilight` are night (the sun is down). The pivot carries it in
// `is_day`, never as the deprecated `night` condition.
//
// A code unknown to this table (a symbol added after this code) falls back to
// the cloud cover, so the core never receives a condition it would turn into
// "unknown" for nothing.
// -----------------------------------------------------------------------------

import { WEATHER_CONDITIONS as C } from '@gladysassistant/integration-sdk';

// The 41 symbols of legend.csv, in its order. `variants`: drawn with a sun or
// a moon, hence the _day/_night/_polartwilight suffixes.
const SYMBOLS = Object.freeze([
  { id: 'clearsky', variants: true },
  { id: 'fair', variants: true },
  { id: 'partlycloudy', variants: true },
  { id: 'cloudy', variants: false },
  { id: 'lightrainshowers', variants: true },
  { id: 'rainshowers', variants: true },
  { id: 'heavyrainshowers', variants: true },
  { id: 'lightrainshowersandthunder', variants: true },
  { id: 'rainshowersandthunder', variants: true },
  { id: 'heavyrainshowersandthunder', variants: true },
  { id: 'lightsleetshowers', variants: true },
  { id: 'sleetshowers', variants: true },
  { id: 'heavysleetshowers', variants: true },
  { id: 'lightssleetshowersandthunder', variants: true },
  { id: 'sleetshowersandthunder', variants: true },
  { id: 'heavysleetshowersandthunder', variants: true },
  { id: 'lightsnowshowers', variants: true },
  { id: 'snowshowers', variants: true },
  { id: 'heavysnowshowers', variants: true },
  { id: 'lightssnowshowersandthunder', variants: true },
  { id: 'snowshowersandthunder', variants: true },
  { id: 'heavysnowshowersandthunder', variants: true },
  { id: 'lightrain', variants: false },
  { id: 'rain', variants: false },
  { id: 'heavyrain', variants: false },
  { id: 'lightrainandthunder', variants: false },
  { id: 'rainandthunder', variants: false },
  { id: 'heavyrainandthunder', variants: false },
  { id: 'lightsleet', variants: false },
  { id: 'sleet', variants: false },
  { id: 'heavysleet', variants: false },
  { id: 'lightsleetandthunder', variants: false },
  { id: 'sleetandthunder', variants: false },
  { id: 'heavysleetandthunder', variants: false },
  { id: 'lightsnow', variants: false },
  { id: 'snow', variants: false },
  { id: 'heavysnow', variants: false },
  { id: 'lightsnowandthunder', variants: false },
  { id: 'snowandthunder', variants: false },
  { id: 'heavysnowandthunder', variants: false },
  { id: 'fog', variants: false },
]);

const VARIANTS = Object.freeze(['day', 'night', 'polartwilight']);

const PRECIPITATION_KINDS = Object.freeze({ RAIN: 'rain', SLEET: 'sleet', SNOW: 'snow' });

// The intensity word of a symbol: `light…`, `heavy…`, or neither.
const SYMBOL_INTENSITIES = Object.freeze({ LIGHT: 'light', NORMAL: 'normal', HEAVY: 'heavy' });

/**
 * @description Every code the API can send: the symbols without a variant,
 * and the three variants of the others.
 * @returns {Array<string>} The 83 codes.
 * @example
 * allSymbolCodes().length; // -> 83
 */
function allSymbolCodes() {
  return SYMBOLS.flatMap(({ id, variants }) =>
    variants ? VARIANTS.map((variant) => `${id}_${variant}`) : [id],
  );
}

/**
 * @description Split a code into its symbol and its variant.
 * @param {any} code - A `symbol_code`, e.g. 'rainshowers_night'.
 * @returns {{id: string, variant: string|null}|null} The parts, or null.
 * @example
 * splitSymbol('fair_polartwilight'); // -> { id: 'fair', variant: 'polartwilight' }
 */
function splitSymbol(code) {
  if (typeof code !== 'string' || code.trim() === '') {
    return null;
  }
  const match = code.trim().match(/^([a-z]+)(?:_(day|night|polartwilight))?$/);
  if (!match) {
    return null;
  }
  return { id: match[1], variant: match[2] ?? null };
}

/**
 * @description Describe a symbol: what falls, how hard, with thunder or not.
 * Read from the name itself, so a symbol MET would add on the same pattern
 * (a new intensity, a fixed spelling) is still understood.
 * @param {any} code - A `symbol_code`.
 * @returns {object|null} `{ id, variant, known, kind (rain|sleet|snow|null),
 * intensity (light|normal|heavy|null), thunder, showers }`, or null.
 * @example
 * describeSymbol('heavysnowshowersandthunder_day').kind; // -> 'snow'
 */
function describeSymbol(code) {
  const parts = splitSymbol(code);
  if (parts === null) {
    return null;
  }
  const { id, variant } = parts;
  // Precipitation: [light|lights|heavy](rain|sleet|snow)[showers][andthunder].
  const match = id.match(/^(lights?|heavy)?(rain|sleet|snow)(showers)?(andthunder)?$/);
  let kind = null;
  let intensity = null;
  let thunder = false;
  let showers = false;
  if (match) {
    kind = match[2];
    intensity = match[1]
      ? match[1].startsWith('light')
        ? SYMBOL_INTENSITIES.LIGHT
        : SYMBOL_INTENSITIES.HEAVY
      : SYMBOL_INTENSITIES.NORMAL;
    showers = match[3] !== undefined;
    thunder = match[4] !== undefined;
  }
  return {
    id,
    variant,
    known: SYMBOLS.some((symbol) => symbol.id === id),
    kind,
    intensity,
    thunder,
    showers,
  };
}

/**
 * @description The condition of a sky from its cloud cover (the fallback of
 * an unknown symbol), with the oktas boundaries of the WMO codes.
 * @param {number|null} cloudCover - Cloud cover, 0-100.
 * @returns {string} A condition (unknown without a cover).
 * @example
 * skyCondition(50); // -> 'partly-cloudy'
 */
function skyCondition(cloudCover) {
  if (typeof cloudCover !== 'number' || !Number.isFinite(cloudCover)) {
    return C.UNKNOWN;
  }
  if (cloudCover > 87.5) {
    return C.CLOUD;
  }
  if (cloudCover > 37.5) {
    return C.PARTLY_CLOUDY;
  }
  return C.CLEAR;
}

/**
 * @description Map a symbol to a Gladys condition.
 * @param {any} code - A `symbol_code`.
 * @param {object} [context] - What else is known of the period.
 * @param {number|null} [context.temperature] - °C, to tell freezing fog.
 * @param {number|null} [context.cloudCover] - 0-100, for an unknown symbol.
 * @returns {string} A condition of the Gladys enum.
 * @example
 * toCondition('heavyrainshowers_day'); // -> 'pouring'
 */
function toCondition(code, { temperature = null, cloudCover = null } = {}) {
  const symbol = describeSymbol(code);
  if (symbol === null) {
    return skyCondition(cloudCover);
  }
  if (symbol.kind !== null) {
    if (symbol.thunder) {
      return symbol.kind === PRECIPITATION_KINDS.SNOW ? C.SNOW_THUNDERSTORM : C.THUNDERSTORM;
    }
    if (symbol.kind === PRECIPITATION_KINDS.SNOW) {
      return C.SNOW;
    }
    if (symbol.kind === PRECIPITATION_KINDS.SLEET) {
      return C.SLEET;
    }
    return symbol.intensity === SYMBOL_INTENSITIES.HEAVY ? C.POURING : C.RAIN;
  }
  switch (symbol.id) {
    case 'clearsky':
      return C.CLEAR;
    case 'fair':
    case 'partlycloudy':
      return C.PARTLY_CLOUDY;
    case 'cloudy':
      return C.CLOUD;
    case 'fog':
      return typeof temperature === 'number' && temperature <= 0 ? C.FREEZING_FOG : C.FOG;
    default:
      return skyCondition(cloudCover);
  }
}

/**
 * @description The day/night signal of a symbol's variant.
 * @param {any} code - A `symbol_code`.
 * @returns {boolean|null} true for `_day`, false for `_night` and
 * `_polartwilight`, null when the symbol has no variant.
 * @example
 * isDayFromSymbol('fair_night'); // -> false
 */
function isDayFromSymbol(code) {
  const variant = splitSymbol(code)?.variant ?? null;
  if (variant === null) {
    return null;
  }
  return variant === 'day';
}

export {
  PRECIPITATION_KINDS,
  SYMBOLS,
  SYMBOL_INTENSITIES,
  VARIANTS,
  allSymbolCodes,
  describeSymbol,
  isDayFromSymbol,
  skyCondition,
  splitSymbol,
  toCondition,
};
