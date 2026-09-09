/**
 * Complete stop — R2 frame C4, the review before the irreversible confirm.
 *
 * A manifest stop and the order at it are two records with two lifecycles.
 * Proof — scans, photos, signature — belongs to the *order*, is declared by
 * its config, and is captured from the order screen, which already runs that
 * flow. This screen is the manifest's half: the last look before the stop is
 * marked done, and the place where the two are reconciled.
 *
 * "Blocked" is therefore a real state: the order at this stop requires proof
 * and has not finished. Completing the stop anyway would leave a manifest
 * saying done over an order saying otherwise, so the button says blocked and
 * the way through is the order. A stop with no order, or whose order asks
 * for no proof, is not gated at all.
 *
 * The frame lists the captured proofs themselves. Those are readable from
 * the order's tracking statuses and files, and folding that in here is a
 * follow-up once C5 (proof of delivery record) is built — it is the same read.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import {
    useManifest,
    useStopUpdate,
    useOrderRecord,
    isOrderFinished,
    coordsOfStop,
    formatLatLng,
    isStopDone,
    podRequiredOf,
    currentManifestStop,
} from '../data';
import { formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface StopExecutionScreenProps {
    manifestId: string;
    stopId: string;
    onOpenOrder?: (orderId: string) => void;
    onNavigate?: (destination: { latitude: number; longitude: number; label?: string }) => void;
    /** Back to the route once the stop is done. */
    onDone?: () => void;
    /** Injected in tests so the recorded time is stable. */
    now?: () => Date;
}

