// -----------------------------------------------------------------------------
// Met Éireann weather warnings: parsing, the warnings of a county, the pivot
// alerts of the core, and the changes between two readings.
//
// The open data list (api.js, WARNINGS_URL) holds the land warnings in force
// or announced, one entry per warning:
//   { id, capId, type: 'Rain', severity: 'Moderate', certainty, level:
//     'yellow', issued, updated, onset, expiry, headline: 'Status Yellow -
//     Rain warning for Clare, Cork, …', description: '<p>…</p>', status:
//     'Warning', regions: ['EI03', 'EI04', …] }
// Measured on the live list of 2026-10-23 (real-warnings-ireland.json):
//   - `id` is NOT an identity: it is the row of the warning in the list, and
//     the same five warnings came back numbered 6-10, then 5-9 five minutes
//     later. `capId` and `updated` change when a warning is updated; `issued`
//     does not (Donegal wind: issued 09:14:07, updated 09:18:42, capId of
//     09:18:42). The identity of a warning is its `issued` time and its type;
//   - `level` is yellow, orange or red (CAP severity Moderate, Severe,
//     Extreme), lower case here and capitalized in other feeds;
//   - a warning stays in the list until Met Éireann removes it, sometimes a
//     little after its `expiry`: an expired warning is dropped here.
// The texts are English only.
// -----------------------------------------------------------------------------

import { ERROR_KINDS, MetEireannError, fetchWarnings } from './api.js';
import { createFailureLog } from './failure-log.js';

const LEVELS = Object.freeze(['yellow', 'orange', 'red']);

// Level -> CAP severity of the pivot alerts (contract B.18: yellow →
// moderate, orange → severe, red → extreme).
const SEVERITIES = Object.freeze({ yellow: 'moderate', orange: 'severe', red: 'extreme' });

// The phenomena of the scene trigger filter; also the pivot alert types,
// except `other`, which the core does not know.
const WARNING_TYPES = Object.freeze([
  'wind',
  'rain',
  'snow',
  'thunderstorm',
  'fog',
  'cold',
  'heat',
  'coastal',
  'flood',
  'other',
]);

const CHANGES = Object.freeze({
  ISSUED: 'issued',
  UPGRADED: 'upgraded',
  DOWNGRADED: 'downgraded',
  UPDATED: 'updated',
  LIFTED: 'lifted',
});

const WARNINGS_MAX_AGE_MS = 30 * 60 * 1000;
const STALE_MAX_MS = 3 * 60 * 60 * 1000;
const THROTTLE_MS = 60 * 60 * 1000;

/**
 * @description The phenomenon of a Met Éireann warning type.
 * @param {any} type - The `type` ('Wind', 'Snow-Ice', 'Low Temperature'…).
 * @returns {string} One of WARNING_TYPES.
 * @example
 * typeOf('Snow-Ice'); // -> 'snow'
 */
function typeOf(type) {
  const text = String(type ?? '').toLowerCase();
  if (/thunder/.test(text)) {
    return 'thunderstorm';
  }
  if (/coast|wave|surge/.test(text)) {
    return 'coastal';
  }
  if (/flood/.test(text)) {
    return 'flood';
  }
  if (/wind|gale|storm/.test(text)) {
    return 'wind';
  }
  if (/rain/.test(text)) {
    return 'rain';
  }
  if (/snow|ice|icy/.test(text)) {
    return 'snow';
  }
  if (/fog/.test(text)) {
    return 'fog';
  }
  if (/low temp|cold|frost/.test(text)) {
    return 'cold';
  }
  if (/high temp|heat/.test(text)) {
    return 'heat';
  }
  return 'other';
}

/**
 * @description Turn the HTML of a description into plain text.
 * @param {any} html - The description.
 * @returns {string} The text, list items on their own lines.
 * @example
 * htmlToText('<p>Heavy rain.</p><ul><li>Flooding</li></ul>'); // -> 'Heavy rain.\n- Flooding'
 */
