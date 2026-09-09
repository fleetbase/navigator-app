/**
 * Stop detail — R2 frame B2, with C6 (arrive out of geofence) folded in.
 *
 * The bridge between the route list and stop execution: everything about one
 * stop, and the one action its state calls for. Pending: navigate, or say
 * you have arrived. Arrived: complete, or skip. Done: read it.
 *
 * Arrival is checked against the stop's coordinate before it is sent. Inside
 * the radius it just happens. Outside it, the frame's sheet asks — and an
 * arrival confirmed from 340 m away is recorded *with* the position, so
 * dispatch sees the distance rather than a clean "arrived". With no fix the
 * arrival is marked position unknown, which is the honest record.
 *
 * What the frame draws that the API cannot supply: the time window (no field
 * on the stop), the masked phone number (correction 3 — no capability, so the
 * number is shown in full), and a copy affordance (no clipboard dependency in
 * the app yet; share covers the same need through the system sheet).
 */
import { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, Share } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Field } from '../ui/Field';
import { RouteMap } from '../ui/RouteMap';
import { ProofRequiredHint } from '../ui/ActivityStepper';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings, useResolvedScheme } from '../settings';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import {
    useManifest,
    useStopUpdate,
    useOrderRecord,
    checkArrival,
    coordsOfStop,
    formatLatLng,
    isStopDone,
    ARRIVAL_RADIUS_M,
    payloadOf,
    podRequiredOf,
    entityIdOf,
    entityNameOf,
    entityTrackingNumberOf,
    type ArrivalCheck,
    type ManifestStopRecord,
} from '../data';
import { formatClock, formatDuration, formatMeters } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface StopDetailScreenProps {
    manifestId: string;
    stopId: string;
    onNavigate?: (destination: { latitude: number; longitude: number; label?: string }) => void;
    onOpenOrder?: (orderId: string) => void;
    /** Opens the review-before-complete screen (R2 C4). */
    onComplete?: (manifestId: string, stopId: string) => void;
}

type Notice = { tone: 'neutral' | 'success' | 'danger'; key: string } | null;

function MetricCell({ label, value, hint, testID }: { label: string; value: string; hint?: string; testID?: string }) {
    return (
        <YStack flex={1} gap={2} testID={testID}>
            <Micro fontSize={10}>{label}</Micro>
            <Body fontSize={15} fontWeight="800" tabular>
                {value}
            </Body>
            {hint ? <Micro fontSize={10}>{hint}</Micro> : null}
        </YStack>
    );
}

