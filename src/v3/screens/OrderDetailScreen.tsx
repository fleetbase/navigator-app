/**
 * Order detail — R1 frame s06, with correction 1 applied.
 *
 * The frame draws a fixed four-step stepper; the real flow comes from
 * `order-configs` and varies per organisation, so the stepper here renders
 * whatever length the config declares (see ui/ActivityStepper).
 *
 * The activity advance is a mutation, so it goes through the adapter and
 * queues when offline — a driver marking "arrived" in a basement keeps the
 * progress and the app says so rather than failing.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, HeroValue, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, ErrorState, Skeleton } from '../ui/Banner';
import { ActivityStepper, ProofRequiredHint, nextActivity, type FlowActivity } from '../ui/ActivityStepper';
import { space } from '../theme/tokens';
import { describeStatus } from '../theme/status';
import { useTranslation } from '../i18n/useTranslation';
import { useOrder, useOrderConfig, orderStore, displayIdOf, entityTrackingNumberOf, orderConfigIdOf, payloadOf } from '../data';
import { useFleetbase, isQueuedAck } from '../api';
import { useSync } from '../shell';
import { useSettings } from '../settings';
import { formatClock, formatMeters } from '../format';

export function OrderDetailScreen({
    orderId,
    onEditEntity,
}: {
    orderId: string;
    onEditEntity?: (entity: { id: string; name?: string }) => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const { adapter } = useFleetbase();

    const order = useOrder(orderId);
    const configId = orderConfigIdOf(order);
    const { flow, failed: configFailed } = useOrderConfig(configId);

    const [isAdvancing, setIsAdvancing] = useState(false);
    const [queued, setQueued] = useState(false);
    const [advanceError, setAdvanceError] = useState<string | null>(null);

    /** Registry wording wins over the config's own label. */
    const labelFor = useCallback(
        (activity: FlowActivity) => {
            const d = describeStatus(activity.code);
            return t(d.labelKey, { defaultValue: activity.status ?? d.defaultLabel });
        },
        [t]
    );

    const next = useMemo(() => nextActivity(flow, order?.status), [flow, order?.status]);

    const advance = useCallback(async () => {
        if (!next || !order) return;
        setIsAdvancing(true);
        setAdvanceError(null);
        try {
            const result = await adapter.post(`orders/${order.id}/update-activity`, { activity: next.code });
            if (isQueuedAck(result)) {
                // Optimistic: reflect the new status locally so the driver can
                // carry on. The queue replays it with the original key.
                orderStore.upsert({ id: order.id, status: next.code });
                setQueued(true);
            } else {
                const data = (result as { data?: unknown })?.data ?? result;
                orderStore.upsert({ ...(data as object), id: order.id } as never);
            }
        } catch (err) {
            setAdvanceError((err as Error).message);
        } finally {
            setIsAdvancing(false);
        }
    }, [adapter, next, order]);

    if (!order) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="order-detail-loading">
                <Skeleton height={96} />
                <Skeleton height={180} />
            </YStack>
        );
    }

    const payload = payloadOf(order);
    const entities = payload.entities ?? [];
    const destination = payload.dropoff?.name ?? payload.dropoff?.address;
    const tracker = order.tracker_data as { eta_seconds?: number; distance_m?: number } | undefined;

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="order-detail">
            {/* The identifier leads, in full, on its own line. */}
            <Surface hero padded>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Caption>{t('orderDetail.trackingNumberLabel')}</Caption>
                        <StatusPill status={order.status} t={(k, fb) => t(k, { defaultValue: fb })} />
                    </XStack>
                    <Identifier value={displayIdOf(order)} boxed={false} />
                    <Micro>
                        {order.dispatched_at
                            ? t('orderDetail.createdDispatched', {
                                  created: formatClock(order.created_at),
                                  dispatched: formatClock(order.dispatched_at),
                              })
                            : t('orderDetail.created', { created: formatClock(order.created_at) })}
                    </Micro>
                </YStack>
            </Surface>

            {tracker?.eta_seconds || tracker?.distance_m ? (
                <XStack gap={space[4]}>
                    {tracker?.eta_seconds ? (
                        <YStack flex={1}>
                            <HeroValue fontSize={34}>{formatClock(new Date(Date.now() + tracker.eta_seconds * 1000).toISOString())}</HeroValue>
                            <Caption>{t('orderDetail.etaLabel')}</Caption>
                        </YStack>
                    ) : null}
                    {tracker?.distance_m ? (
                        <YStack flex={1}>
                            <HeroValue fontSize={34}>{formatMeters(tracker.distance_m, units)}</HeroValue>
                            <Caption>{t('orderDetail.remainingLabel')}</Caption>
                        </YStack>
                    ) : null}
                </XStack>
            ) : null}

            {destination ? (
                <Surface padded="compact">
                    <Caption>{t('orderDetail.currentDestination')}</Caption>
                    <Body fontWeight="700">{destination}</Body>
                </Surface>
            ) : null}

            <YStack gap={space[2]}>
                <XStack justifyContent="space-between" alignItems="baseline">
                    <Heading fontSize={17}>{t('orderDetail.payloadHeading')}</Heading>
                    <Micro>{t('orderDetail.payloadCount', { count: entities.length })}</Micro>
                </XStack>
                <Surface>
                    {entities.length ? (
                        entities.map((raw, i) => {
                            const e = raw as Record<string, unknown> & { id?: string; name?: string };
                            const entityId = entityTrackingNumberOf(e);
                            return (
                                <YStack key={e.id ?? i}>
                                    {i > 0 ? <Divider /> : null}
                                    <YStack
                                        padding={space[3]}
                                        gap={space[1]}
                                        testID={`entity-${e.id ?? i}`}
                                        onPress={onEditEntity && e.id ? () => onEditEntity({ id: e.id!, name: e.name }) : undefined}
                                        pressStyle={onEditEntity ? { opacity: 0.7 } : undefined}
                                    >
                                        <Body fontSize={14} fontWeight="600">
                                            {String(e.name ?? '')}
                                        </Body>
                                        {entityId ? <Identifier value={entityId} boxed={false} /> : null}
                                    </YStack>
                                </YStack>
                            );
                        })
                    ) : (
                        <YStack padding={space[3]}>
                            <Secondary>{t('orderDetail.payloadCount', { count: 0 })}</Secondary>
                        </YStack>
                    )}
                </Surface>
            </YStack>

            <YStack gap={space[2]}>
                <Heading fontSize={17}>{t('orderDetail.notesHeading')}</Heading>
                <Surface padded="compact">
                    <Secondary>{(order.notes as string) || t('orderDetail.noNotes')}</Secondary>
                </Surface>
            </YStack>

            {/* Progress + the one action. Config-driven, any length. */}
            <YStack gap={space[3]}>
                {flow.length ? (
                    <ActivityStepper flow={flow} currentCode={order.status} labelFor={labelFor} testID="order-stepper" />
                ) : configFailed ? (
                    <Banner tone="neutral" message={t('orderDetail.flowUnavailable')} testID="flow-unavailable" />
                ) : null}

                {next?.require_pod ? <ProofRequiredHint label={t('orderDetail.proofRequired')} testID="proof-required" /> : null}

                {queued ? <Banner tone="neutral" message={t('orderDetail.queuedOffline')} testID="advance-queued" /> : null}
                {!isOnline && !queued ? <Banner tone="neutral" message={t('common.offline')} testID="detail-offline" /> : null}
                {advanceError ? (
                    <ErrorState title={t('orderDetail.updateFailed')} body={advanceError} testID="advance-error" />
                ) : null}

                {next ? (
                    <Button
                        fullWidth
                        elevated
                        loading={isAdvancing}
                        onPress={advance}
                        testID="advance-activity"
                    >
                        {t('orderDetail.advanceTo', { activity: labelFor(next) })}
                    </Button>
                ) : flow.length ? (
                    <Banner tone="success" message={t('orderDetail.terminalReached')} testID="order-terminal" />
                ) : null}
            </YStack>
        </ScrollView>
    );
}

export default OrderDetailScreen;
