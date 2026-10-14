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
import { I18nManager } from 'react-native';
import I18n from 'i18n-js';
import en from '../../../translations/en.json';
import es from '../../../translations/es.json';
import { pseudolocalize } from './pseudo';
import { DEFAULT_LOCALE, isRtlLocale, localeInfo } from './locales';

export * from './locales';
export * from './direction';
export { pseudolocalize, pseudolocalizeString } from './pseudo';

export const catalogues: Record<string, object> = { en, es };

/*
 * The pseudo-locales are built, not shipped: a development build gets them
 * for free and a release build never carries them. See locales.ts.
 */
if (typeof __DEV__ !== 'undefined' && __DEV__) {
    catalogues['en-XA'] = pseudolocalize(en);
    catalogues['ar-XB'] = pseudolocalize(en, { rtl: true });
}

I18n.fallbacks = true;
I18n.defaultLocale = DEFAULT_LOCALE;
I18n.locale = DEFAULT_LOCALE;
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

/**
 * The device's languages, most preferred first, as BCP-47 tags.
 *
 * `react-native-localize` is native; under Jest, or on a platform where the
 * module has not linked, it throws rather than returning nothing. An empty
 * list means "no preference known", and the resolver falls back to English.
 */
export function deviceLanguageTags(): string[] {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const localize = require('react-native-localize') as { getLocales?: () => { languageTag: string }[] };
        return (localize.getLocales?.() ?? []).map((l) => l.languageTag).filter(Boolean);
    } catch {
        return [];
    }
}

export interface ApplyLocaleResult {
    locale: string;
    /**
     * Direction is applied by React Native at launch, not at the moment it is
     * forced. When switching between an LTR and an RTL locale the app has to
     * be restarted for rows, chevrons and gestures to flip, and the caller
     * should say so rather than leave the driver looking at a half-flipped
     * screen.
     */
    needsRestart: boolean;
}

/**
 * Make `locale` current: the catalogue, and the layout direction it needs.
 * Idempotent — calling it with the current locale changes nothing.
 */
export function applyLocale(locale: string): ApplyLocaleResult {
    const target = localeInfo(locale) ? locale : DEFAULT_LOCALE;
    setLocale(target);

    const rtl = isRtlLocale(target);
    let needsRestart = false;
    if (I18nManager.isRTL !== rtl) {
        I18nManager.allowRTL(rtl);
        I18nManager.forceRTL(rtl);
        needsRestart = true;
    }
    return { locale: target, needsRestart };
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
