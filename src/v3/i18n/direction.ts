/**
 * Layout direction, in one place.
 *
 * React Native flips `start`/`end`, `marginStart`/`paddingEnd` and row order
 * under `I18nManager.forceRTL`, but it does **not** flip `textAlign: 'right'`,
 * absolute `left`/`right`, or a chevron glyph. Those are the three things
 * screens reach for here rather than hard-coding a side.
 *
 * Direction is a process-level fact — forcing it takes effect on the next
 * launch — so these are plain functions, not hooks.
 */
import { I18nManager } from 'react-native';

export function isRTL(): boolean {
    return I18nManager.isRTL;
}

/** The trailing edge, for right-aligned values in a two-column row. */
export function endAlign(): 'left' | 'right' {
    return isRTL() ? 'left' : 'right';
}

/** "Go deeper" chevron: points into the reading direction. */
export function chevron(): string {
    return isRTL() ? '‹' : '›';
}

/** "Go back" chevron: points against it. */
export function backChevron(): string {
    return isRTL() ? '›' : '‹';
}
