// -----------------------------------------------------------------------------
// Fixture loading and a fake fetch answering like Met Éireann.
// See test/fixtures/README.md for where each fixture comes from.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { FORECAST_URL, WARNINGS_URL } from '../../src/api.js';
import { parseForecast } from '../../src/forecast.js';

// The real responses were recorded on 2026-10-23 at 18:05 UTC; the first
// period of the forecasts is 18:00-19:00 UTC, their first instant 19:00 UTC.
const FIXTURE_NOW = Date.UTC(2026, 9, 23, 18, 10);

// The locations of the real fixtures, as houses of Gladys.
const HOUSES = Object.freeze({
  dublin: {
    id: 'h-dublin',
    name: 'Home',
    selector: 'home',
    latitude: 53.3498,
    longitude: -6.2603,
    fixture: 'real-dublin.xml',
    county: 'EI07',
  },
  cork: {
    id: 'h-cork',
    name: 'Cottage',
    selector: 'cottage',
    latitude: 51.8985,
    longitude: -8.4756,
    fixture: 'real-cork.xml',
    county: 'EI04',
  },
  galway: {
    id: 'h-galway',
    name: 'Seaside',
    selector: 'seaside',
    latitude: 53.2707,
    longitude: -9.0568,
    fixture: 'real-galway.xml',
    county: 'EI10',
  },
  paris: {
    id: 'h-paris',
    name: 'Maison',
    selector: 'maison',
    latitude: 48.8566,
    longitude: 2.3522,
    fixture: 'real-paris-outside.xml',
    county: null,
  },
});

/**
 * @description The house as Gladys returns it (GET /house): the five fields.
 * @param {object} house - A HOUSES entry.
 * @returns {object} `{ id, name, selector, latitude, longitude }`.
 * @example
 * asGladysHouse(HOUSES.dublin);
 */
function asGladysHouse({ id, name, selector, latitude, longitude }) {
  return { id, name, selector, latitude, longitude };
}

/**
 * @description Load a text fixture.
 * @param {string} name - The file name in test/fixtures.
 * @returns {string} The content.
 * @example
 * loadText('real-dublin.xml');
 */
function loadText(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

/**
 * @description Load a JSON fixture (a fresh copy on every call).
 * @param {string} name - The file name in test/fixtures.
 * @returns {any} The parsed JSON.
 * @example
 * loadFixture('real-warnings-ireland.json');
 */
function loadFixture(name) {
  return JSON.parse(loadText(name));
}

/**
 * @description The slim forecast of a fixture.
 * @param {string} name - The file name in test/fixtures.
 * @returns {object} The parsed forecast.
 * @example
 * forecastOf('real-dublin.xml');
 */
function forecastOf(name) {
  return parseForecast(loadText(name));
}

/**
 * @description Change the hourly periods of a raw forecast, to stage a
 * shower.
 * @param {string} xml - A raw forecast.
 * @param {object} changes - `{ 'ISO start': { symbol (legacy number),
 * amount, probability? } }`, ISO without milliseconds ('2026-10-23T19:00:00Z').
 * @returns {string} The changed forecast.
 * @example
 * withHours(xml, { '2026-10-23T19:00:00Z': { symbol: 9, amount: 1.2 } });
 */
function withHours(xml, changes) {
  let result = xml;
  for (const [from, change] of Object.entries(changes)) {
    const to = new Date(Date.parse(from) + 3600000).toISOString().replace('.000', '');
    const pattern = new RegExp(
      `(<time datatype="forecast" from="${from}" to="${to}"><location[^>]*>)[\\s\\S]*?(</location></time>)`,
    );
    if (!pattern.test(result)) {
      throw new Error(`No hourly period from ${from}`);
    }
    result = result.replace(
      pattern,
      `$1<precipitation unit="mm" value="${change.amount}" minvalue="${change.amount}" maxvalue="${change.amount}" probability="${change.probability ?? 50}"/><symbol id="X" number="${change.symbol}"/>$2`,
    );
  }
  return result;
}

/**
 * @description A fake fetch. `route(url, init)` returns `{ status, body,
 * headers }` (or throws to simulate a network error); every call is recorded
 * with its headers.
 * @param {Function} route - The router.
 * @returns {Function} The fetch, with `.calls` (`{ url, headers }`).
 * @example
 * const fetchImpl = fakeFetch(() => ({ body: loadText('real-dublin.xml') }));
 */
function fakeFetch(route) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), headers: { ...init.headers } });
    const { status = 200, body = '', headers = {} } = await route(String(url), init);
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers });
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/**
 * @description The house of a forecast request URL, by its coordinates.
 * @param {string} url - The request URL (`?lat=..;long=..`).
 * @returns {object} The HOUSES entry.
 * @example
 * houseForUrl(`${FORECAST_URL}?lat=53.3498;long=-6.2603`);
 */