export function StopDetailScreen({ manifestId, stopId, onNavigate, onOpenOrder, onComplete }: StopDetailScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const scheme = useResolvedScheme();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { manifest, stops, isLoading, failed, error, retry } = useManifest(manifestId);
    const { update, isSaving } = useStopUpdate(manifestId);

    const stop = useMemo(() => stops.find((s) => s.id === stopId), [stops, stopId]);
    const { order, isLoading: orderLoading } = useOrderRecord(stop?.order?.id);

    const [notice, setNotice] = useState<Notice>(null);
    const [arrival, setArrival] = useState<ArrivalCheck | null>(null);
    const [skipping, setSkipping] = useState(false);
    const [skipReason, setSkipReason] = useState('');

    const point = coordsOfStop(stop);
    const place = stop?.place;
    const status = String(stop?.status ?? 'pending');
    const done = stop ? isStopDone(stop) : false;

    const send = useCallback(
        async (target: ManifestStopRecord, input: Parameters<typeof update>[1], keys: { queued: string; sent: string }) => {
            const outcome = await update(target, input);
            if (outcome === 'queued') setNotice({ tone: 'neutral', key: keys.queued });
            else if (outcome === 'sent') setNotice({ tone: 'success', key: keys.sent });
            else setNotice({ tone: 'danger', key: 'stopDetail.updateFailed' });
            return outcome;
        },
        [update]
    );

    const recordArrival = useCallback(
        async (check: ArrivalCheck) => {
            if (!stop) return;
            setArrival(null);
            const meta: Record<string, unknown> = {
                arrival_position: toGeoPoint(position),
                arrival_check: check.kind,
                ...('distanceM' in check ? { arrival_distance_m: Math.round(check.distanceM) } : {}),
            };
            await send(stop, { status: 'arrived', meta }, { queued: 'stopDetail.arrivedQueued', sent: 'stopDetail.arrivedSent' });
        },
        [position, send, stop]
    );

    const arrive = useCallback(() => {
        const check = checkArrival(stop, position);
        if (check.kind === 'in-range' || check.kind === 'no-stop-location') {
            void recordArrival(check);
            return;
        }
        // Out of range, or no fix: the driver is asked before anything is sent.
        setArrival(check);
    }, [position, recordArrival, stop]);

    const skip = useCallback(async () => {
        if (!stop) return;
        const outcome = await send(
            stop,
            { status: 'skipped', meta: skipReason.trim() ? { skip_reason: skipReason.trim() } : undefined },
            { queued: 'stopDetail.skippedQueued', sent: 'stopDetail.skippedNotice' }
        );
        if (outcome !== 'failed') setSkipping(false);
    }, [send, skipReason, stop]);

    const share = useCallback(() => {
        if (!place) return;
        const message = [place.name, place.address, formatLatLng(point)].filter(Boolean).join('\n');
        void Share.share({ message });
    }, [place, point]);

    const call = useCallback(() => {
        if (place?.phone) void Linking.openURL(`tel:${String(place.phone).replace(/\s+/g, '')}`);
    }, [place?.phone]);

    if (isLoading && !stop) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="stop-loading">
                <Skeleton height={160} />
                <Skeleton height={120} />
            </YStack>
        );
    }

    if (!stop) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="stop-error" />
            </YStack>
        );
    }

    const entities = payloadOf(order).entities ?? [];
    const proofRequired = podRequiredOf(order);
    const total = manifest?.stops?.length ?? stops.length;
    const title = place?.name ?? place?.address ?? t('route.unnamedStop', { sequence: stop.sequence });

    return (
        <YStack flex={1} backgroundColor="$background" testID="stop-detail">
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                        <Caption>{t('stopDetail.stopOf', { sequence: stop.sequence, total })}</Caption>
                        <StatusPill status={status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="stop-status" />
                    </XStack>
                    <Heading fontSize={22}>{title}</Heading>
                </YStack>

                {notice ? <Banner tone={notice.tone} message={t(notice.key)} testID={`stop-notice-${notice.tone}`} /> : null}

                {point ? (
                    <YStack height={160} borderRadius={space[4]} overflow="hidden" pointerEvents="none" testID="stop-map">
                        <RouteMap stops={[stop]} currentStopId={done ? undefined : stop.id} dark={scheme !== 'light' && scheme !== 'sunlight'} />
                    </YStack>
                ) : null}

                <Surface padded>
                    <YStack gap={space[3]}>
                        {place?.name && place?.address ? <Secondary>{place.address}</Secondary> : null}
                        <Identifier label={t('stopDetail.coordinates')} value={formatLatLng(point) ?? '—'} boxed={false} testID="stop-coordinates" />
                        <XStack gap={space[2]} flexWrap="wrap">
                            <Button variant="secondary" height={40} paddingHorizontal={space[3]} onPress={share} testID="stop-share">
                                {t('stopDetail.share')}
                            </Button>
                            {place?.phone ? (
                                <Button variant="secondary" height={40} paddingHorizontal={space[3]} onPress={call} testID="stop-call">
                                    {t('stopDetail.call')} · {String(place.phone)}
                                </Button>
                            ) : null}
                        </XStack>
                    </YStack>
                </Surface>

                <Surface padded="compact">
                    <XStack gap={space[3]}>
                        <MetricCell label={t('stopDetail.eta')} value={stop.estimated_arrival ? formatClock(stop.estimated_arrival) : t('stopDetail.noEta')} testID="stop-eta" />
                        <MetricCell
                            label={t('stopDetail.fromPrev')}
                            value={stop.distance_from_prev_m != null ? formatMeters(stop.distance_from_prev_m, units) : '—'}
                            hint={stop.duration_from_prev_s != null ? formatDuration(stop.duration_from_prev_s) : undefined}
                            testID="stop-from-prev"
                        />
                        {stop.actual_arrival ? <MetricCell label={t('stopDetail.arrivedAt')} value={formatClock(stop.actual_arrival)} testID="stop-arrived-at" /> : null}
                    </XStack>
                </Surface>

                {place?.building || place?.security_access_code ? (
                    <Surface padded="compact" testID="stop-entry">
                        <YStack gap={space[1]}>
                            <Caption>{t('stopDetail.entryTitle')}</Caption>
                            {place.building ? <Secondary>{t('stopDetail.building', { building: place.building })}</Secondary> : null}
                            {place.security_access_code ? <Identifier value={t('stopDetail.accessCode', { code: place.security_access_code })} boxed={false} /> : null}
                        </YStack>
                    </Surface>
                ) : null}

                {stop.order?.id ? (
                    <Surface testID="stop-order">
                        <YStack padding={space[4]} gap={space[2]}>
                            <XStack justifyContent="space-between" alignItems="center">
                                <Caption>{t('stopDetail.orderTitle')}</Caption>
                                <StatusPill status={order?.status ?? stop.order.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
                            </XStack>
                            {stop.order.tracking_number ? <Identifier value={stop.order.tracking_number} boxed={false} /> : null}
                        </YStack>
                        <Divider />
                        <YStack padding={space[4]} gap={space[2]}>
                            <Caption>{t('stopDetail.itemsTitle', { count: entities.length })}</Caption>
                            {orderLoading && !order ? (
                                <Skeleton height={40} />
                            ) : entities.length ? (
                                entities.map((raw, i) => {
                                    const e = raw as Record<string, unknown>;
                                    const id = entityTrackingNumberOf(e);
                                    return (
                                        <YStack key={entityIdOf(e) ?? i} gap={2} testID={`stop-item-${entityIdOf(e) ?? i}`}>
                                            <Body fontSize={14} fontWeight="600">
                                                {entityNameOf(e) ?? ''}
                                            </Body>
                                            {id ? <Identifier value={id} boxed={false} /> : null}
                                        </YStack>
                                    );
                                })
                            ) : (
                                <Secondary fontSize={13}>{t('stopDetail.noItems')}</Secondary>
                            )}
                            {proofRequired ? (
                                <YStack gap={space[1]} testID="stop-proof-required">
                                    <ProofRequiredHint label={t('stopDetail.proofRequired')} />
                                    <Micro>{t('stopDetail.proofRequiredBody')}</Micro>
                                </YStack>
                            ) : null}
                            {onOpenOrder ? (
                                <Button variant="ghost" alignSelf="flex-start" onPress={() => onOpenOrder(stop.order!.id!)} testID="stop-open-order">
                                    {t('stopDetail.openOrder')} ›
                                </Button>
                            ) : null}
                        </YStack>
                    </Surface>
                ) : (
                    <Banner tone="neutral" message={t('stopDetail.noOrder')} testID="stop-no-order" />
                )}

                {done ? (
                    <Banner
                        tone={status === 'skipped' ? 'neutral' : 'success'}
                        message={status === 'skipped' ? t('stopDetail.skippedNotice') : t('stopDetail.completedNotice', { time: formatClock(stop.updated_at) })}
                        testID="stop-done"
                    />
                ) : null}
            </ScrollView>

            {/* R2 C6 — asked before anything is sent. */}
            {arrival ? (
                <YStack padding={space[4]} testID={`stop-geofence-${arrival.kind}`}>
                    <Surface level="sheet" hero padded>
                        <YStack gap={space[3]}>
                            {arrival.kind === 'out-of-range' ? (
                                <>
                                    <Heading fontSize={19}>{t('stopDetail.geofence.title', { distance: formatMeters(arrival.distanceM, units), sequence: stop.sequence })}</Heading>
                                    <Secondary fontSize={13}>{t('stopDetail.geofence.body')}</Secondary>
                                    <XStack justifyContent="space-between">
                                        <Micro>{t('stopDetail.geofence.radius')}</Micro>
                                        <Micro tabular>{t('stopDetail.geofence.radiusValue', { radius: formatMeters(ARRIVAL_RADIUS_M, units) })}</Micro>
                                    </XStack>
                                    <Identifier
                                        value={`${t('stopDetail.geofence.you')} ${formatLatLng(position) ?? '—'} · ${t('stopDetail.geofence.stop')} ${formatLatLng(point) ?? '—'}`}
                                        boxed={false}
                                    />
                                    <Button onPress={() => void recordArrival(arrival)} loading={isSaving} testID="stop-arrive-anyway">
                                        {t('stopDetail.geofence.arriveAnyway')}
                                    </Button>
                                    <Button variant="secondary" onPress={() => setArrival(null)} testID="stop-keep-driving">
                                        {t('stopDetail.geofence.keepDriving')}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Heading fontSize={19}>{t('stopDetail.geofence.noPositionTitle')}</Heading>
                                    <Secondary fontSize={13}>{t('stopDetail.geofence.noPositionBody')}</Secondary>
                                    <Button onPress={() => void recordArrival(arrival)} loading={isSaving} testID="stop-arrive-no-position">
                                        {t('stopDetail.geofence.noPositionConfirm')}
                                    </Button>
                                    <Button variant="secondary" onPress={() => setArrival(null)} testID="stop-keep-driving">
                                        {t('stopDetail.geofence.keepDriving')}
                                    </Button>
                                </>
                            )}
                        </YStack>
                    </Surface>
                </YStack>
            ) : skipping ? (
                <YStack padding={space[4]} testID="stop-skip-confirm">
                    <Surface level="sheet" hero padded>
                        <YStack gap={space[3]}>
                            <Heading fontSize={19}>{t('stopDetail.skipConfirmTitle', { sequence: stop.sequence })}</Heading>
                            <Secondary fontSize={13}>{t('stopDetail.skipConfirmBody')}</Secondary>
                            <Field placeholder={t('stopDetail.skipReasonPlaceholder')} value={skipReason} onChangeText={setSkipReason} multiline testID="stop-skip-reason" />
                            <Button variant="destructive" onPress={() => void skip()} loading={isSaving} testID="stop-skip-send">
                                {t('stopDetail.skipConfirm')}
                            </Button>
                            <Button variant="secondary" onPress={() => setSkipping(false)} testID="stop-skip-cancel">
                                {t('common.cancel')}
                            </Button>
                        </YStack>
                    </Surface>
                </YStack>
            ) : !done ? (
                <YStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="stop-actions">
                    {status === 'arrived' ? (
                        <>
                            <Button onPress={() => onComplete?.(manifestId, stop.id)} disabled={!onComplete} testID="stop-complete">
                                {t('stopDetail.complete')}
                            </Button>
                            <Button variant="ghost" onPress={() => setSkipping(true)} testID="stop-skip">
                                {t('stopDetail.skip')}
                            </Button>
                        </>
                    ) : (
                        <>
                            {point && onNavigate ? (
                                <Button onPress={() => onNavigate({ ...point, label: title })} testID="stop-navigate">
                                    {t('stopDetail.navigateTo', { sequence: stop.sequence })}
                                </Button>
                            ) : null}
                            <Button variant={point && onNavigate ? 'secondary' : 'primary'} onPress={arrive} loading={isSaving} testID="stop-arrive">
                                {t('stopDetail.arrive')}
                            </Button>
                            <Button variant="ghost" onPress={() => setSkipping(true)} testID="stop-skip">
                                {t('stopDetail.skip')}
                            </Button>
                        </>
                    )}
                </YStack>
            ) : null}
        </YStack>
    );
}

export default StopDetailScreen;
