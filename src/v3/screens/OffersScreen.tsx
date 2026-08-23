/**
 * Ad-hoc offers — R2 D1.
 *
 * An order flagged `adhoc` with no driver is offered to everyone nearby at
 * once, so this screen is a race and is built like one.
 *
 * **Nothing is hidden optimistically.** Tapping accept does not remove the card
 * or grey the others; the server decides who got it, and pretending otherwise
 * would show a driver a job they do not have. A lost race is reported in the
 * server's own terms — the order has already started — rather than as a
 * failure, because losing is a normal outcome here and not an error.
 *
 * **Offers arrive without asking.** `order.ping` on the driver's channel bumps
 * the live-refresh signal, so a new offer appears while this screen is open.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useSync } from '../shell';
import { useSettings } from '../settings';
import { useOffers, useAcceptOffer } from '../data/useOffers';
import { trackingNumberOf, payloadOf } from '../data/accessors';
import { currentDestination, stopLabel } from '../data/orderStops';
import { formatMeters } from '../format';
import type { OrderRecord } from '../data/orderStore';

export function OffersScreen({ driverId, onOpenOrder }: { driverId?: string; onOpenOrder?: (orderId: string) => void }) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { units } = useSettings();
    const { offers, isLoading, error, reload } = useOffers(driverId);
    const { accept, isAccepting } = useAcceptOffer(driverId);
    const [taken, setTaken] = useState<string | null>(null);

    const take = useCallback(
        async (order: OrderRecord) => {
            const outcome = await accept(order.id);
            if (outcome === 'accepted') {
                onOpenOrder?.(order.id);
                return;
            }
            // 'taken' and 'failed' both leave the list alone and say why.
            setTaken(outcome === 'taken' ? order.id : null);
            void reload();
        },
        [accept, onOpenOrder, reload]
    );

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
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="offers-screen">
            {taken ? <Banner tone="neutral" message={t('offers.taken')} testID="offer-taken" /> : null}

            {offers.length ? (
                offers.map((order) => {
                    const payload = payloadOf(order);
                    const destination = stopLabel(currentDestination(payload));
                    const distance = (order as { adhoc_distance?: number }).adhoc_distance;

                    return (
                        <Surface key={order.id} padded testID={`offer-${order.id}`}>
                            <YStack gap={space[2]}>
                                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                                    <Caption>{t('offers.available')}</Caption>
                                    {typeof distance === 'number' ? (
                                        <Micro tabular testID={`offer-distance-${order.id}`}>
                                            {formatMeters(distance, units)}
                                        </Micro>
                                    ) : null}
                                </XStack>

                                {destination ? (
                                    <Body fontSize={17} fontWeight="800" numberOfLines={2}>
                                        {destination}
                                    </Body>
                                ) : null}

                                <Identifier value={trackingNumberOf(order) ?? order.id} boxed={false} />

                                <Divider />

                                <XStack gap={space[2]}>
                                    <Button
                                        flex={1}
                                        variant="ghost"
                                        onPress={onOpenOrder ? () => onOpenOrder(order.id) : undefined}
                                        testID={`offer-view-${order.id}`}
                                    >
                                        {t('offers.view')}
                                    </Button>
                                    <Button flex={1} loading={isAccepting} onPress={() => void take(order)} testID={`offer-accept-${order.id}`}>
                                        {t('offers.accept')}
                                    </Button>
                                </XStack>
                            </YStack>
                        </Surface>
                    );
                })
            ) : (
                <EmptyState testID="offers-empty" title={t('offers.emptyTitle')} body={t('offers.emptyBody')} />
            )}

            <Secondary fontSize={13}>{t('offers.note')}</Secondary>
        </ScrollView>
    );
}

export default OffersScreen;
