/**
 * The opening screen — design round 3 frame s20. What a driver sees before they
 * sign in: the build's brand over a route that draws itself, what the app is
 * for, and the two ways forward.
 *
 * The map is the background and the words sit on top of it, anchored to the
 * bottom of the screen, so nothing depends on the map's height to be visible.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Display, Secondary } from '../ui/Text';
import { brandLogoSource, BrandLogo } from '../branding/BrandLogo';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { displayHost } from '../connection/instanceLink';
import { BigButton } from './AuthScaffold';
import { RouteAnimation } from './RouteAnimation';

export interface WelcomeScreenProps {
    onSignIn: () => void;
    /** Starts joining as a new driver. Omit when the server does not offer it. */
    onGetStarted?: () => void;
    /** Opens linking to another server. Omit to hide the option. */
    onLink?: () => void;
    /** Set when the app is linked to a server other than the build's own. */
    linkedHost?: string;
    organizationName?: string;
    /** The app's name as the build brands it. */
    appName?: string;
}

/** Fades and lifts its children in after `delay`; shown at once when motion is reduced. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
    const value = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const animation = Animated.timing(value, { toValue: 1, duration: 500, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
        animation.start();
        // Whatever happens to the animation, the content must end up visible.
        const safety = setTimeout(() => value.setValue(1), delay + 900);
        return () => {
            animation.stop();
            clearTimeout(safety);
        };
    }, [value, delay]);
    return <Animated.View style={{ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>{children}</Animated.View>;
}

function Mark({ appName }: { appName: string }) {
    const hasLogo = brandLogoSource(true) !== null;
    if (hasLogo) return <BrandLogo height={40} maxWidth={200} />;
    return (
        <XStack alignItems="center" gap={10} testID="welcome-mark">
            <YStack width={40} height={40} borderRadius={12} backgroundColor="$primary" alignItems="center" justifyContent="center">
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
                    <Path d="M12 2l8 19-8-4-8 4z" />
                </Svg>
            </YStack>
            <Caption fontFamily="$mono" fontSize={11} letterSpacing={1.1} color="$textSecondary">
                {appName.toUpperCase()}
            </Caption>
        </XStack>
    );
}

function QrGlyph({ color }: { color: string }) {
    return (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Rect x={3} y={3} width={7} height={7} rx={1.5} />
            <Rect x={14} y={3} width={7} height={7} rx={1.5} />
            <Rect x={3} y={14} width={7} height={7} rx={1.5} />
            <Path d="M14 14h3v3M21 14v7h-7" />
        </Svg>
    );
}

export function WelcomeScreen({ onSignIn, onGetStarted, onLink, linkedHost, organizationName, appName = 'Fleetbase Navigator' }: WelcomeScreenProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const named = organizationName && organizationName !== 'Navigator' ? organizationName : undefined;

    return (
        <View style={[styles.root, { backgroundColor: theme.background?.val as string }]} testID="welcome-screen">
            <View style={styles.map}>
                <RouteAnimation width={width} />
            </View>

            <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, space[4]) + space[3] }]}>
                <Rise delay={500}>
                    <YStack gap={space[3]}>
                        <Mark appName={appName} />
                        <Display fontSize={33} lineHeight={37} fontWeight="800" letterSpacing={-0.7} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} testID="welcome-title">
                            {t('welcome.title')}
                        </Display>
                        <Secondary fontSize={16} lineHeight={24} testID="welcome-body">
                            {named ? t('welcome.bodyWithOrg', { organization: named }) : t('welcome.body')}
                        </Secondary>
                    </YStack>
                </Rise>

                <Rise delay={800}>
                    <YStack gap={10}>
                        {onGetStarted ? (
                            <>
                                <BigButton onPress={onGetStarted} testID="welcome-get-started">
                                    <Body fontSize={17} fontWeight="700" tone="onPrimary">
                                        {t('welcome.getStarted')}
                                    </Body>
                                </BigButton>
                                <BigButton variant="secondary" onPress={onSignIn} testID="welcome-sign-in">
                                    <Body fontSize={16} fontWeight="700" numberOfLines={1}>
                                        {t('welcome.alreadyDrive')}
                                    </Body>
                                </BigButton>
                            </>
                        ) : (
                            <BigButton onPress={onSignIn} testID="welcome-sign-in">
                                <Body fontSize={17} fontWeight="700" tone="onPrimary">
                                    {t('welcome.signIn')}
                                </Body>
                            </BigButton>
                        )}
                    </YStack>
                </Rise>

                {onLink ? (
                    <Rise delay={1000}>
                        <XStack alignItems="center" justifyContent="space-between" gap={space[3]}>
                            <XStack flex={1} alignItems="center" gap={space[2]}>
                                {linkedHost ? <YStack width={8} height={8} borderRadius={4} backgroundColor="$successText" /> : null}
                                <Secondary flex={1} fontSize={13} numberOfLines={2} testID={linkedHost ? 'welcome-linked' : 'welcome-link-hint'}>
                                    {linkedHost ? t('welcome.connectedTo', { host: displayHost(linkedHost) }) : t('welcome.ownServer')}
                                </Secondary>
                            </XStack>
                            <XStack alignItems="center" gap={space[2]} height={44} paddingHorizontal={14} borderRadius={12} borderWidth={1} borderColor="$border" onPress={onLink} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" testID="welcome-link">
                                <QrGlyph color={theme.textPrimary?.val as string} />
                                <Body fontSize={14} fontWeight="700" numberOfLines={1}>
                                    {linkedHost ? t('welcome.changeServer') : t('welcome.scan')}
                                </Body>
                            </XStack>
                        </XStack>
                    </Rise>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    map: { position: 'absolute', top: 0, left: 0, right: 0 },
    content: { position: 'absolute', left: space[4], right: space[4], bottom: 0, gap: 20 },
});

export default WelcomeScreen;
