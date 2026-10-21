import { getLangNameFromCode } from 'language-name-map';
import { getString } from '../utils/storage';
import { get, navigatorConfig } from '../utils';
import en from '../../translations/en.json';
import pt from '../../translations/pt.json';
// import mn from '../../translations/mn.json';
import I18n from 'react-native-i18n';

export const translations = {
    en,
    pt,
    // mn,
};

export function getAvailableLocales() {
    const availableLocales = navigatorConfig('availableLocales', ['en', 'pt']);
    return Object.fromEntries(Object.entries(translations).filter(([locale]) => availableLocales.includes(locale)));
}

export function getLocale() {
    return getString('_locale') ?? navigatorConfig('defaultLocale', 'en');
}

export function getLanguage() {
    const locale = getLocale();
    return { code: locale, ...getLangNameFromCode(locale) };
}

export function translate(key, options) {
    return I18n.t(key, options);
}

/**
 * Translates the display label of a dynamic value (a status, an enum option, a unit...).
 *
 * The value is turned into a key (`In Progress` -> `in_progress`) and looked up under `scope`.
 * When the active locale has no translation of its own, the `fallback` label is returned
 * unchanged, so the English UI keeps showing exactly what it showed before.
 *
 * @param {string} scope - translation namespace, e.g. `statuses`
 * @param {string} value - raw value, e.g. `in_progress`
 * @param {string} fallback - label to show when there is no translation (defaults to the value)
 * @returns {string}
 */
export function translateLabel(scope, value, fallback = value) {
    if (typeof value !== 'string' || value.length === 0) {
        return fallback;
    }

    const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!slug) {
        return fallback;
    }

    const key = `${scope}.${slug}`;
    const translated = I18n.t(key, { defaultValue: fallback });
    const english = I18n.t(key, { locale: 'en', defaultValue: fallback });

    return translated === english ? fallback : translated;
}
