// -----------------------------------------------------------------------------
// Met Éireann open data clients: two requests, no key, no account.
//
//   Forecast   GET http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast
//              ?lat=..;long=..   (semicolon-separated, as documented)
//              XML in the MET Norway classic format (forecast.js), HARMONIE
//              then ECMWF. Plain HTTP: the documented address. Its HTTPS
//              twin only redirects to an internal Azure host name, which
//              could change without notice.
//   Warnings   GET https://www.met.ie/Open_Data/json/warning_IRELAND.json
//              JSON list of the land warnings in force or announced, each
//              with the FIPS codes of its counties (warnings.js).
//
// Terms (https://www.met.ie/about-us/specialist-services/open-data): data
// under CC BY 4.0, "Copyright Met Éireann" to be cited, an identifying
// User-Agent welcome. Neither request answers `Expires` nor honours
// `If-Modified-Since` (measured on 2026-10-23: 200 every time), so the
// cadence is ours: one forecast per location and one warning list every 30
// minutes at most (forecast-store.js, warnings.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const FORECAST_URL = 'http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast';
const WARNINGS_URL = 'https://www.met.ie/Open_Data/json/warning_IRELAND.json';
const CONTACT = 'github.com/guim31/gladys-met-eireann';

// Under the 15 s the core waits for a weather answer, with room to build it.
const REQUEST_TIMEOUT_MS = 10000;

const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const USER_AGENT = `gladys-met-eireann/${PACKAGE.version} ${CONTACT}`;

// What went wrong, as the rest of the integration needs to react to it.
const ERROR_KINDS = Object.freeze({
  THROTTLED: 'throttled', // 429: too many requests — back off
  FORBIDDEN: 'forbidden', // 403: refused (or banned) — stop for a long while
  REQUEST: 'request', // other 4xx: bad coordinates — skip this location
  UPSTREAM: 'upstream', // 5xx: retry later
  NETWORK: 'network', // DNS, timeout, reset: retry later
  INVALID: 'invalid', // 200 with an unusable body
});

