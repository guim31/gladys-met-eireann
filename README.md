# Met Éireann for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) weather provider for
Ireland: the forecasts and the **official weather warnings** of
[Met Éireann](https://www.met.ie/), the Irish national meteorological
service. Open data: no account, no API key.

Copyright Met Éireann, data under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This is a community
project, **not affiliated with Met Éireann**.

> **Developed without a Gladys running in Ireland**: tested against real
> answers of Met Éireann (Dublin, Cork, Galway, and the warnings of Storm
> Boelo, October 2026). Feedback welcome.

## What it does

- **Weather provider** (manifest `type: "weather"`, Gladys 5.2.0 or later):
  the Gladys weather widget and the chat assistant show the current weather,
  the next 24 hours (precipitation and its probability, gusts) and the next 8
  days of every house of Gladys in or near Ireland, in metric or US units.
- **Official warnings**: the Met Éireann warnings of the county of each house
  (yellow, orange, red) are sent as the alerts of the weather answer. The
  weather widget shows them, and the built-in weather alert trigger of Gladys
  fires on them — within a minute, as the integration asks the core to pull
  the weather again after a change.
- **Scene trigger** "Met Éireann warning changed" (issued, upgraded,
  downgraded, updated, lifted; filters on house, change, level, phenomenon),
  and "Rain or snow expected within the hour".
- **Scene actions**: precipitation of the next hour, forecast of the day,
  warnings of the county (highest level).
- Texts of the scenes in English, French, German or Spanish.

The user documentation, in four languages, is in [`docs/`](docs/en.md).

## Install

In Gladys 5.2.0 or later: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-met-eireann` (or from the integration store
once published). Give your houses a location (**Settings → Houses**), then
click **Test Met Éireann** in the **Configuration** tab.

## Calls and Met Éireann's terms

- Forecast: `GET http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast?lat=..;long=..`
  — the MET Norway "classic" XML (weatherapi-0.4.xsd): HARMONIE hourly for 3
  days, then ECMWF every 3 then 6 hours up to about 10 days. Plain HTTP is the
  documented address; its HTTPS twin only redirects to an internal Azure host.
- Warnings: `GET https://www.met.ie/Open_Data/json/warning_IRELAND.json` —
  the land warnings in force or announced, with the FIPS codes of their
  counties (EI01 Carlow … EI31 Wicklow).
- One forecast call per house location and one warning call for all houses,
  every 30 minutes at most (plus 0-5 min of jitter): neither API sends
  `Expires` nor honours `If-Modified-Since`. The User-Agent is
  `gladys-met-eireann/<version> github.com/guim31/gladys-met-eireann`;
  coordinates are rounded to 4 decimals; 429 and 403 pause the calls.
- Data under [CC BY 4.0](https://www.met.ie/about-us/specialist-services/open-data):
  "Copyright Met Éireann" is credited in the configuration screen and in the
  documentation.

## Limits

- Ireland and its surroundings only: elsewhere the forecast is empty and the
  core falls back to another provider. Warnings for the 26 counties of the
  Republic only (not Northern Ireland, not the marine warnings).
- The county is guessed from the nearest of about 200 towns; near a border,
  the `county` setting fixes it (for every house).
- Warning texts are English only; the integration translates the level, the
  phenomenon and the change.
- No feels-like temperature, UV index or visibility in the open forecast.

## Development

Node.js 22+, ESM, no build step; the only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm ci
npm run format:check   # Prettier (Markdown included)
npm run lint           # ESLint
npm test               # node --test, never touches the network
npx github:GladysAssistant/integration-store .   # store admission checks
```

```
index.js                 SDK wiring only
src/app.js               the integration on an injected client (handlers, status, warnings)
src/api.js               the two Met Éireann calls: User-Agent, error kinds
src/forecast.js          classic XML → slim metric forecast, legacy symbols
src/forecast-store.js    cache per location, 30 min floor, shared calls, 429 / 403 pauses
src/scheduler.js         the refresh timer (30 min, jitter, retries)
src/warnings.js          the warning list: parsing, county filter, pivot alerts, changes
src/counties.js          the 26 counties (FIPS codes) and the county of a location
src/pivot.js             slim forecast → Gladys pivot weather, in the requested units
src/daily.js             the days, from the hours and the 3- and 6-hour periods
src/symbols.js           MET Norway symbols → Gladys conditions
src/sun.js, time.js      computed sunrise/sunset, local days
src/next-hour.js         precipitation within the hour
src/scene-triggers.js    "precipitation expected within the hour"
src/warning-triggers.js  "Met Éireann warning changed"
src/scene-actions.js     next hour, forecast of the day, warnings of the county
src/houses.js            the houses of Gladys
src/units.js, texts.js   conversions, the texts in English, French, German, Spanish
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="met-eireann" \
LOG_LEVEL=debug \
npm start
```

## Releasing

Versions belong to the **Release** workflow (Actions → Release → patch, minor
or major): it bumps `package.json` and the manifest `version`/`docker_image`,
moves the `## [Unreleased]` section of [`CHANGELOG.md`](CHANGELOG.md), tags,
builds the multi-arch image to `ghcr.io/guim31/gladys-met-eireann` and publishes
the GitHub Release.

> A hand-pushed tag (`git tag v1.0.0 && git push --tags`) triggers the same
> build and Release but touches no file: bump `version` in `package.json` and
> in `gladys-assistant-integration.json` (with the `docker_image` tag) and
> commit **before** tagging.

## Credits

- Forecasts and warnings: Copyright Met Éireann, source
  [www.met.ie](https://www.met.ie/), under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- The forecast format and symbols are MET Norway's: the legend comes from
  [metno/weathericons](https://github.com/metno/weathericons) (MIT, © Yr),
  copied in `test/fixtures/weathericons-legend.csv`. For a worldwide forecast
  from [MET Norway](https://api.met.no/) (which covers Ireland too, without
  the Irish warnings), see the sister integration
  [MET Norway for Gladys](https://github.com/guim31/gladys-met-no), whose
  forecast code this integration reuses.
- The idea and the API come from the Home Assistant
  [`met_eireann`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/met_eireann)
  integration (Apache-2.0) and its
  [`PyMetEireann`](https://github.com/DylanGore/PyMetEireann) library (MIT).
- Cover: the official logo of Met Éireann, from
  [met.ie](https://www.met.ie/), on its brand colour (#00305f).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js).

## License

Apache-2.0
