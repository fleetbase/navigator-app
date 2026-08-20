/**
 * v3 localisation.
 *
 * Built directly on i18n-js rather than reusing src/utils/localize.js: that
 * module imports `../utils`, which imports the **v2 tamagui.config**, so
 * pulling it into v3 would load a second Tamagui config.
 *
 * The translation catalogue itself is shared — `translations/en.json` — so v2
 * and v3 keys live in one file and a translator sees one job.
 *
 * Interpolation and pluralisation go through i18n-js, never string
 * concatenation: "1 stop" / "2 stops" is a plural rule and `%{count} of
 * %{total}` is interpolation. Concatenating those breaks every language whose
 * word order or plural categories differ from English.
 */
import I18n from 'i18n-js';
import en from '../../../translations/en.json';

export const catalogues: Record<string, object> = { en };

I18n.fallbacks = true;
I18n.defaultLocale = 'en';
I18n.locale = 'en';
I18n.translations = catalogues;

/** Missing keys must be loud in dev and harmless in production. */
I18n.missingTranslation = (scope: string) => {
    if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[i18n] missing key: ${scope}`);
    }
    return undefined as unknown as string;
};

export interface TranslateOptions {
    /** Drives plural selection. */
    count?: number;
    /** Used when the key is absent — never a hardcoded English literal in JSX. */
    defaultValue?: string;
    [key: string]: unknown;
}

/**
 * `t('ordersScreen.stopCount', { count: 2 })`
 * `t('ordersScreen.progress', { completed: 2, total: 7 })`
 */
export function t(key: string, options: TranslateOptions = {}): string {
    const { defaultValue, ...rest } = options;
    const result = I18n.t(key, rest);
    if (result === undefined || result === null || String(result).includes('missing')) {
        return defaultValue ?? key;
    }
    return String(result);
}

/** BCP-47 tag for Intl formatting (dates, numbers, currency). */
export function currentLocale(): string {
    return I18n.locale || I18n.defaultLocale || 'en';
}

export function setLocale(locale: string): void {
    I18n.locale = locale;
}

export function availableLocales(): string[] {
    return Object.keys(catalogues);
}

/** Register a catalogue at runtime — used when a locale is lazily loaded. */
export function addCatalogue(locale: string, catalogue: object): void {
    catalogues[locale] = catalogue;
    I18n.translations = catalogues;
}

export default I18n;
