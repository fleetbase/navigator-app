/**
 * The frame every screen before the dashboard shares — design round 3.
 *
 * Three fixed parts: a back or close control at the top, content that scrolls
 * only when it has to, and the actions anchored at the bottom where a thumb is.
 * The primary action is 60 high; there is one per screen.
 */
import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../ui/Scroll';
import { Button, type ButtonProps } from '../ui/Button';
import { Body, Caption, Display, Secondary } from '../ui/Text';
import { space } from '../theme/tokens';

export const ACTION_HEIGHT = 60;
export const ACTION_RADIUS = 16;
export const CARD_RADIUS = 18;

/** The one primary action of a screen, or its full-width secondary. */
export function BigButton(props: ButtonProps) {
    return <Button fullWidth height={ACTION_HEIGHT} borderRadius={ACTION_RADIUS} {...props} />;
}

/** A quiet text action under the primary one. */
export function LinkButton({ children, onPress, testID }: { children: string; onPress?: () => void; testID?: string }) {
    return (
        <YStack height={48} alignItems="center" justifyContent="center" onPress={onPress} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" testID={testID}>
            <Body fontSize={15} fontWeight="700" tone="secondary" numberOfLines={1}>
                {children}
            </Body>
        </YStack>
    );
}

export function RoundButton({ kind = 'back', onPress, label, testID }: { kind?: 'back' | 'close'; onPress?: () => void; label: string; testID?: string }) {
    const theme = useTheme();
    const stroke = theme.textPrimary?.val as string;
    return (
        <YStack
            width={44}
            height={44}
            borderRadius={22}
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$border"
            alignItems="center"
            justifyContent="center"
            onPress={onPress}
            pressStyle={{ opacity: 0.6 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
        >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Path d={kind === 'back' ? 'M15 5l-7 7 7 7' : 'M6 6l12 12M18 6L6 18'} />
            </Svg>
        </YStack>
    );
}

/** Eyebrow, title and one line of explanation: the top of every step. */
export function StepTitle({ eyebrow, title, body, testID }: { eyebrow?: string; title: string; body?: React.ReactNode; testID?: string }) {
    return (
        <YStack gap={space[2]} testID={testID}>
            {eyebrow ? (
                <Caption fontSize={12} fontWeight="800" letterSpacing={0.7} color="$primary">
                    {eyebrow.toUpperCase()}
                </Caption>
            ) : null}
            <Display fontSize={32} lineHeight={36} fontWeight="800" letterSpacing={-0.6}>
                {title}
            </Display>
            {typeof body === 'string' ? (
                <Secondary fontSize={16} lineHeight={24}>
                    {body}
                </Secondary>
            ) : (
                body
            )}
        </YStack>
    );
}

export interface AuthScaffoldProps {
    onBack?: () => void;
    backKind?: 'back' | 'close';
    backLabel?: string;
    /** Sits beside the back control: a step meter, usually. */
    headerRight?: React.ReactNode;
    children: React.ReactNode;
    /** Anchored at the bottom, above the keyboard. */
    footer?: React.ReactNode;
    testID?: string;
}

export function AuthScaffold({ onBack, backKind = 'back', backLabel = 'Back', headerRight, children, footer, testID }: AuthScaffoldProps) {
    const insets = useSafeAreaInsets();
    return (
        <YStack flex={1} backgroundColor="$background" testID={testID}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <XStack alignItems="center" gap={space[3]} paddingHorizontal={space[4]} paddingTop={insets.top + space[2]} paddingBottom={space[3]} minHeight={insets.top + space[2] + 44 + space[3]}>
                    {onBack ? <RoundButton kind={backKind} onPress={onBack} label={backLabel} testID="auth-back" /> : null}
                    <YStack flex={1}>{headerRight}</YStack>
                </XStack>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4], gap: space[5], flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {children}
                </ScrollView>
                {footer ? (
                    <YStack paddingHorizontal={space[4]} paddingTop={space[3]} paddingBottom={Math.max(insets.bottom, space[4]) + space[2]} gap={space[2]}>
                        {footer}
                    </YStack>
                ) : null}
            </KeyboardAvoidingView>
        </YStack>
    );
}

export default AuthScaffold;

/** A plain text control inside a field: "Show", "Hide". */
export function FieldAction({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) {
    return (
        <YStack height={44} paddingHorizontal={space[3]} alignItems="center" justifyContent="center" onPress={onPress} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" accessibilityLabel={label} testID={testID}>
            <Body fontSize={14} fontWeight="700" tone="brand" numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}
