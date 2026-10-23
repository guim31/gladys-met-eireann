// -----------------------------------------------------------------------------
// The Met Éireann clients: the request (address, User-Agent) and the
// classification of the failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  FORECAST_URL,
  USER_AGENT,
  WARNINGS_URL,
  buildUrl,
  fetchForecast,
  fetchWarnings,
  readReason,
  readRetryAfter,
} from '../src/api.js';
import { fakeFetch, loadFixture, loadText } from './helpers/fixtures.js';

test('the forecast address uses the documented semicolon and 4 decimals', () => {
  assert.equal(buildUrl(53.349812, -6.26031), `${FORECAST_URL}?lat=53.3498;long=-6.2603`);
  assert.equal(buildUrl(51.9, -8.5), `${FORECAST_URL}?lat=51.9;long=-8.5`);
});

test('the User-Agent names the integration, its version and a contact', () => {
  assert.match(
    USER_AGENT,
    /^gladys-met-eireann\/\d+\.\d+\.\d+ github\.com\/guim31\/gladys-met-eireann$/,
  );
});

test('a forecast is fetched as XML with the User-Agent', async () => {
  const fetchImpl = fakeFetch(() => ({ body: loadText('real-dublin.xml') }));
  const xml = await fetchForecast({ latitude: 53.3498, longitude: -6.2603, fetchImpl });
  assert.match(xml, /^<weatherdata/);
  assert.equal(fetchImpl.calls[0].headers['user-agent'], USER_AGENT);
  assert.equal(fetchImpl.calls[0].url, `${FORECAST_URL}?lat=53.3498;long=-6.2603`);
});

test('the warning list is fetched and must be a list', async () => {
  const list = await fetchWarnings({
    fetchImpl: fakeFetch(() => ({ body: loadFixture('real-warnings-ireland.json') })),
  });
  assert.equal(list.length, 5);
  await assert.rejects(
    fetchWarnings({ fetchImpl: fakeFetch(() => ({ body: '{"a":1}' })) }),
    (err) => err.kind === ERROR_KINDS.INVALID,
  );
  await assert.rejects(
    fetchWarnings({ fetchImpl: fakeFetch(() => ({ body: '<html>' })) }),
    (err) => err.kind === ERROR_KINDS.INVALID,
  );
  assert.equal(WARNINGS_URL, 'https://www.met.ie/Open_Data/json/warning_IRELAND.json');
});

test('failures are classified, with the reason of the API (real 422 body)', async () => {
  const body =
    '{"status":false,"code":422,"message":"Invalid parameter format: lat and long must be valid numbers","data":null}';
  await assert.rejects(
    fetchForecast({
      latitude: 53,
      longitude: -6,
      fetchImpl: fakeFetch(() => ({ status: 422, body })),
    }),
    (err) =>
      err.kind === ERROR_KINDS.REQUEST &&
      err.message ===
        'Met Éireann answered HTTP 422: Invalid parameter format: lat and long must be valid numbers',
  );
  for (const [status, kind] of [
    [429, ERROR_KINDS.THROTTLED],
    [403, ERROR_KINDS.FORBIDDEN],
    [502, ERROR_KINDS.UPSTREAM],
  ]) {
    await assert.rejects(
      fetchForecast({
        latitude: 53,
        longitude: -6,
        fetchImpl: fakeFetch(() => ({ status, body: '<html>nginx</html>' })),
      }),
      (err) => err.kind === kind && err.status === status,
    );
  }
  await assert.rejects(
    fetchForecast({
      latitude: 53,
      longitude: -6,
      fetchImpl: () =>
        Promise.reject(Object.assign(new Error('x'), { cause: { code: 'ENOTFOUND' } })),
    }),
    (err) => err.kind === ERROR_KINDS.NETWORK && /ENOTFOUND/.test(err.message),
  );
  await assert.rejects(
    fetchForecast({ latitude: Number.NaN, longitude: -6, fetchImpl: fakeFetch(() => ({})) }),
    (err) => err.kind === ERROR_KINDS.REQUEST,
  );
});

test('Retry-After and error reasons are read safely', () => {
  assert.equal(readRetryAfter('120', 0), 120000);
  assert.equal(readRetryAfter(null, 0), null);
  assert.equal(readRetryAfter('Thu, 01 Jan 1970 00:01:00 GMT', 0), 60000);
  assert.equal(readReason('<html>404</html>'), null);
  assert.equal(
    readReason('{"message":"Missing required parameters"}'),
    'Missing required parameters',
  );
});
