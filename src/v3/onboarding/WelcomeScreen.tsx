/**
 * The opening screen — design round 3 frame s20. What a driver sees before they
 * sign in: the build's brand, a route drawing itself, and one tap to sign in.
 *
 * It is not a login form with a logo above it. Linking to another server lives
 * here too, as the quiet second action, because it has to happen before sign-in.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Display, Secondary } from '../ui/Text';
import { BrandLogo } from '../branding/BrandLogo';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { displayHost } from '../connection/instanceLink';
import { BigButton, LinkButton } from './AuthScaffold';
import { RouteAnimation } from './RouteAnimation';

export interface WelcomeScreenProps {
    onSignIn: () => void;
    /** Opens linking to another server. Omit to hide the option. */
    onLink?: () => void;
    /** Set when the app is linked to a server other than the build's own. */
    linkedHost?: string;
    organizationName?: string;
}

export function WelcomeScreen({ onSignIn, onLink, linkedHost, organizationName }: WelcomeScreenProps) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const rise = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(rise, { toValue: 1, duration: 520, delay: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, [rise]);

    return (
        <YStack flex={1} backgroundColor="$background" testID="welcome-screen">
            <YStack flex={1} overflow="hidden">
                <RouteAnimation height={520} />
            </YStack>

            <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
                <YStack paddingHorizontal={space[4]} paddingBottom={Math.max(insets.bottom, space[4]) + space[2]} gap={space[5]}>
                    <YStack gap={space[3]}>
                        <BrandLogo height={36} maxWidth={180} />
                        <Display fontSize={38} lineHeight={42} fontWeight="800" letterSpacing={-0.9} testID="welcome-title">
                            {t('welcome.title')}
                        </Display>
                        <Secondary fontSize={17} lineHeight={25}>
                            {organizationName && organizationName !== 'Navigator' ? t('welcome.bodyWithOrg', { organization: organizationName }) : t('welcome.body')}
                        </Secondary>
                    </YStack>

                    <YStack gap={space[2]}>
                        {linkedHost ? (
                            <XStack alignItems="center" gap={space[2]} height={36} paddingHorizontal={space[3]} borderRadius={18} backgroundColor="$surface" borderWidth={1} borderColor="$border" alignSelf="flex-start" testID="welcome-linked">
                                <YStack width={8} height={8} borderRadius={4} backgroundColor="$successText" />
                                <Caption fontSize={13} fontWeight="700" color="$textSecondary" numberOfLines={1}>
                                    {t('welcome.connectedTo', { host: displayHost(linkedHost) })}
                                </Caption>
                            </XStack>
                        ) : null}
                        <BigButton onPress={onSignIn} testID="welcome-sign-in">
                            <Body fontSize={18} fontWeight="800" tone="onPrimary">
                                {t('welcome.signIn')}
                            </Body>
                        </BigButton>
                        {onLink ? (
                            <LinkButton onPress={onLink} testID="welcome-link">
                                {linkedHost ? t('welcome.changeServer') : t('welcome.link')}
                            </LinkButton>
                        ) : null}
                    </YStack>
                </YStack>
            </Animated.View>
        </YStack>
    );
}

export default WelcomeScreen;
