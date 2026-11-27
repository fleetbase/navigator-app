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
import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';
import { YStack } from 'tamagui';
import { Secondary } from '../ui/Text';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useOffers } from '../data/useOffers';
import { OfferDeck } from '../offers/OfferDeck';
import { noteOffersScreenOpen } from '../offers/offerModel';

export function OffersScreen({ driverId, onOpenOrder }: { driverId?: string; onOpenOrder?: (orderId: string) => void }) {
    const { t } = useTranslation();
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
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="offers-loading">
                <Skeleton height={120} />
                <Skeleton height={120} />
            </YStack>
        );
    }

    if (!offers) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="offers-error">
                <FailureState error={error as never} isOnline={isOnline} onRetry={reload} t={t} testID="offers-error" />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$mapBackground">
            <OfferDeck
                mode="screen"
                driverId={driverId}
                offers={offers}
                reload={reload}
                onAccepted={(orderId) => onOpenOrder?.(orderId)}
                emptyState={
                    <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[4]} testID="offers-screen">
                        <EmptyState testID="offers-empty" title={t('offers.emptyTitle')} body={t('offers.emptyBody')} />
                        <Secondary fontSize={13}>{t('offers.note')}</Secondary>
                    </YStack>
                }
            />
        </YStack>
    );
}

export default OffersScreen;
