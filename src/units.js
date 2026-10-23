// -----------------------------------------------------------------------------
// Unit conversions.
//
// Met Éireann answers in metric only, and the integration caches metric values
// (°C, m/s, hPa, mm). Each Gladys weather request names its unit system
// (`units`: 'metric' or 'us'), and the pivot format expects the values in it
// (contract B.18 of the core):
//
//   pivot       metric   us
//   ----------  -------  ------
//   temp        °C       °F
//   wind        m/s      mph
//   pressure    hPa      hPa
//   precip      mm       in
//
// One call serves a °C user and a °F user alike: the conversion is local.
// -----------------------------------------------------------------------------

const UNIT_SYSTEMS = Object.freeze({ METRIC: 'metric', US: 'us' });

const MPH_TO_MS = 0.44704;
const INCH_TO_MM = 25.4;

/**
 * @description Round to a number of decimals, keeping null as null.
 * @param {number|null} value - The value.
 * @param {number} decimals - The decimals.
 * @returns {number|null} The rounded value.
 * @example
 * round(1.2345, 1); // -> 1.2
 */
function round(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  // `+ 0` turns a -0 into 0: "-0 °C" reads as a bug.
  return Math.round(value * factor) / factor + 0;
}

/**
 * @description Build the converters from metric to a unit system, each one
 * rounding to a sensible precision.
 * @param {string} units - 'metric' or 'us'.
 * @returns {object} `{ temperature, speed, pressure, precipitation }`: metric
 * value in, value of the requested system out (null stays null).
 * @example
 * fromMetric('us').temperature(0); // -> 32
 */
function fromMetric(units) {
  const us = units === UNIT_SYSTEMS.US;
  const guard = (fn) => (value) =>
    value === null || value === undefined || !Number.isFinite(value) ? null : fn(value);
  return {
    // °C → °F
    temperature: guard((celsius) => round(us ? (celsius * 9) / 5 + 32 : celsius, 1)),
    // m/s → mph
    speed: guard((ms) => round(us ? ms / MPH_TO_MS : ms, 1)),
    // hPa in both systems (the pivot keeps hPa for `us` too)
    pressure: guard((hpa) => round(hpa, 0)),
    // mm → in
    precipitation: guard((mm) => (us ? round(mm / INCH_TO_MM, 2) : round(mm, 1))),
  };
}

/**
 * @description The unit labels of a unit system, for the sentences.
 * @param {string} units - 'metric' or 'us'.
 * @returns {{temperature: string, speed: string, precipitation: string}} The labels.
 * @example
 * unitLabels('us').temperature; // -> '°F'
 */
function unitLabels(units) {
  return units === UNIT_SYSTEMS.US
    ? { temperature: '°F', speed: 'mph', precipitation: 'in' }
    : { temperature: '°C', speed: 'm/s', precipitation: 'mm' };
}

export { INCH_TO_MM, MPH_TO_MS, UNIT_SYSTEMS, fromMetric, round, unitLabels };