export function StopExecutionScreen({ manifestId, stopId, onOpenOrder, onNavigate, onDone, now = () => new Date() }: StopExecutionScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { stops, isLoading, failed, error, retry } = useManifest(manifestId);
    const { update, isSaving } = useStopUpdate(manifestId);

    const stop = useMemo(() => stops.find((s) => s.id === stopId), [stops, stopId]);
    const { order, isLoading: orderLoading } = useOrderRecord(stop?.order?.id);

    const [outcome, setOutcome] = useState<'queued' | 'sent' | 'failed' | null>(null);
    const [recordedAt] = useState(() => now());

    const orderFinished = isOrderFinished(order);
    const blocked = Boolean(stop?.order?.id) && podRequiredOf(order) && !orderFinished;
    const completed = outcome === 'queued' || outcome === 'sent';

    // The next stop, once this one is done — for the hand-off card.
    const next = useMemo(() => (completed ? currentManifestStop(stops.filter((s) => s.id !== stopId)) : undefined), [completed, stops, stopId]);
    const nextPoint = coordsOfStop(next);

    const complete = useCallback(async () => {
        if (!stop || blocked) return;
        const result = await update(stop, {
            status: 'completed',
            meta: { completion_position: toGeoPoint(position), completed_at_device: recordedAt.toISOString() },
        });
        setOutcome(result);
    }, [blocked, position, recordedAt, stop, update]);

    if (isLoading && !stop) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="execution-loading">
                <Skeleton height={120} />
                <Skeleton height={120} />
            </YStack>
        );
    }

    if (!stop) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="execution-error" />
            </YStack>
        );
    }

    if (completed || isStopDone(stop)) {
        return (
            <YStack flex={1} backgroundColor="$background" testID="execution-done">
                <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }}>
                    {outcome === 'queued' ? <Banner tone="neutral" message={t('stopExecution.queued')} testID="execution-queued" /> : null}
                    <Surface hero padded>
                        <YStack gap={space[2]}>
                            <Micro tone="success">✓</Micro>
                            <Heading fontSize={22}>{t('stopExecution.doneTitle', { sequence: stop.sequence })}</Heading>
                            {next ? (
                                <Secondary>{t('stopExecution.nextStop', { sequence: next.sequence, name: next.place?.name ?? next.place?.address ?? '' })}</Secondary>
                            ) : (
                                <Secondary>{t('stopExecution.routeDone')}</Secondary>
                            )}
                        </YStack>
                    </Surface>
                </ScrollView>
                <YStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface">
                    {next && nextPoint && onNavigate ? (
                        <Button onPress={() => onNavigate({ ...nextPoint, label: next.place?.name ?? next.place?.address ?? undefined })} testID="execution-navigate-next">
                            {t('stopExecution.navigateNext', { sequence: next.sequence })}
                        </Button>
                    ) : null}
                    <Button variant={next && nextPoint && onNavigate ? 'secondary' : 'primary'} onPress={onDone} testID="execution-back">
                        {t('stopExecution.backToRoute')}
                    </Button>
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="stop-execution">
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}>
                <YStack gap={space[2]}>
                    <Heading fontSize={20}>{t('stopExecution.title')}</Heading>
                    <Identifier
                        value={`${stop.order?.tracking_number ?? stop.id} · ${t('stopExecution.stopRef', { sequence: stop.sequence })}`}
                        boxed={false}
                        testID="execution-ref"
                    />
                </YStack>

                {blocked ? (
                    <Surface padded testID="execution-blocked" borderColor="$dangerBorder" backgroundColor="$dangerFill">
                        <YStack gap={space[1]}>
                            <Body fontWeight="700" tone="danger">
                                {t('stopExecution.blockedTitle')}
                            </Body>
                            <Secondary fontSize={13}>{t('stopExecution.blockedBody')}</Secondary>
                        </YStack>
                    </Surface>
                ) : null}

                {outcome === 'failed' ? <Banner tone="danger" message={t('stopExecution.failed')} testID="execution-failed" /> : null}

                {stop.order?.id ? (
                    <Surface testID="execution-order">
                        <YStack padding={space[4]} gap={space[2]}>
                            <XStack justifyContent="space-between" alignItems="center">
                                <Caption>{t('stopExecution.orderTitle')}</Caption>
                                {orderLoading && !order ? <Skeleton height={20} width={80} /> : <StatusPill status={order?.status ?? stop.order.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />}
                            </XStack>
                            {stop.order.tracking_number ? <Identifier value={stop.order.tracking_number} boxed={false} /> : null}
                            <Secondary fontSize={13} testID={orderFinished ? 'execution-order-done' : 'execution-order-open'}>
                                {orderFinished ? t('stopExecution.orderDone') : t('stopExecution.orderOpen')}
                            </Secondary>
                        </YStack>
                        {onOpenOrder ? (
                            <>
                                <Divider />
                                <YStack padding={space[3]}>
                                    <Button variant={blocked ? 'primary' : 'ghost'} onPress={() => onOpenOrder(stop.order!.id!)} testID="execution-open-order">
                                        {t('stopExecution.openOrder')}
                                    </Button>
                                </YStack>
                            </>
                        ) : null}
                    </Surface>
                ) : (
                    <Banner tone="neutral" message={t('stopExecution.noOrder')} testID="execution-no-order" />
                )}

                <Surface padded="compact" testID="execution-recorded">
                    <YStack gap={space[2]}>
                        <Micro fontSize={10}>{t('stopExecution.recordedAt')}</Micro>
                        <XStack gap={space[4]}>
                            <YStack flex={1} gap={2}>
                                <Micro fontSize={10}>{t('stopExecution.gps')}</Micro>
                                <Identifier value={formatLatLng(position) ?? t('stopExecution.positionUnknown')} boxed={false} testID="execution-gps" />
                            </YStack>
                            <YStack gap={2}>
                                <Micro fontSize={10}>{t('stopExecution.time')}</Micro>
                                <Body fontSize={14} fontWeight="700" tabular>
                                    {formatClock(recordedAt.toISOString())}
                                </Body>
                            </YStack>
                        </XStack>
                    </YStack>
                </Surface>

                <Secondary fontSize={12}>{t('stopExecution.final')}</Secondary>
            </ScrollView>

            <YStack padding={space[4]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="execution-actions">
                <Button onPress={() => void complete()} disabled={blocked} loading={isSaving} testID="execution-complete">
                    {blocked ? t('stopExecution.completeBlocked') : t('stopExecution.complete')}
                </Button>
            </YStack>
        </YStack>
    );
}

export default StopExecutionScreen;
