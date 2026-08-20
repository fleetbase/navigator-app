/**
 * Screens call `const { t } = useTranslation()` so a locale change re-renders
 * them. The locale lives in settings, which is already a subscribed store.
 */
import { useCallback, useMemo } from 'react';
import { useSettings } from '../settings';
import { setLocale, t as translate, currentLocale, type TranslateOptions } from './index';

export function useTranslation() {
    const { language } = useSettings();

    // i18n-js holds locale on a module singleton; keep it in step with the
    // persisted preference before any translation is read this render.
    const locale = language || currentLocale();
    if (currentLocale() !== locale) {
        setLocale(locale);
    }

    const t = useCallback(
        (key: string, options?: TranslateOptions) => translate(key, options),
        // `locale` is the real dependency: re-create `t` so memoised children
        // re-render when the driver changes language.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [locale]
    );

    return useMemo(() => ({ t, locale }), [t, locale]);
}

export default useTranslation;
