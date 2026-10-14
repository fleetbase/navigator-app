/**
 * Reader for `navigator.config.ts`, split out of `utils/index.js`.
 *
 * The barrel imported the config file, and the config file's own dependency
 * chain leads back to the barrel:
 *
 *     navigator.config.ts → config/default.js → utils/config.js → utils/index.js
 *                        ↖───────────────────────────────────────────┘
 *
 * A cycle hands whichever module loads second a half-initialised namespace, so
 * this one survived only because every value is read inside a function body
 * rather than at module scope. The next top-level read added anywhere in the
 * ring would have been `undefined` at start-up, with no obvious culprit.
 *
 * Deliberately not re-exported from the barrel: that would restore the import
 * and the cycle with it.
 */
import NavigatorConfig from '../../navigator.config';
import { get } from './index';

/**
 * @param {string} key
 * @param {*} [defaultValue]
 * @returns {*}
 */
export function navigatorConfig(key, defaultValue = null) {
    return get(NavigatorConfig, key, defaultValue);
}
