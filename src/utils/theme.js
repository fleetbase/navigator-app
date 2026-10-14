/**
 * Non-reactive theme lookup.
 *
 * Split out of `utils/index.js` because that barrel is imported by
 * `utils/format.js`, and this helper is the only thing in it that reaches for
 * `tamagui.config`. That single import made the whole barrel — and therefore
 * every formatter — unusable from the v3 tree: pulling it in loads a second
 * Tamagui config ("duplicate Tamagui dependencies") and drags the v2 provider
 * stack into any test that touches a card.
 *
 * Kept as its own module rather than re-exported from the barrel, since
 * re-exporting would put the import straight back.
 */
import { getString } from './storage';
import { themes } from '../../tamagui.config';
import { APP_THEME_KEY } from '../hooks/use-app-theme';

export function getTheme(key = null) {
    const themeName = getString(APP_THEME_KEY);
    if (themeName) {
        const targetTheme = themes[themeName];
        if (targetTheme) {
            return key ? targetTheme[key] : targetTheme;
        }
    }
    return {};
}

export default getTheme;
