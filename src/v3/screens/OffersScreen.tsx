/**
 * Ad-hoc offers — R2 D1.
 *
 * An order flagged `adhoc` with no driver is offered to drivers nearby: to
 * everyone at once, or to one driver at a time with a countdown. The server
 * only lists orders this driver can take, so this screen is a race and is
 * built like one.
 *
 * The offers are shown as the deck over its map (`OfferDeck`), the same view
 * that rises when an offer arrives. This screen is that deck under a title bar:
 * its loading, failure and empty states are here, the cards, the map and the
 * answering are the deck's. While it is in front the incoming overlay does not
 * rise over it; a new offer joins the back of this deck instead.
 *
 * **Nothing is hidden optimistically.** The server decides who got a job. A
 * lost race is reported in the server's own terms rather than as a failure,
 * because losing is a normal outcome here and not an error.
 *
 * **Offers arrive without asking.** `order.ping` on the driver's channel bumps
 * the live-refresh signal, so a new offer appears while this screen is open.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapButton } from './orderDetail/OrderSheetParts';
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useOffers } from '../data/useOffers';
import { OfferDeck } from '../offers/OfferDeck';
import { noteOffersScreenOpen } from '../offers/offerModel';

export function OffersScreen({ driverId, onOpenOrder, onBack }: { driverId?: string; onOpenOrder?: (orderId: string) => void; /** The way back; the screen has no title bar of its own. */ onBack?: () => void }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const title = t('nav.offers');
    // With no deck to show (loading, failed, none open) the same back button and name sit at the top of a plain page.
    const plainHeader = (
        <XStack alignItems="center" gap={10} paddingTop={insets.top} paddingBottom={space[3]}>
            {onBack ? <MapButton icon="back" label={t('common.back', { defaultValue: 'Back' })} onPress={onBack} testID="offers-back" /> : null}
            <Body fontSize={20} lineHeight={26} fontWeight="800" accessibilityRole="header">
                {title}
            </Body>
        </XStack>
    );
    const { isOnline } = useSync();
    const { offers, isLoading, error, reload } = useOffers(driverId);

    /*
     * In front or not. Read from the navigator when there is one (the screen is
     * also drawn on its own, in a slot or a test, and is then simply in front).
     * Under an order opened from here the screen is still mounted but not in
     * front, and an offer that arrives then must rise as usual.
     */
    const navigation = useContext(NavigationContext);
    const [focused, setFocused] = useState(() => navigation?.isFocused?.() ?? true);
    useEffect(() => {
        if (!navigation) return undefined;
        const onFocus = navigation.addListener('focus', () => setFocused(true));
        const onBlur = navigation.addListener('blur', () => setFocused(false));
        return () => {
            onFocus();
            onBlur();
        };
    }, [navigation]);
    useEffect(() => (focused ? noteOffersScreenOpen() : undefined), [focused]);

    if (isLoading && !offers) {
        return (
            <YStack flex={1} backgroundColor="$background" paddingHorizontal={space[4]} gap={space[3]} testID="offers-loading">
                {plainHeader}
                <Skeleton height={120} />
                <Skeleton height={120} />
            </YStack>
        );
    }

    if (!offers) {
        return (
            <YStack flex={1} backgroundColor="$background" paddingHorizontal={space[4]} testID="offers-error">
                {plainHeader}
                <YStack flex={1} justifyContent="center">
                <FailureState error={error as never} isOnline={isOnline} onRetry={reload} t={t} testID="offers-error" />
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$mapBackground">
            <OfferDeck
                mode="screen"
                onBack={onBack}
                title={title}
                driverId={driverId}
                offers={offers}
                reload={reload}
                onAccepted={(orderId) => onOpenOrder?.(orderId)}
                emptyState={
                    <YStack flex={1} backgroundColor="$background" paddingHorizontal={space[4]} gap={space[4]} testID="offers-screen">
                        {plainHeader}
                        <EmptyState testID="offers-empty" title={t('offers.emptyTitle')} body={t('offers.emptyBody')} />
                        <Secondary fontSize={13}>{t('offers.note')}</Secondary>
                    </YStack>
                }
            />
        </YStack>
    );
}

export default OffersScreen;
