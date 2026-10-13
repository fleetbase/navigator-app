/**
 * A direct offer — an order put in this driver's name, waiting for a yes or no
 * before `meta.offer.expires_at` (contract 1.4).
 *
 * Shown wherever the driver might meet the order: Today, the Offers screen and
 * the order itself. The countdown runs locally from `expires_at`; the server
 * expires the offer on its own schedule and says so with `order.offer_expired`,
 * which refetches the order and replaces this card.
 */
import { useCallback, useState } from 'react';
import { YStack } from 'tamagui';
import { OfferCard } from '../../ui/Cards';
import { Banner } from '../../ui/Banner';
import { space } from '../../theme/tokens';
import { useTranslation } from '../../i18n/useTranslation';
import { useSettings } from '../../settings';
import { displayIdOf, payloadOf, offerOf, type OrderRecord } from '../../data';
import { useRespondToOffer, useCountdown, formatCountdown, type OfferAnswer } from '../../data/useOffers';

export function DirectOfferCard({
    order,
    onAccepted,
    onDeclined,
    onOpen,
    testID,
}: {
    order: OrderRecord;
    onAccepted?: (orderId: string) => void;
    onDeclined?: (orderId: string) => void;
    /** Shows a "Details" button; omitted on the order's own screen. */
    onOpen?: (orderId: string) => void;
    testID?: string;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const offer = offerOf(order);
    const seconds = useCountdown(offer?.expires_at);
    const { accept, decline, isAccepting, isDeclining } = useRespondToOffer();
    const [outcome, setOutcome] = useState<OfferAnswer | null>(null);

    const payload = payloadOf(order);
    const pickup = payload.pickup?.name ?? payload.pickup?.address;
    const dropoff = payload.dropoff?.name ?? payload.dropoff?.address;
    const expired = outcome === 'expired' || seconds === 0;
    const id = testID ?? `direct-offer-${order.id}`;

    const answer = useCallback(
        async (kind: 'accept' | 'decline') => {
            setOutcome(null);
            const result = kind === 'accept' ? await accept(order.id) : await decline(order.id);
            setOutcome(result);
            if (result === 'accepted') onAccepted?.(order.id);
            if (result === 'declined') onDeclined?.(order.id);
        },
        [accept, decline, onAccepted, onDeclined, order.id]
    );

    return (
        <YStack gap={space[2]}>
            <OfferCard
                testID={id}
                direct
                trackingNumber={displayIdOf(order)}
                pickup={pickup ? String(pickup) : undefined}
                dropoff={dropoff ? String(dropoff) : undefined}
                expiresIn={formatCountdown(seconds)}
                expired={expired}
                units={units}
                accepting={isAccepting}
                declining={isDeclining}
                onAccept={() => void answer('accept')}
                onDecline={() => void answer('decline')}
                onView={onOpen ? () => onOpen(order.id) : undefined}
            />
            {outcome === 'unsupported' ? (
                <Banner tone="warning" message={t('offers.unsupported')} testID={`${id}-unsupported`} />
            ) : outcome === 'expired' ? (
                <Banner tone="neutral" message={t('offers.expired')} testID={`${id}-expired-notice`} />
            ) : outcome === 'failed' ? (
                <Banner tone="danger" message={t('offers.answerFailed')} testID={`${id}-failed`} />
            ) : null}
        </YStack>
    );
}

export default DirectOfferCard;
