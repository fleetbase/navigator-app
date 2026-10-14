/**
 * Waypoint typography — Archivo (UI) + JetBrains Mono (identifiers).
 *
 * The v2 config had no font configuration at all: it spread @tamagui/config/v3
 * wholesale, so the app ran on stock Inter and components mixed `fontSize='$2'`
 * with `fontSize={16}` freely.
 *
 * Weights are addressed by PostScript name via `face`, not by fontWeight. Google
 * Fonts statics put each weight in its own name-table family ("Archivo Medium",
 * "Archivo SemiBold"), so `fontFamily: 'Archivo' + fontWeight: '600'` does not
 * resolve reliably on iOS. Naming the face explicitly works on both platforms.
 *
 * Files live in assets/fonts and are linked via the `assets` entry in
 * react-native.config.js (`npx react-native-asset` after install).
 */
import { createFont } from 'tamagui';
import { type, glanceable } from './tokens';

/** PostScript names — must match the `postScript` field of the shipped TTFs. */
export const fontFaces = {
    ui: {
        400: 'Archivo-Regular',
        500: 'Archivo-Medium',
        600: 'Archivo-SemiBold',
        700: 'Archivo-Bold',
        800: 'Archivo-ExtraBold',
    },
    mono: {
        400: 'JetBrainsMono-Regular',
        500: 'JetBrainsMono-Medium',
        600: 'JetBrainsMono-SemiBold',
    },
} as const;

const uiFace = {
    400: { normal: fontFaces.ui[400] },
    500: { normal: fontFaces.ui[500] },
    600: { normal: fontFaces.ui[600] },
    700: { normal: fontFaces.ui[700] },
    800: { normal: fontFaces.ui[800] },
};

const monoFace = {
    400: { normal: fontFaces.mono[400] },
    500: { normal: fontFaces.mono[500] },
    600: { normal: fontFaces.mono[600] },
};

/**
 * Named steps rather than an anonymous numeric ramp — a screen should have to
 * say which role it means. `$true` maps to body.
 */
const size = {
    micro: type.micro.size,
    caption: type.caption.size,
    secondary: type.secondary.size,
    body: type.body.size,
    true: type.body.size,
    heading: type.heading.size,
    title: type.title.size,
    display: type.display.size,
    metric: glanceable.metric.size,
    major: glanceable.major.size,
    hero: glanceable.hero.size,
};

const lineHeight = {
    micro: type.micro.lineHeight,
    caption: type.caption.lineHeight,
    secondary: type.secondary.lineHeight,
    body: type.body.lineHeight,
    true: type.body.lineHeight,
    heading: type.heading.lineHeight,
    title: type.title.lineHeight,
    display: type.display.lineHeight,
    metric: glanceable.metric.lineHeight,
    major: glanceable.major.lineHeight,
    hero: glanceable.hero.lineHeight,
};

const letterSpacing = {
    micro: type.micro.letterSpacing,
    caption: type.caption.letterSpacing,
    secondary: type.secondary.letterSpacing,
    body: type.body.letterSpacing,
    true: type.body.letterSpacing,
    heading: type.heading.letterSpacing,
    title: type.title.letterSpacing,
    display: type.display.letterSpacing,
    metric: glanceable.metric.letterSpacing,
    major: glanceable.major.letterSpacing,
    hero: glanceable.hero.letterSpacing,
};

const weight = {
    micro: type.micro.weight,
    caption: type.caption.weight,
    secondary: type.secondary.weight,
    body: type.body.weight,
    true: type.body.weight,
    heading: type.heading.weight,
    title: type.title.weight,
    display: type.display.weight,
    metric: glanceable.metric.weight,
    major: glanceable.major.weight,
    hero: glanceable.hero.weight,
};

export const bodyFont = createFont({
    family: fontFaces.ui[400],
    size,
    lineHeight,
    letterSpacing,
    weight,
    face: uiFace,
});

export const headingFont = createFont({
    family: fontFaces.ui[700],
    size,
    lineHeight,
    letterSpacing,
    weight,
    face: uiFace,
});

/**
 * Identifiers — tracking numbers, entity IDs, serials, coordinates, odometer.
 * The design's rule: rendered in full, monospaced, on their own line, never
 * truncated. Always pair with `tabular` from tokens.ts for numeric runs.
 */
export const monoFont = createFont({
    family: fontFaces.mono[400],
    size,
    lineHeight,
    letterSpacing,
    weight: { ...weight, true: '400' },
    face: monoFace,
});

export const fonts = {
    body: bodyFont,
    heading: headingFont,
    mono: monoFont,
};
