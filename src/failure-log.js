// -----------------------------------------------------------------------------
// Repeated failures, logged once.
//
// A failure that repeats at every cycle (Met Éireann down, Gladys busy) must
// not fill the logs: the first occurrence is a warning, the following ones
// are debug lines, and the first success after it is one info line. A failure
// of another kind under the same key is a new warning.
// -----------------------------------------------------------------------------

/**
 * @description Create a failure log on a logger.
 * @param {object} logger - Logger with info/warn/debug/error.
 * @returns {object} `{ fail, recover, failing }`.
 * @example
 * const failures = createFailureLog(logger);
 * failures.fail('met', 'Met Éireann unreachable');
 * failures.recover('met', 'Met Éireann answers again');
 */
function createFailureLog(logger) {
  // key -> kind of the failure under way
  const active = new Map();

  /**
   * @description Log a failure: loud the first time, debug while it repeats.
   * @param {string} key - What failed (one key per independent thing).
   * @param {string} message - The line, safe to log.
   * @param {object} [options] - Options.
   * @param {string} [options.kind] - The kind of failure; a new kind logs loud again.
   * @param {string} [options.level] - The level of the first line (warn, error).
   * @example
   * failures.fail('houses', 'Unable to read the houses of Gladys: timeout');
   */
  function fail(key, message, { kind = 'failure', level = 'warn' } = {}) {
    if (active.get(key) === kind) {
      logger.debug(message);
      return;
    }
    active.set(key, kind);
    logger[level](message);
  }

  /**
   * @description Mark a success: one info line if it ends a failure.
   * @param {string} key - What works again.
   * @param {string} message - The line.
   * @example
   * failures.recover('houses', 'The houses of Gladys are readable again');
   */
  function recover(key, message) {
    if (active.delete(key)) {
      logger.info(message);
    }
  }

  /**
   * @description Whether a failure is under way.
   * @param {string} key - The key.
   * @returns {boolean} True while failing.
   * @example
   * failures.failing('met');
   */
  function failing(key) {
    return active.has(key);
  }

  return { fail, recover, failing };
}

export { createFailureLog };