class MetEireannError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - A message safe to log.
   * @param {object} [details] - { status, retryAfterMs }.
   */
  constructor(kind, message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'MetEireannError';
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * @description A coordinate with at most 4 decimals (about 10 m): enough
 * for a 2.5 km model, and the same location keeps the same address.
 * @param {number} value - Degrees.
 * @returns {string} The coordinate.
 * @example
 * formatCoordinate(53.349812); // -> '53.3498'
 */
function formatCoordinate(value) {
  return String(Number(value.toFixed(4)));
}

/**
 * @description Build the forecast URL.
 * @param {number} latitude - The latitude.
 * @param {number} longitude - The longitude.
 * @returns {string} The URL.
 * @example
 * buildUrl(53.3498, -6.2603);
 */
function buildUrl(latitude, longitude) {
  return `${FORECAST_URL}?lat=${formatCoordinate(latitude)};long=${formatCoordinate(longitude)}`;
}

/**
 * @description Classify a non-success status.
 * @param {number} status - The HTTP status.
 * @returns {string} One of ERROR_KINDS.
 * @example
 * kindOfStatus(429); // -> 'throttled'
 */
function kindOfStatus(status) {
  if (status === 429) {
    return ERROR_KINDS.THROTTLED;
  }
  if (status === 403) {
    return ERROR_KINDS.FORBIDDEN;
  }
  if (status >= 400 && status < 500) {
    return ERROR_KINDS.REQUEST;
  }
  return ERROR_KINDS.UPSTREAM;
}

/**
 * @description Read a `Retry-After` header: seconds or an HTTP date.
 * @param {string|null} value - The header value.
 * @param {number} now - The current time in ms.
 * @returns {number|null} The delay in ms.
 * @example
 * readRetryAfter('120', Date.now()); // -> 120000
 */
function readRetryAfter(value, now) {
  if (value === null || value === undefined || value.trim() === '') {
    return null;
  }
  if (/^\d+$/.test(value.trim())) {
    return Number(value.trim()) * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/**
 * @description The reason of an error body, bounded. The forecast API
 * answers its errors in JSON (`{"code":422,"message":"Invalid parameter
 * format: ..."}`), the web server in HTML (ignored).
 * @param {string} text - The body.
 * @returns {string|null} The reason.
 * @example
 * readReason('{"status":false,"code":422,"message":"Missing required parameters"}');
 */
function readReason(text) {
  try {
    const message = JSON.parse(text)?.message;
    if (typeof message === 'string' && message.trim() !== '') {
      return message.trim().slice(0, 200);
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/**
 * @description GET a Met Éireann address.
 * @param {string} url - The address.
 * @param {object} options - Options.
 * @param {string} options.accept - The Accept header.
 * @param {Function} options.fetchImpl - fetch.
 * @param {Function} options.now - `() => ms`.
 * @param {number} options.timeoutMs - The request timeout.
 * @returns {Promise<string>} The body of a 200.
 * @throws {MetEireannError} On any failure, classified by `kind`.
 * @example
 * await get(WARNINGS_URL, { accept: 'application/json', fetchImpl: fetch, now: Date.now, timeoutMs: 10000 });
 */
async function get(url, { accept, fetchImpl, now, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : err?.cause?.code || err?.name;
    throw new MetEireannError(ERROR_KINDS.NETWORK, `Met Éireann unreachable (${reason})`);
  }
  if (response.status !== 200) {
    const reason = readReason(await response.text().catch(() => ''));
    throw new MetEireannError(
      kindOfStatus(response.status),
      `Met Éireann answered HTTP ${response.status}${reason ? `: ${reason}` : ''}`,
      {
        status: response.status,
        retryAfterMs: readRetryAfter(response.headers.get('retry-after'), now()),
      },
    );
  }
  try {
    return await response.text();
  } catch {
    throw new MetEireannError(ERROR_KINDS.INVALID, 'Met Éireann sent an unreadable body', {
      status: response.status,
    });
  }
}

/**
 * @description Fetch the forecast of a location.
 * @param {object} options - Options.
 * @param {number} options.latitude - The latitude.
 * @param {number} options.longitude - The longitude.
 * @param {Function} [options.fetchImpl] - fetch, injectable for the tests.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @param {number} [options.timeoutMs] - The request timeout.
 * @returns {Promise<string>} The XML body.
 * @throws {MetEireannError} On any failure, classified by `kind`.
 * @example
 * const xml = await fetchForecast({ latitude: 53.3498, longitude: -6.2603 });
 */
function fetchForecast({
  latitude,
  longitude,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Promise.reject(new MetEireannError(ERROR_KINDS.REQUEST, 'Invalid coordinates'));
  }
  return get(buildUrl(latitude, longitude), {
    accept: 'application/xml',
    fetchImpl,
    now,
    timeoutMs,
  });
}

/**
 * @description Fetch the list of the warnings of Ireland.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch, injectable for the tests.
 * @param {Function} [options.now] - `() => ms`, for the tests.
 * @param {number} [options.timeoutMs] - The request timeout.
 * @returns {Promise<Array<object>>} The raw warnings.
 * @throws {MetEireannError} On any failure, classified by `kind`.
 * @example
 * const raw = await fetchWarnings();
 */
async function fetchWarnings({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = REQUEST_TIMEOUT_MS,
} = {}) {
  const text = await get(WARNINGS_URL, { accept: 'application/json', fetchImpl, now, timeoutMs });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MetEireannError(ERROR_KINDS.INVALID, 'The warning list is not JSON');
  }
  if (!Array.isArray(body)) {
    throw new MetEireannError(ERROR_KINDS.INVALID, 'The warning list is not a list');
  }
  return body;
}

export {
  ERROR_KINDS,
  FORECAST_URL,
  MetEireannError,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  WARNINGS_URL,
  buildUrl,
  fetchForecast,
  fetchWarnings,
  formatCoordinate,
  kindOfStatus,
  readReason,
  readRetryAfter,
};
