/**
 * The locales the app knows about, and how a preference becomes one of them.
 *
 * Two kinds of entry. The shipped catalogues, which a driver can pick. And two
 * **pseudo-locales**, generated from `en` at runtime in development builds
 * only: `en-XA` stretches every string by about a third and accents it, which
 * is how the ~30% expansion rule (invariant 7) gets exercised on every screen
 * without waiting for a translator; `ar-XB` does the same under a right-to-left
 * override, which is how the layout gets walked in RTL before an RTL language
 * ships. Both are the industry's standard names for exactly this.
 *
 * Tags are BCP-47. A device reports `en-GB` or `es-MX`; the catalogue is keyed
 * by language, so matching is by exact tag first and language subtag second.
 * Nothing here reads the device — see `deviceLanguageTags` in index.ts — so it
 * can be tested with plain arrays.
 */

export interface LocaleInfo {
    /** BCP-47 tag, and the catalogue key. */
    tag: string;
    /** The language's own name for itself — a picker never translates these. */
    name: string;
    rtl: boolean;
    /** Development-only pseudo-locale; never offered in a release build. */
    pseudo?: boolean;
}

export const LOCALES: readonly LocaleInfo[] = [
    { tag: 'en', name: 'English', rtl: false },
    { tag: 'es', name: 'Español', rtl: false },
    { tag: 'en-XA', name: '[Pseudo expanded]', rtl: false, pseudo: true },
    { tag: 'ar-XB', name: '[Pseudo RTL]', rtl: true, pseudo: true },
];

export const DEFAULT_LOCALE = 'en';

/** `'system'` follows the device; anything else is a tag from LOCALES. */
export type LanguagePreference = 'system' | string;

export function localeInfo(tag: string): LocaleInfo | undefined {
    return LOCALES.find((l) => l.tag === tag);
}

export function isRtlLocale(tag: string): boolean {
    return localeInfo(tag)?.rtl ?? false;
}

/** The locales a driver may choose from: pseudo-locales only in development. */
export function selectableLocales(dev: boolean = typeof __DEV__ !== 'undefined' && __DEV__): LocaleInfo[] {
    return LOCALES.filter((l) => dev || !l.pseudo);
}

function languageOf(tag: string): string {
    return tag.toLowerCase().split(/[-_]/)[0];
}

/**
 * Best catalogue for a list of device tags, most preferred first: an exact
 * tag match wins, then the first whose language matches. Pseudo-locales are
 * never matched from the device — a phone set to Arabic must not land on the
 * RTL test locale.
 */
export function bestLocaleFor(deviceTags: readonly string[]): string {
    const real = LOCALES.filter((l) => !l.pseudo);
    for (const tag of deviceTags) {
        const exact = real.find((l) => l.tag.toLowerCase() === tag.toLowerCase());
        if (exact) return exact.tag;
    }
    for (const tag of deviceTags) {
        const byLanguage = real.find((l) => languageOf(l.tag) === languageOf(tag));
        if (byLanguage) return byLanguage.tag;
    }
    return DEFAULT_LOCALE;
}

/**
 * Preference → catalogue key. An explicit tag is honoured when it is one we
 * have; a stale or unknown one (the store once defaulted to `en-GB`, which no
 * catalogue is keyed by) is matched by language rather than failing over to
 * English silently.
 */
export function resolveLocale(preference: LanguagePreference | undefined, deviceTags: readonly string[]): string {
    if (!preference || preference === 'system') return bestLocaleFor(deviceTags);
    if (localeInfo(preference)) return preference;
    return bestLocaleFor([preference]);
}
