/**
 * Locale resolution, the pseudo-locales, and catalogue parity.
 *
 * Parity is the test that matters most: a key present in `en` and absent in
 * another catalogue falls back to English silently, which is exactly how a
 * half-translated app ships. Every shipped catalogue must carry every v3 key,
 * with the same interpolation placeholders and the same plural forms.
 */
import { I18nManager } from 'react-native';
import en from '../../../../translations/en.json';
import es from '../../../../translations/es.json';
import { bestLocaleFor, resolveLocale, selectableLocales, isRtlLocale, LOCALES } from '../locales';
import { pseudolocalize, pseudolocalizeString } from '../pseudo';
import { applyLocale, t, setLocale, currentLocale, catalogues } from '../index';
import { chevron, backChevron, endAlign } from '../direction';

/** Namespaces that belong to the v2 tree, which the v3 catalogues do not cover. */
const V2_NAMESPACES = new Set(['BootScreen', 'AccountScreen', 'ProfileScreen', 'AddNewLocationScreen', 'SetupWarningScreen', 'DriverReportScreen', 'LocationPermissionScreen']);

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, `${prefix}${k}.`));
        else out[`${prefix}${k}`] = String(v);
    }
    return out;
}

const placeholders = (s: string) => (s.match(/%\{[^}]+\}/g) ?? []).sort();

afterEach(() => setLocale('en'));

describe('bestLocaleFor / resolveLocale', () => {
    it('matches an exact tag, then the language, then falls back to English', () => {
        expect(bestLocaleFor(['es'])).toBe('es');
        expect(bestLocaleFor(['es-MX', 'en-US'])).toBe('es');
        expect(bestLocaleFor(['en-GB'])).toBe('en');
        expect(bestLocaleFor(['fr-FR', 'de-DE'])).toBe('en');
        expect(bestLocaleFor([])).toBe('en');
    });

    it('never lands a real phone on a pseudo-locale', () => {
        expect(bestLocaleFor(['ar-XB'])).toBe('en');
        expect(bestLocaleFor(['ar-SA'])).toBe('en');
    });

    it('follows the phone for "system" and honours an explicit choice', () => {
        expect(resolveLocale('system', ['es-ES'])).toBe('es');
        expect(resolveLocale('en', ['es-ES'])).toBe('en');
        expect(resolveLocale('ar-XB', ['en-GB'])).toBe('ar-XB');
    });

    it('rescues the old en-GB default by language rather than failing over', () => {
        expect(resolveLocale('en-GB', ['es-ES'])).toBe('en');
        expect(resolveLocale(undefined, ['es-ES'])).toBe('es');
    });

    it('offers pseudo-locales only in development', () => {
        expect(selectableLocales(false).map((l) => l.tag)).toEqual(['en', 'es']);
        expect(selectableLocales(true).map((l) => l.tag)).toEqual(LOCALES.map((l) => l.tag));
    });
});

describe('pseudo-localisation', () => {
    it('expands by roughly a third and keeps placeholders intact', () => {
        const out = pseudolocalizeString('Arriving in %{duration}');
        expect(out).toContain('%{duration}');
        expect(out.length).toBeGreaterThan('Arriving in %{duration}'.length * 1.25);
        expect(out.startsWith('[')).toBe(true);
    });

    it('wraps the RTL variant in a bidi override', () => {
        const out = pseudolocalizeString('Navigate', { rtl: true });
        expect(out.startsWith('‮')).toBe(true);
        expect(out.endsWith('‬')).toBe(true);
    });

    it('keeps the catalogue structure — plural keys stay keys', () => {
        const out = pseudolocalize({ ui: { itemCount: { one: '%{count} item', other: '%{count} items' } } });
        expect(Object.keys(out.ui.itemCount)).toEqual(['one', 'other']);
        expect(out.ui.itemCount.other).toContain('%{count}');
    });

    it('registers both pseudo-locales in development and they interpolate', () => {
        expect(catalogues['en-XA']).toBeDefined();
        setLocale('en-XA');
        expect(t('ui.itemCount', { count: 3 })).toContain('3');
        setLocale('ar-XB');
        expect(t('common.cancel')).toContain('‮');
    });
});

describe('catalogue parity — es', () => {
    const enFlat = flatten(en as Record<string, unknown>);
    const esFlat = flatten(es as Record<string, unknown>);
    const v3Keys = Object.keys(enFlat).filter((k) => !V2_NAMESPACES.has(k.split('.')[0]));

    it('carries every v3 key', () => {
        const missing = v3Keys.filter((k) => !(k in esFlat));
        expect(missing).toEqual([]);
    });

    it('carries no key English does not have', () => {
        const extra = Object.keys(esFlat).filter((k) => !(k in enFlat));
        expect(extra).toEqual([]);
    });

    it('keeps every interpolation placeholder', () => {
        const drift = v3Keys.filter((k) => k in esFlat && placeholders(enFlat[k]).join() !== placeholders(esFlat[k]).join());
        expect(drift).toEqual([]);
    });

    it('is actually translated, not copied', () => {
        const same = v3Keys.filter((k) => k in esFlat && esFlat[k] === enFlat[k] && /[a-z]{4,}/i.test(enFlat[k]) && !/^[A-Z0-9 .:%{}-]+$/.test(enFlat[k]));
        // Identifiers, brand names and a handful of shared words legitimately match.
        expect(same.length).toBeLessThan(v3Keys.length * 0.05);
    });

    it('translates through the real path', () => {
        setLocale('es');
        expect(t('common.cancel')).toBe('Cancelar');
        expect(t('ui.itemCount', { count: 2 })).toBe('2 artículos');
        expect(currentLocale()).toBe('es');
    });
});

describe('direction', () => {
    it('reports RTL for the RTL locales only', () => {
        expect(isRtlLocale('ar-XB')).toBe(true);
        expect(isRtlLocale('es')).toBe(false);
    });

    it('flips the layout direction when the locale needs it, and says a restart is needed', () => {
        const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
        const allow = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
        expect(applyLocale('es')).toEqual({ locale: 'es', needsRestart: false });
        expect(force).not.toHaveBeenCalled();
        expect(applyLocale('ar-XB')).toEqual({ locale: 'ar-XB', needsRestart: true });
        expect(allow).toHaveBeenCalledWith(true);
        expect(force).toHaveBeenCalledWith(true);
        // Unknown tags fall back rather than leaving the catalogue on nothing.
        expect(applyLocale('xx').locale).toBe('en');
        force.mockRestore();
        allow.mockRestore();
    });

    it('chevrons and end alignment follow the process direction', () => {
        const original = I18nManager.isRTL;
        (I18nManager as { isRTL: boolean }).isRTL = false;
        expect(chevron()).toBe('›');
        expect(backChevron()).toBe('‹');
        expect(endAlign()).toBe('right');
        (I18nManager as { isRTL: boolean }).isRTL = true;
        expect(chevron()).toBe('‹');
        expect(backChevron()).toBe('›');
        expect(endAlign()).toBe('left');
        (I18nManager as { isRTL: boolean }).isRTL = original;
    });
});
