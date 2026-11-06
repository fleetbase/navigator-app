/**
 * Registers the app's fonts with @font-face, before the first render.
 *
 * Native addresses a weight by its face's PostScript name (src/v3/theme/fonts.ts).
 * On the web Tamagui keeps one family and sets `font-weight`, so each family the
 * theme names is declared with every weight, and each face under its own name too.
 */
import { fontFaces } from '../src/v3/theme/fonts';

const shipped = require.context('../assets/fonts', false, /\.(ttf|otf)$/);
const brand = require.context('@brand-fonts', false, /\.(ttf|otf|woff2?)$/);

const files = new Map<string, string>();
for (const context of [shipped, brand]) {
    for (const key of context.keys()) {
        const name = key.replace(/^\.\//, '').replace(/\.[^.]+$/, '');
        files.set(name, context(key) as string);
    }
}

const face = (family: string, url: string, weight: string) => `@font-face { font-family: '${family}'; src: url('${url}'); font-weight: ${weight}; font-style: normal; font-display: swap; }`;

export function registerWebFonts(): void {
    const rules = new Set<string>();
    // The family createFont names for each role (src/v3/theme/fonts.ts).
    const roles = [
        [fontFaces.ui, fontFaces.ui[400]],
        [fontFaces.heading, fontFaces.heading[700]],
        [fontFaces.mono, fontFaces.mono[400]],
    ] as [Record<string, string>, string][];
    const families = new Set(roles.map(([, family]) => family));

    for (const [faces, family] of roles) {
        for (const [weight, name] of Object.entries(faces)) {
            const url = files.get(name);
            if (!url) continue;
            rules.add(face(family, url, weight));
            if (!families.has(name)) rules.add(face(name, url, 'normal'));
        }
    }

    const style = document.createElement('style');
    style.setAttribute('data-fonts', '');
    style.textContent = [...rules].join('\n');
    document.head.appendChild(style);
}
