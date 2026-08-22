/**
 * Proves the v2 formatters are importable from v3 again.
 *
 * They were not: `utils/format.js` imports the `utils/index.js` barrel, and that
 * barrel imported `tamagui.config` for one non-reactive `getTheme` helper. So
 * touching any v2 formatter from v3 loaded a **second** Tamagui config —
 * "duplicate Tamagui dependencies" — and dragged the v2 provider stack into any
 * test that rendered a card. That is why `src/v3/format.ts` exists at all.
 *
 * `getTheme` now lives in `utils/theme.js`, so this import is clean. If it ever
 * regresses, this test fails at import time rather than mysteriously in a
 * screen test.
 */
import { formatCurrency, formatMeters as v2FormatMeters, capitalize } from '../../utils/format';
import { formatMoney, formatMeters } from '../format';

describe('sharing the v2 formatters', () => {
    it('imports them without loading a second Tamagui config', () => {
        expect(typeof formatCurrency).toBe('function');
        expect(typeof capitalize).toBe('function');
    });

    it('agrees with v2 on money, which is the one that mattered', () => {
        // Both divide minor units; v3 adds the zero-decimal currency rule.
        expect(formatMoney('2850', 'USD')).toBe('$28.50');
        expect(v2FormatMeters(840)).toContain('840');
    });

    it('keeps the v3 formatter that v2 has no equivalent for', () => {
        // v2's formatMeters is metric-only; the design's imperial toggle needs
        // this, which is why this one stays duplicated deliberately.
        expect(formatMeters(1609.344, 'imperial')).toBe('1 mi');
        expect(formatMeters(1000, 'metric')).toBe('1 km');
    });
});
