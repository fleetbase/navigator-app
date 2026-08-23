/**
 * Which stop am I heading to — R2 D2, "edit destination".
 *
 * Not free-text destination entry: the endpoint only accepts stops that are
 * already in the order's payload, and rightly so. A driver diverting to an
 * address dispatch has never heard of is a dispatch conversation, not a field
 * on a form. What this screen does is let a driver say *which of this order's
 * own stops* they are going to next — the case that comes up when a delivery
 * has to be skipped and returned to, or when the planned order does not survive
 * contact with a one-way system.
 *
 * Completed stops are shown but not selectable. They are still useful context
 * — a driver checking what they have already done — and re-heading to a
 * finished stop is not something the app should quietly allow.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useSync } from '../shell';
import { useTracker } from '../data/useTracker';
import { useSetDestination } from '../data/useSetDestination';
import { orderStops, currentDestination, stopLabel, type OrderStop } from '../data/orderStops';
import { orderStore } from '../data/orderStore';
import { payloadOf } from '../data/accessors';

export function DestinationScreen({ orderId, onDone }: { orderId: string; onDone?: () => void }) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const [reloadToken, setReloadToken] = useState(0);
    const { tracker, state, error, retry } = useTracker(orderId, reloadToken);
    const { setDestination, isSaving, error: saveError } = useSetDestination(orderId);
    const [queued, setQueued] = useState(false);

    /*
     * The stops and the current one come from the **payload**, which is where
     * `set-destination` writes and where all three order shapes — pickup +
     * dropoff, pickup + waypoints + dropoff, and waypoints only — are described
     * in one list. The tracker is used only to mark what is already done, so
     * the picker still works when the tracker has not loaded.
     */
    const payload = payloadOf(orderStore.get(orderId));
    const stops = orderStops(payload);
    const current = currentDestination(payload);
    const currentKey = current?.id;

    /** Place ids the server considers complete, if the tracker answered. */
    const completed = new Set(
        (tracker?.stops ?? []).filter((s) => s.completed).flatMap((s) => [s.uuid, s.public_id].filter(Boolean) as string[])
    );

    const choose = useCallback(
        async (stop: OrderStop) => {
            const key = stop.id;
            if (!key) return;
            const outcome = await setDestination(key);
            if (outcome === 'queued') {
                /*
                 * Deliberately not reflected optimistically. Everything else on
                 * this screen is the server's own computation over the payload
                 * — which stop is active, what is complete, the sequence — and
                 * rewriting one field of it locally would produce a view that
                 * is neither what the driver chose nor what dispatch sees. The
                 * honest thing is to say it is saved and will apply.
                 */
                setQueued(true);
                return;
            }
            if (outcome === 'set') {
                // Refetch rather than patch: the server recomputes the whole
                // tracker off the new current stop, including the ETA.
                setReloadToken((n) => n + 1);
                onDone?.();
            }
        },
        [onDone, setDestination]
    );

    if (state === 'loading' && !stops.length) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="destination-loading">
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
            </YStack>
        );
    }

    if (state === 'error' && !stops.length) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="destination-error">
                <FailureState error={error as never} isOnline={isOnline} onRetry={retry} t={t} testID="destination-error" />
            </YStack>
        );
    }

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="destination-screen">
            {queued ? <Banner tone="neutral" message={t('destination.queued')} testID="destination-queued" /> : null}
            {saveError ? <Banner tone="danger" message={t('destination.failed')} testID="destination-failed" /> : null}

            {stops.length ? (
                <Surface testID="destination-stops">
                    {stops.map((stop, i) => {
                        const key = stop.id ?? String(i);
                        const isCurrent = !!currentKey && key === currentKey;
                        const done = completed.has(key);
                        const selectable = !done && !isCurrent && !isSaving;

                        return (
                            <YStack key={key}>
                                {i > 0 ? <Divider /> : null}
                                <XStack
                                    padding={space[3]}
                                    gap={space[3]}
                                    alignItems="center"
                                    opacity={done ? 0.55 : 1}
                                    onPress={selectable ? () => void choose(stop) : undefined}
                                    pressStyle={selectable ? { opacity: 0.7 } : undefined}
                                    accessibilityRole={selectable ? 'button' : 'text'}
                                    accessibilityState={{ selected: isCurrent, disabled: !selectable }}
                                    testID={`destination-stop-${key}`}
                                >
                                    <YStack flex={1} gap={2} minWidth={0}>
                                        <Body fontSize={15} fontWeight={isCurrent ? '800' : '600'} numberOfLines={2}>
                                            {stopLabel(stop) ?? t('destination.unnamed')}
                                        </Body>
                                        <Micro>{t(`destination.type.${stop.type}`, { defaultValue: stop.type })}</Micro>
                                    </YStack>

                                    {isCurrent ? (
                                        <Micro tone="brand" testID={`destination-current-${key}`}>
                                            {t('destination.current')}
                                        </Micro>
                                    ) : done ? (
                                        <Micro tone="success" testID={`destination-done-${key}`}>
                                            {t('destination.done')}
                                        </Micro>
                                    ) : (
                                        <Secondary fontSize={17}>›</Secondary>
                                    )}
                                </XStack>
                            </YStack>
                        );
                    })}
                </Surface>
            ) : (
                <EmptyState testID="destination-empty" title={t('destination.emptyTitle')} body={t('destination.emptyBody')} />
            )}

            <Micro>{t('destination.note')}</Micro>
        </ScrollView>
    );
}

export default DestinationScreen;