function houseForUrl(url) {
  const lat = Number(url.match(/lat=([-\d.]+)/)?.[1]);
  const long = Number(url.match(/long=([-\d.]+)/)?.[1]);
  const house = Object.values(HOUSES).find(
    (candidate) =>
      lat === Number(candidate.latitude.toFixed(4)) &&
      long === Number(candidate.longitude.toFixed(4)),
  );
  if (house === undefined) {
    throw new Error(`No fixture for ${url}`);
  }
  return house;
}

/**
 * @description An answer like Met Éireann's: the forecast fixture of the
 * location, or the warning list.
 * @param {object} [options] - Options.
 * @param {Function} [options.warnings] - `() => raw list`, the real list of
 * 2026-10-23 by default.
 * @param {Function} [options.forecast] - `(house) => xml`, the fixture of
 * the house by default.
 * @returns {Function} A route for fakeFetch.
 * @example
 * fakeFetch(meRoute());
 */
function meRoute({
  warnings = () => loadFixture('real-warnings-ireland.json'),
  forecast = (house) => loadText(house.fixture),
} = {}) {
  return (url) => {
    if (url === WARNINGS_URL) {
      return { body: warnings(), headers: { 'content-type': 'application/json' } };
    }
    if (url.startsWith(FORECAST_URL)) {
      return {
        body: forecast(houseForUrl(url)),
        headers: { 'content-type': 'application/xml' },
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}

/**
 * @description A logger that records nothing.
 * @returns {object} The logger.
 * @example
 * createApp(gladys, { logger: silentLogger() });
 */
function silentLogger() {
  return { info() {}, warn() {}, debug() {}, error() {} };
}

/**
 * @description A logger that keeps every line, by level.
 * @returns {object} The logger, with `lines` (`[{ level, message }]`) and
 * `at(level)` (the messages of one level).
 * @example
 * const logger = recordingLogger(); logger.at('info');
 */
function recordingLogger() {
  const lines = [];
  const record = (level) => (message) => lines.push({ level, message: String(message) });
  return {
    lines,
    at: (level) => lines.filter((line) => line.level === level).map((line) => line.message),
    debug: record('debug'),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}

/**
 * @description A clock the test moves by hand.
 * @param {number} start - The start, in ms.
 * @returns {Function} `() => ms`, with `.advance(ms)` and `.set(ms)`.
 * @example
 * const clock = manualClock(FIXTURE_NOW); clock.advance(60000);
 */
function manualClock(start) {
  let current = start;
  const now = () => current;
  now.advance = (ms) => {
    current += ms;
  };
  now.set = (ms) => {
    current = ms;
  };
  return now;
}

export {
  FIXTURE_NOW,
  HOUSES,
  asGladysHouse,
  fakeFetch,
  forecastOf,
  houseForUrl,
  loadFixture,
  loadText,
  manualClock,
  meRoute,
  withHours,
  recordingLogger,
  silentLogger,
};
