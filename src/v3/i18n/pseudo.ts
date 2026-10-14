/**
 * Pseudo-localisation — a catalogue built from `en` that is deliberately
 * hard to fit.
 *
 * `en-XA`: every Latin letter is swapped for an accented look-alike, so the
 * string stays readable, and the text is padded to roughly 130% of its
 * length, which is what German or Finnish do to an English layout. A label
 * that truncates here will truncate for a real translator's work.
 *
 * `ar-XB`: the same, wrapped in a right-to-left override so the text lays
 * out RTL under `I18nManager.forceRTL`. Numbers, interpolation placeholders
 * (`%{count}`) and plural keys are left exactly as they are, so the strings
 * still interpolate and pluralise.
 */

const ACCENTED: Record<string, string> = {
    a: 'ȧ', b: 'ƀ', c: 'ƈ', d: 'ḓ', e: 'ḗ', f: 'ƒ', g: 'ɠ', h: 'ħ', i: 'ī',
    j: 'ĵ', k: 'ķ', l: 'ŀ', m: 'ḿ', n: 'ƞ', o: 'ǿ', p: 'ƥ', q: 'ɋ', r: 'ř',
    s: 'ş', t: 'ŧ', u: 'ŭ', v: 'ṽ', w: 'ẇ', x: 'ẋ', y: 'ẏ', z: 'ẑ',
    A: 'Ȧ', B: 'Ɓ', C: 'Ƈ', D: 'Ḓ', E: 'Ḗ', F: 'Ƒ', G: 'Ɠ', H: 'Ħ', I: 'Ī',
    J: 'Ĵ', K: 'Ķ', L: 'Ŀ', M: 'Ḿ', N: 'Ƞ', O: 'Ǿ', P: 'Ƥ', Q: 'Ɋ', R: 'Ř',
    S: 'Ş', T: 'Ŧ', U: 'Ŭ', V: 'Ṽ', W: 'Ẇ', X: 'Ẋ', Y: 'Ẏ', Z: 'Ẑ',
};

const PLACEHOLDER = /%\{[^}]+\}/g;
/** RIGHT-TO-LEFT OVERRIDE and POP DIRECTIONAL FORMATTING, as escapes so they stay visible in source. */
const RLO = '\u202E';
const PDF = '\u202C';

/** Roughly +30%, never less than a couple of characters so short labels grow too. */
export function expansionFor(length: number): number {
    return Math.max(2, Math.ceil(length * 0.3));
}

export function pseudolocalizeString(value: string, options: { rtl?: boolean } = {}): string {
    const placeholders: string[] = [];
    const masked = value.replace(PLACEHOLDER, (m) => {
        placeholders.push(m);
        return ` ${placeholders.length - 1} `;
    });

    let out = '';
    for (const ch of masked) out += ACCENTED[ch] ?? ch;

    const restored = out.replace(/ (\d+) /g, (_, i: string) => placeholders[Number(i)]);
    const padded = `${restored}${' ~'.repeat(Math.ceil(expansionFor(value.length) / 2))}`;
    return options.rtl ? `${RLO}${padded}${PDF}` : `[${padded}]`;
}

/** Deep-maps a catalogue. Plural and namespace keys are structure, and untouched. */
export function pseudolocalize<T>(catalogue: T, options: { rtl?: boolean } = {}): T {
    if (typeof catalogue === 'string') return pseudolocalizeString(catalogue, options) as unknown as T;
    if (Array.isArray(catalogue)) return catalogue.map((v) => pseudolocalize(v, options)) as unknown as T;
    if (catalogue && typeof catalogue === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(catalogue as Record<string, unknown>)) out[k] = pseudolocalize(v, options);
        return out as T;
    }
    return catalogue;
}