function htmlToText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(html ?? '')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|ul|ol|li)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, code) => {
      if (code[0] === '#') {
        const value =
          code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isFinite(value) ? String.fromCodePoint(value) : match;
      }
      return entities[code.toLowerCase()] ?? match;
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * @description The title of a warning without its list of counties:
 * "Status Orange - Wind warning".
 * @param {string} headline - The headline.
 * @returns {string} The title, 100 characters at most.
 * @example
 * titleOf('Status Yellow - Rain warning for Clare, Cork'); // -> 'Status Yellow - Rain warning'
 */
function titleOf(headline) {
  return headline.replace(/\s+for\s+.*$/i, '').slice(0, 100);
}

/**
 * @description Parse the raw list into clean warnings, the expired ones
 * dropped.
 * @param {Array<object>} raw - The JSON list.
 * @param {number} now - The current time in ms.
 * @returns {Array<object>} `[{ id, level, rank (1-3), type, rawType, title,
 * headline, description, onset, expiry, updated (ms or null), regions }]`.
 * @example
 * parseWarnings(raw, Date.now());
 */
function parseWarnings(raw, now) {
  const warnings = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const level = String(entry?.level ?? '').toLowerCase();
    const regions = Array.isArray(entry?.regions) ? entry.regions.map(String) : [];
    const id =
      typeof entry?.issued === 'string' && entry.issued !== ''
        ? `${entry.issued}|${entry.type ?? ''}`
        : entry?.capId;
    if (!LEVELS.includes(level) || regions.length === 0 || typeof id !== 'string' || id === '') {
      continue;
    }
    const time = (value) => {
      const ms = Date.parse(value ?? '');
      return Number.isFinite(ms) ? ms : null;
    };
    const expiry = time(entry.expiry);
    if (expiry !== null && expiry <= now) {
      continue;
    }
    const headline =
      typeof entry.headline === 'string' && entry.headline.trim() !== ''
        ? entry.headline.trim()
        : `${entry.type ?? 'Weather'} warning`;
    warnings.push({
      id: String(id),
      level,
      rank: LEVELS.indexOf(level) + 1,
      type: typeOf(entry.type),
      rawType: String(entry.type ?? ''),
      title: titleOf(headline),
      headline,
      description: htmlToText(entry.description),
      onset: time(entry.onset),
      expiry,
      updated: time(entry.updated) ?? time(entry.issued),
      regions,
    });
  }
  return warnings;
}

/**
 * @description The warnings of a county, the highest level first, then the
 * soonest.
 * @param {Array<object>} warnings - Parsed warnings.
 * @param {string|null} county - A county code.
 * @returns {Array<object>} The warnings.
 * @example
 * warningsOf(warnings, 'EI11');
 */
function warningsOf(warnings, county) {
  if (county === null) {
    return [];
  }
  return warnings
    .filter((warning) => warning.regions.includes(county))
    .sort((a, b) => b.rank - a.rank || (a.onset ?? 0) - (b.onset ?? 0));
}

/**
 * @description The pivot alerts of the core (contract B.18) for warnings.
 * @param {Array<object>} warnings - The warnings of a county.
 * @returns {Array<object>} `[{ severity, event, description, start, end,
 * type? }]`, 10 at most.
 * @example
 * toAlerts(warningsOf(warnings, 'EI11'));
 */
function toAlerts(warnings) {
  return warnings.slice(0, 10).map((warning) => {
    const alert = {
      severity: SEVERITIES[warning.level],
      event: warning.title,
      description: [warning.headline, warning.description]
        .filter((text) => text !== '')
        .join('\n')
        .slice(0, 5000),
    };
    if (warning.onset !== null) {
      alert.start = new Date(warning.onset).toISOString();
    }
    if (warning.expiry !== null) {
      alert.end = new Date(warning.expiry).toISOString();
    }
    if (warning.type !== 'other') {
      alert.type = warning.type;
    }
    return alert;
  });
}

/**
 * @description The changes between two readings of a county's warnings.
 * @param {Array<object>} previous - The warnings of the previous reading.
 * @param {Array<object>} current - The warnings now.
 * @returns {Array<{change: string, warning: object, previous?: object}>} The
 * changes: issued, upgraded, downgraded, updated (same level, new text or
 * times), lifted (gone or expired).
 * @example
 * diffWarnings(before, after);
 */
