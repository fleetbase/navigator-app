/**
 * Button — 5 variants × 6 states, minimum 48dp.
 *
 * v2 had no button primitive at all: `components/Buttons.tsx` was five
 * social-login buttons, and every screen hand-rolled a Tamagui <Button> with
 * inline colours. Every state the design specifies is expressed here so screens
 * never re-derive one.
 */
import { forwardRef } from 'react';
import { Spinner, XStack, styled, type GetProps } from 'tamagui';
import { Body } from './Text';
import { hitTarget, radius, motion, space } from '../theme/tokens';

const Frame = styled(XStack, {
    name: 'WaypointButton',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    height: hitTarget.button,
    paddingHorizontal: space[4],
    borderRadius: radius.compact + 2,
    borderWidth: 1,
    borderColor: '$transparent',
    animation: 'quick',

    variants: {
        variant: {
            primary: {
                backgroundColor: '$primary',
                pressStyle: { backgroundColor: '$primaryDeep', scale: motion.press.scale },
            },
            secondary: {
                backgroundColor: '$surfaceRaised',
                borderColor: '$border',
                pressStyle: { backgroundColor: '$border', scale: motion.press.scale },
            },
            destructive: {
                backgroundColor: '$dangerFill',
                borderColor: '$dangerBorder',
                pressStyle: { opacity: 0.75, scale: motion.press.scale },
            },
            ghost: {
                backgroundColor: '$transparent',
                pressStyle: { backgroundColor: '$surfaceRaised', scale: motion.press.scale },
            },
            icon: {
                backgroundColor: '$surfaceRaised',
                borderColor: '$border',
                width: hitTarget.button,
                paddingHorizontal: 0,
                pressStyle: { backgroundColor: '$border', scale: motion.press.scale },
            },
        },
        /** The design's floating-action treatment: brand glow under the primary CTA. */
        elevated: {
            true: {
                shadowColor: '$primary',
                shadowOpacity: 0.25,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 8,
            },
        },
        fullWidth: { true: { width: '100%' } },
        disabled: {
            true: { opacity: 0.38, pressStyle: { scale: 1 } },
        },
        /** Error state — a submit that failed validation, per the design's 5th column. */
        invalid: {
            true: { borderColor: '$danger', borderWidth: 1.5 },
        },
    } as const,

    defaultVariants: { variant: 'primary' },
});

const labelTone = {
    primary: 'onPrimary',
    secondary: 'primary',
    destructive: 'danger',
    ghost: 'secondary',
    icon: 'primary',
} as const;

export type ButtonVariant = keyof typeof labelTone;

export interface ButtonProps extends Omit<GetProps<typeof Frame>, 'children'> {
    children?: React.ReactNode;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    /** Leading element — icon, badge, avatar. */
    icon?: React.ReactNode;
    onPress?: () => void;
}

export const Button = forwardRef<any, ButtonProps>(function WaypointButton(
    { children, variant = 'primary', loading, disabled, icon, onPress, ...rest },
    ref
) {
    const inert = disabled || loading;
    const tone = labelTone[variant];

    return (
        <Frame
            ref={ref}
            variant={variant}
            disabled={inert}
            onPress={inert ? undefined : onPress}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!inert, busy: !!loading }}
            {...rest}
        >
            {loading ? (
                <Spinner size="small" color={variant === 'primary' ? ('$onPrimary' as any) : ('$primary' as any)} />
            ) : (
                <>
                    {icon}
                    {typeof children === 'string' ? (
                        <Body tone={tone} fontWeight="700" numberOfLines={1}>
                            {children}
                        </Body>
                    ) : (
                        children
                    )}
                </>
            )}
        </Frame>
    );
});

/** Skeleton placeholder matching the button footprint, for loading screens. */
export const ButtonSkeleton = styled(XStack, {
    name: 'ButtonSkeleton',
    height: hitTarget.button,
    borderRadius: radius.compact + 2,
    backgroundColor: '$surfaceRaised',
    opacity: 0.6,
});

export default Button;
