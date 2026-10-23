// -----------------------------------------------------------------------------
// Sunrise, sunset and day/night, computed locally.
//
// Locationforecast carries no sun times, and the Sunrise 3.0 API would cost
// one more call per house and per day for what a few lines of astronomy give
// to the minute. The solar position follows the NOAA solar calculator
// (Meeus, "Astronomical Algorithms"): declination and equation of time from
// the Julian century, then the elevation at any instant.
//
// Sunrise and sunset are the instants the centre of the sun crosses -0.833°
// (refraction and the radius of the disc), found by scanning the day every
// 10 minutes and bisecting each crossing: no closed formula, so the polar day
// and the polar night need no special case — there is simply no crossing.
// -----------------------------------------------------------------------------

const DEG = Math.PI / 180;
const HORIZON_DEGREES = -0.833;
const SCAN_STEP_MS = 10 * 60 * 1000;
const PRECISION_MS = 1000;

/**
 * @description The elevation of the centre of the sun above the horizon.
 * @param {number} ms - The instant, in ms.
 * @param {number} latitude - Degrees, north positive.
 * @param {number} longitude - Degrees, east positive.
 * @returns {number} The elevation, in degrees.
 * @example
 * solarElevation(Date.UTC(2026, 5, 21, 12), 0, 0); // -> about 66.6
 */
function solarElevation(ms, latitude, longitude) {
  const julianDay = ms / 86400000 + 2440587.5;
  const t = (julianDay - 2451545) / 36525;

  const meanLongitude = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const center =
    Math.sin(meanAnomaly * DEG) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly * DEG) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly * DEG) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega * DEG);
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG);
  const declination = Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLongitude * DEG));

  const y = Math.tan((obliquity * DEG) / 2) ** 2;
  const l0 = meanLongitude * DEG;
  const m = meanAnomaly * DEG;
  const equationOfTime =
    (4 / DEG) *
    (y * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));

  const utcMinutes = (((ms % 86400000) + 86400000) % 86400000) / 60000;
  const trueSolarMinutes = (((utcMinutes + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarMinutes / 4 - 180;

  const cosZenith =
    Math.sin(latitude * DEG) * Math.sin(declination) +
    Math.cos(latitude * DEG) * Math.cos(declination) * Math.cos(hourAngle * DEG);
  return 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / DEG;
}

/**
 * @description Whether the sun is up at an instant.
 * @param {number} ms - The instant, in ms.
 * @param {number} latitude - Degrees.
 * @param {number} longitude - Degrees.
 * @returns {boolean} True when the sun is above the horizon.
 * @example
 * isSunUp(Date.now(), 43.6, 1.44);
 */
function isSunUp(ms, latitude, longitude) {
  return solarElevation(ms, latitude, longitude) > HORIZON_DEGREES;
}

/**
 * @description The sunrise and sunset within a time range (a local day).
 * @param {number} startMs - The start of the range (a local midnight), in ms.
 * @param {number} endMs - Its end (the next local midnight), in ms.
 * @param {number} latitude - Degrees.
 * @param {number} longitude - Degrees.
 * @returns {{sunrise: number|null, sunset: number|null}} The first rising and
 * the first setting after it, in ms; both null on a polar day or night, or
 * when the range holds only one of them.
 * @example
 * sunTimes(dayStart, nextDayStart, 43.6045, 1.444);
 */
function sunTimes(startMs, endMs, latitude, longitude) {
  const above = (ms) => solarElevation(ms, latitude, longitude) > HORIZON_DEGREES;
  const crossing = (from, to, rising) => {
    let low = from;
    let high = to;
    while (high - low > PRECISION_MS) {
      const middle = (low + high) / 2;
      if (above(middle) === rising) {
        high = middle;
      } else {
        low = middle;
      }
    }
    return Math.round(high / 1000) * 1000;
  };

  let sunrise = null;
  let sunset = null;
  let previous = startMs;
  let wasAbove = above(startMs);
  for (let ms = startMs + SCAN_STEP_MS; ; ms += SCAN_STEP_MS) {
    const at = Math.min(ms, endMs);
    const isAbove = above(at);
    if (isAbove && !wasAbove && sunrise === null) {
      sunrise = crossing(previous, at, true);
    } else if (!isAbove && wasAbove && sunrise !== null && sunset === null) {
      sunset = crossing(previous, at, false);
    }
    wasAbove = isAbove;
    previous = at;
    if (at >= endMs) {
      break;
    }
  }
  if (sunrise === null || sunset === null) {
    return { sunrise: null, sunset: null };
  }
  return { sunrise, sunset };
}

export { HORIZON_DEGREES, isSunUp, solarElevation, sunTimes };
