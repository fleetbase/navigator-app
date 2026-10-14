/**
 * Card / Surface primitives.
 *
 * Elevation is a variant rather than a set of loose shadow props so cards can't
 * drift apart across screens. shadowColor comes from the theme (near-black on
 * light, pure black on dark) — v2 hardcoded '#000' everywhere, which made cards
 * float oddly in light mode.
 */
import { styled, YStack } from 'tamagui';
import { elevation, radius, space } from '../theme/tokens';

export const Surface = styled(YStack, {
    name: 'Surface',
    backgroundColor: '$surface',
    borderColor: '$border',
    borderWidth: 1,
    borderRadius: radius.compact,

    variants: {
        level: {
            flat: { ...elevation.base, shadowColor: '$shadowColor' },
            card: { ...elevation.card, shadowColor: '$shadowColor' },
            sheet: { ...elevation.sheet, shadowColor: '$shadowColor', backgroundColor: '$surfaceRaised' },
            mapOverlay: { ...elevation.mapOverlay, shadowColor: '$shadowColor' },
        },
        /** Hero radius for the next-stop card and sheets. */
        hero: { true: { borderRadius: radius.hero } },
        raised: { true: { backgroundColor: '$surfaceRaised' } },
        /** The current stop / active selection treatment. */
        active: { true: { borderColor: '$primary', borderWidth: 1.5 } },
        padded: {
            true: { padding: space[4] },
            compact: { padding: space[3] },
        },
        /** Completed rows recede rather than disappear. */
        muted: { true: { opacity: 0.6 } },
    } as const,

    defaultVariants: { level: 'card' },
});

export const Divider = styled(YStack, {
    name: 'Divider',
    height: 1,
    backgroundColor: '$border',
    alignSelf: 'stretch',
});

export default Surface;