function diffWarnings(previous, current) {
  const before = new Map(previous.map((warning) => [warning.id, warning]));
  const changes = [];
  for (const warning of current) {
    const old = before.get(warning.id);
    before.delete(warning.id);
    if (old === undefined) {
      changes.push({ change: CHANGES.ISSUED, warning });
    } else if (warning.rank > old.rank) {
      changes.push({ change: CHANGES.UPGRADED, warning, previous: old });
    } else if (warning.rank < old.rank) {
      changes.push({ change: CHANGES.DOWNGRADED, warning, previous: old });
    } else if (
      warning.updated !== old.updated ||
      warning.onset !== old.onset ||
      warning.expiry !== old.expiry
    ) {
      changes.push({ change: CHANGES.UPDATED, warning, previous: old });
    }
  }
  for (const old of before.values()) {
    changes.push({ change: CHANGES.LIFTED, warning: old });
  }
  return changes;
}

/**
 * @description Create the warning store: the last list of Ireland, read
 * once per refresh cycle at most every 30 minutes.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetchImpl] - fetch, injectable for the tests.
 * @param {Function} [options.now] - `() => ms`.
 * @param {object} [options.logger] - Logger with info/warn/debug.
 * @returns {object} The store ({ refresh, load, current }).
 * @example
 * const warnings = createWarningStore();
 */
function createWarningStore({
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = console,
} = {}) {
  let entry = null; // { raw, fetchedAt }
  let inflight = null;
  let blockedUntil = 0;
  const failures = createFailureLog(logger);

  /**
   * @description Read the list again, unless read less than 30 minutes ago.
   * @returns {Promise<object>} `{ raw, fetchedAt }`.
   * @throws {MetEireannError} When the call fails or is paused.
   * @example
   * await warnings.refresh();
   */
  function refresh() {
    if (entry !== null && now() - entry.fetchedAt < WARNINGS_MAX_AGE_MS) {
      return Promise.resolve(entry);
    }
    if (inflight !== null) {
      return inflight;
    }
    if (blockedUntil > now()) {
      return Promise.reject(
        new MetEireannError(ERROR_KINDS.THROTTLED, 'Met Éireann warning calls paused'),
      );
    }
    inflight = (async () => {
      try {
        const raw = await fetchWarnings({ fetchImpl, now });
        entry = { raw, fetchedAt: now() };
        failures.recover('warnings', 'The Met Éireann warnings are readable again');
        return entry;
      } catch (err) {
        if (err.kind === ERROR_KINDS.THROTTLED || err.kind === ERROR_KINDS.FORBIDDEN) {
          blockedUntil = now() + Math.max(err.retryAfterMs ?? 0, THROTTLE_MS);
        }
        failures.fail('warnings', `Met Éireann warnings unavailable: ${err.message}`, {
          kind: err.kind,
        });
        throw err;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /**
   * @description The parsed warnings for a reader: a fresh list when
   * possible, else one up to 3 hours old, else null.
   * @returns {Promise<Array<object>|null>} The warnings, or null when unknown.
   * @example
   * await warnings.load();
   */
  async function load() {
    try {
      return parseWarnings((await refresh()).raw, now());
    } catch {
      return current();
    }
  }

  /**
   * @description The parsed warnings of the last list, without any call.
   * @returns {Array<object>|null} The warnings, or null when unknown or too old.
   * @example
   * warnings.current();
   */
  function current() {
    if (entry === null || now() - entry.fetchedAt > STALE_MAX_MS) {
      return null;
    }
    return parseWarnings(entry.raw, now());
  }

  return { refresh, load, current };
}

export {
  CHANGES,
  LEVELS,
  SEVERITIES,
  WARNINGS_MAX_AGE_MS,
  WARNING_TYPES,
  createWarningStore,
  diffWarnings,
  htmlToText,
  parseWarnings,
  titleOf,
  toAlerts,
  typeOf,
  warningsOf,
};
