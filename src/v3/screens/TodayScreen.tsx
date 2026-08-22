/**
 * Today — R1 frames s01 and s12, shipped degraded on purpose.
 *
 * The frames show four things this API cannot yet supply: hours-of-service,
 * drive time remaining, the planned break, and whether the vehicle passed its
 * inspection. All four need the shift and HOS endpoints promoted in Phase 4a.
 * They are rendered as an explicit "not enabled" card rather than faked,
 * because a driver who trusts a fabricated drive-time reading is a driver
 * planning their day around a number nobody computed.
 *
 * What *is* real comes from the order tracker, which turns out to be
 * unusually honest about its own limits, and the screen honours that rather
 * than papering over it:
 *
 *   - The server decides which ETA is meaningful (`lifecycle.show_*_eta`). A
 *     dispatched order that has not started has an estimated *start*, not an
 *     arrival — presenting the latter would be a confident lie.
 *   - `insights.is_location_stale` says when the position everything was
 *     computed from is too old to trust. The live instance answered with one
 *     nearly twelve hours old, so an unlabelled ETA would have been wrong by
 *     any measure.
 */
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, MetricValue, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { RouteProgress } from '../ui/Progress';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { useSync } from '../shell';
import { useActiveOrders, useOrderQuery, useTracker, chooseEta, currentStop, displayIdOf, type OrderRecord } from '../data';
import { formatDuration, formatMeters, formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

/** Blocked on Phase 4a. Named individually so the gap is legible, not vague. */
const NOT_ENABLED = ['today.hos', 'today.driveTime', 'today.break', 'today.inspection'] as const;

function NextStopCard({
    order,
    tracker,
    units,
    t,
    onOpenOrder,
    onNavigate,
}: {
    order: OrderRecord;
    tracker: ReturnType<typeof useTracker>['tracker'];
    units: 'metric' | 'imperial';
    t: (k: string, o?: Record<string, unknown>) => string;
    onOpenOrder?: (id: string) => void;
    onNavigate?: (d: { latitude: number; longitude: number; label?: string }) => void;
}) {
    const stop = currentStop(tracker);
    const eta = chooseEta(tracker);
    const progress = tracker?.progress;
    const insights = tracker?.insights;

    return (
        <Surface hero padded testID="today-next-stop">
            <YStack gap={space[3]}>
                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                    <Caption>{stop?.type === 'pickup' ? t('today.nextPickup') : t('today.nextDropoff')}</Caption>
                    <StatusPill status={order.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
                </XStack>

                <Body fontSize={17} fontWeight="800">
                    {stop?.name ?? stop?.address ?? t('today.noStopRecorded')}
                </Body>
                <Identifier value={displayIdOf(order)} boxed={false} />

                {/* The ETA the *server* says is meaningful, labelled as what it is. */}
                {eta.kind !== 'none' ? (
                    <YStack gap={space[1]} testID={`today-eta-${eta.kind}`}>
                        <Caption>{eta.kind === 'live' ? t('today.arrivingIn') : t('today.startingIn')}</Caption>
                        <XStack gap={space[2]} alignItems="baseline">
                            <MetricValue>{formatDuration(eta.seconds)}</MetricValue>
                            {eta.at ? <Micro tabular>{formatClock(eta.at)}</Micro> : null}
                        </XStack>
                    </YStack>
                ) : (
                    <Micro testID="today-no-eta">{t('today.noEta')}</Micro>
                )}

                {/*
                  * Only warn when a number is actually shown — the position
                  * being old says nothing useful if there is no estimate drawn
                  * from it, and an unexplained warning just looks like a fault.
                  */}
                {eta.stale && eta.kind !== 'none' ? (
                    <Micro tone="warning" testID="today-stale-location">
                        {t('today.staleLocation')}
                    </Micro>
                ) : null}
                {insights?.is_delayed ? (
                    <Micro tone="danger" testID="today-delayed">
                        {t('today.delayed', { duration: formatDuration(insights.delay_seconds) })}
                    </Micro>
                ) : null}
                {insights?.is_off_route ? <Micro tone="warning" testID="today-off-route">{t('today.offRoute')}</Micro> : null}

                {progress?.total_stops ? (
                    <YStack gap={space[2]} testID="today-progress">
                        <RouteProgress
                            completed={progress.completed_stops ?? 0}
                            total={progress.total_stops}
                            onTime={insights?.is_delayed === false}
                        />
                        {progress.remaining_distance_m != null ? (
                            <Micro tabular testID="today-remaining">
                                {t('today.remaining', { distance: formatMeters(progress.remaining_distance_m, units) })}
                            </Micro>
                        ) : null}
                    </YStack>
                ) : null}

                <XStack gap={space[2]}>
                    {onOpenOrder ? (
                        <Button flex={1} variant="secondary" onPress={() => onOpenOrder(order.id)} testID="today-open-order">
                            {t('today.openOrder')}
                        </Button>
                    ) : null}
                    {onNavigate && stop?.latitude != null && stop?.longitude != null ? (
                        <Button
                            flex={1}
                            onPress={() => onNavigate({ latitude: stop.latitude!, longitude: stop.longitude!, label: stop.address ?? undefined })}
                            testID="today-navigate"
                        >
                            {t('today.navigate')}
                        </Button>
                    ) : null}
                </XStack>
            </YStack>
        </Surface>
    );
}

export function TodayScreen({
    driverId,
    reloadToken,
    onOpenOrder,
    onNavigate,
}: {
    driverId?: string;
    reloadToken?: number;
    onOpenOrder?: (orderId: string) => void;
    onNavigate?: (destination: { latitude: number; longitude: number; label?: string }) => void;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const { isOnline } = useSync();

    // The query fills the store; the selector reads it. Same split as Orders,
    // so both surfaces show the same rows without fetching twice.
    const { state, error, retry } = useOrderQuery({ driver_assigned: driverId, limit: 50 }, { enabled: !!driverId });
    const orders = useActiveOrders();
    const current = orders[0];
    const isLoading = state === 'loading' && orders.length === 0;
    const failed = state === 'error';
    const { tracker, isLoading: trackerLoading, failed: trackerFailed } = useTracker(current?.id, reloadToken);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="today-loading">
                <Skeleton height={220} />
                <Skeleton height={120} />
            </YStack>
        );
    }

    if (failed && orders.length === 0) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="today-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} />
            </YStack>
        );
    }

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="today">
            {!isOnline ? <Banner tone="neutral" message={t('today.offlineNotice')} testID="today-offline" /> : null}

            {!current ? (
                <EmptyState testID="today-empty" title={t('today.emptyTitle')} body={t('today.emptyBody')} />
            ) : trackerLoading ? (
                <Skeleton height={220} testID="today-tracker-loading" />
            ) : trackerFailed ? (
                // The order is still known even when its tracker is not.
                <Surface hero padded testID="today-tracker-unavailable">
                    <YStack gap={space[2]}>
                        <Caption>{t('today.nextDropoff')}</Caption>
                        <Identifier value={displayIdOf(current)} boxed={false} />
                        <Micro tone="warning">{t('today.trackerUnavailable')}</Micro>
                    </YStack>
                </Surface>
            ) : (
                <NextStopCard
                    order={current}
                    tracker={tracker}
                    units={units}
                    t={t}
                    onOpenOrder={onOpenOrder}
                    onNavigate={onNavigate}
                />
            )}

            {orders.length > 1 ? (
                <Micro testID="today-more-work">{t('today.moreWork', { count: orders.length - 1 })}</Micro>
            ) : null}

            {/*
              * Named individually rather than one vague "coming soon": a driver
              * should be able to see that the app knows these exist and is not
              * quietly omitting them.
              */}
            <Surface testID="today-not-enabled">
                <YStack padding={space[3]} gap={space[1]}>
                    <Heading fontSize={15}>{t('today.notEnabledTitle')}</Heading>
                    <Secondary fontSize={13}>{t('today.notEnabledBody')}</Secondary>
                </YStack>
                {NOT_ENABLED.map((key) => (
                    <YStack key={key}>
                        <Divider />
                        <XStack padding={space[3]} justifyContent="space-between" alignItems="center" testID={`not-enabled-${key.split('.')[1]}`}>
                            <Body fontSize={15} tone="secondary">
                                {t(key)}
                            </Body>
                            <Micro tone="warning">{t('today.notEnabled')}</Micro>
                        </XStack>
                    </YStack>
                ))}
            </Surface>
        </ScrollView>
    );
}

export default TodayScreen;
