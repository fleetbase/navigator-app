import { formatMoney, formatWeight, formatDimensions } from '../format';

describe('formatMoney', () => {
    it('divides minor units — a live entity sends price "2850" USD', () => {
        expect(formatMoney('2850', 'USD')).toBe('$28.50');
    });

    it('accepts numbers as well as the strings the API sends', () => {
        expect(formatMoney(2850, 'USD')).toBe('$28.50');
    });

    it('does not divide zero-decimal currencies', () => {
        // ¥2850 is ¥2850, not ¥28.50.
        expect(formatMoney('2850', 'JPY')).toContain('2,850');
    });

    it('renders an em dash rather than NaN for missing or junk values', () => {
        expect(formatMoney(null)).toBe('—');
        expect(formatMoney('')).toBe('—');
        expect(formatMoney('not-a-number')).toBe('—');
    });

    it('still shows the amount for an unrecognised currency code', () => {
        // Intl accepts any well-formed 3-letter code and echoes it, so this
        // stays in Intl's hands; the fallback only catches malformed codes.
        const out = formatMoney('2850', 'ZZZ');
        expect(out).toContain('28.50');
        expect(out).toContain('ZZZ');
    });

    it('falls back rather than throwing on a malformed currency code', () => {
        expect(formatMoney('2850', 'US')).toBe('28.50 US');
    });

    it('treats zero as a real price, not a missing one', () => {
        expect(formatMoney('0', 'USD')).toBe('$0.00');
    });
});

describe('formatWeight', () => {
    it('uses the unit the record carries rather than assuming one', () => {
        expect(formatWeight('2.4', 'kg')).toBe('2.4 kg');
        expect(formatWeight('12', 'lb')).toBe('12 lb');
    });

    it('omits the unit when the record has none', () => {
        expect(formatWeight('2.4', null)).toBe('2.4');
    });

    it('is an em dash when there is no weight', () => {
        expect(formatWeight(null, 'kg')).toBe('—');
    });
});

describe('formatDimensions', () => {
    it('joins the three sides with the unit', () => {
        expect(formatDimensions('40', '30', '25', 'cm')).toBe('40 × 30 × 25 cm');
    });

    it('marks unknown sides rather than dropping them silently', () => {
        expect(formatDimensions('40', null, '25', 'cm')).toBe('40 × ? × 25 cm');
    });

    it('is undefined when nothing is known, so the row can be omitted', () => {
        expect(formatDimensions(null, null, null, 'cm')).toBeUndefined();
        expect(formatDimensions(null, null, null, null)).toBeUndefined();
    });
});
