/**
 * Typography primitives.
 *
 * The design's hierarchy depends on size, weight and letter-spacing moving
 * together, so each step is a component rather than three props a caller has to
 * remember. v2 had no font config at all and screens mixed `fontSize='$2'` with
 * `fontSize={16}` freely; if you find yourself reaching past these, the scale is
 * wrong — fix tokens.ts rather than inlining a size.
 */
import type { FontVariant } from 'react-native';
import { styled, Text as TamaguiText } from 'tamagui';
import { type as typeScale, glanceable, type TypeStep } from '../theme/tokens';

/** Extracted so `as const` on the variants below doesn't make this readonly. */
const TABULAR: { fontVariant: FontVariant[] } = { fontVariant: ['tabular-nums'] };

const step = (s: TypeStep) => ({
    fontSize: s.size,
    fontWeight: s.weight,
    letterSpacing: s.letterSpacing,
    lineHeight: s.lineHeight,
});

const BaseText = styled(TamaguiText, {
    name: 'WaypointText',
    fontFamily: '$body',
    color: '$textPrimary',

    variants: {
        tone: {
            primary: { color: '$textPrimary' },
            secondary: { color: '$textSecondary' },
            muted: { color: '$textMuted' },
            brand: { color: '$primary' },
            onPrimary: { color: '$onPrimary' },
            success: { color: '$successText' },
            warning: { color: '$warningText' },
            danger: { color: '$dangerText' },
        },
        /**
         * Distance, time, money, odometer and counts must be tabular so digits
         * don't jitter as values tick.
         */
        // `as const` is required for Tamagui to infer variant *keys*; without it
        // every variant prop is stripped from the whole family. But an inline
        // `['tabular-nums']` under `as const` becomes a readonly tuple, which
        // VariantDefinitions rejects — hence the extracted mutable constant.
        tabular: { true: TABULAR },
        center: { true: { textAlign: 'center' } },
    } as const,

    defaultVariants: { tone: 'primary' },
});

export const Display = styled(BaseText, { name: 'Display', ...step(typeScale.display) });
export const Title = styled(BaseText, { name: 'Title', ...step(typeScale.title) });
export const Heading = styled(BaseText, { name: 'Heading', ...step(typeScale.heading) });
export const Body = styled(BaseText, { name: 'Body', ...step(typeScale.body) });
export const Secondary = styled(BaseText, { name: 'Secondary', ...step(typeScale.secondary), color: '$textSecondary' });

/** Small labels above values. Uppercase is applied by the caller, not baked in — it breaks some scripts. */
export const Caption = styled(BaseText, { name: 'Caption', ...step(typeScale.caption), color: '$textMuted' });

/** Status-ish micro copy: "QUEUED · WILL SYNC". */
export const Micro = styled(BaseText, { name: 'Micro', ...step(typeScale.micro), color: '$textMuted' });

/** Glanceable tier — arm's length, always tabular. */
export const MetricValue = styled(BaseText, { name: 'MetricValue', ...step(glanceable.metric), fontVariant: ['tabular-nums'] });
export const MajorValue = styled(BaseText, { name: 'MajorValue', ...step(glanceable.major), fontVariant: ['tabular-nums'] });
export const HeroValue = styled(BaseText, { name: 'HeroValue', ...step(glanceable.hero), fontVariant: ['tabular-nums'] });

export { BaseText as Text };
