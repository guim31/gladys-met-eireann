# Test fixtures

## Real Met Éireann forecasts

Each `real-*.xml` file is the untouched body of
`GET http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=..;long=..`,
recorded on 23 October 2026 at 18:05 UTC with the integration's User-Agent
(`gladys-met-eireann/1.0.0 github.com/guim31/gladys-met-eireann`). Public
places only: no private location. Their first period is 18:00-19:00 UTC, their
first instant 19:00 UTC; the tests read them "now" at 18:10 UTC
(`FIXTURE_NOW`).

| File                     | Request                    | Why                                                                |
| ------------------------ | -------------------------- | ------------------------------------------------------------------ |
| `real-dublin.xml`        | `lat=53.3498;long=-6.2603` | Dublin, clear evening, no warning for the county                   |
| `real-cork.xml`          | `lat=51.8985;long=-8.4756` | Cork, under a yellow rain warning                                  |
| `real-galway.xml`        | `lat=53.2707;long=-9.0568` | Galway, under an orange wind warning and two yellow ones           |
| `real-paris-outside.xml` | `lat=48.8566;long=2.3522`  | Outside the domain: `200` with an empty `<meta/>` and `<product/>` |

Each forecast holds 106 instants and 106 periods: hourly until +72 h
(HARMONIE), then 3-hourly, then 6-hourly up to +9 days (ECMWF). Neither
`Expires` nor `Last-Modified` is sent, and `If-Modified-Since` is answered
`200` with the whole body. Coordinates that are not numbers get `422` with a
JSON body (`{"status":false,"code":422,"message":"Invalid parameter format:
lat and long must be valid numbers","data":null}`), and missing parameters
(`lon=` instead of `long=`) `422` too.

Showers are staged on these real answers by `withHours()`
(`test/helpers/fixtures.js`), which rewrites the precipitation and the symbol
of chosen hourly periods.

## Real Met Éireann warnings

`real-warnings-ireland.json` is the untouched body of
`GET https://www.met.ie/Open_Data/json/warning_IRELAND.json`, recorded at the
same time, during Storm Boelo: five land warnings (yellow and orange, rain
and wind) for western counties, all starting the next day. Five minutes
earlier, the same five warnings were numbered 6 to 10 instead of 5 to 9:
`id` is a row number, not an identity (see `src/warnings.js`). The file is
served by CloudFront with `cache-control: max-age=60`; a conditional request
(`If-None-Match`, `If-Modified-Since`) was answered `200`.

## Other files

- `weathericons-legend.csv`: `weather/legend.csv` of
  [metno/weathericons](https://github.com/metno/weathericons) (MIT, © Yr), the
  official list of the 41 symbols, as published (with its trailing space and
  its two misspelled ids). Its `Old ID` column is the legacy number Met
  Éireann sends.
- `gladys-feature-table.json`: the category/type pairs the Gladys front end can
  display, shared by the maintainer's integrations. This one publishes no
  device (a weather provider), so no test reads it.
