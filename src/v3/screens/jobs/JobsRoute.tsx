/**
 * Jobs → Route — design round 3 (Route.dc.html).
 *
 * Every waypoint of the day in driving order, whichever order it belongs to,
 * each with a row that opens its order. The sequence is the manifest's when
 * dispatch built one. When there is none the view is still useful: it lists
 * the active orders' own waypoints one order after another, and says plainly
 * that this is the order of the orders and not a planned route.
 *
 * What the mockup draws that the API does not carry, and is therefore absent:
 *
 *   - one row for several orders at the same place ("Pickup · 2 orders"): the
 *     manifest has one stop per order and place, so each is its own row;
 *   - legs (distance and minutes from the previous waypoint) when there is no
 *     manifest: those are the manifest's numbers, and nothing here asks a
 *     routing service for its own.
 */
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../../ui/Scroll';
import { Body, Secondary } from '../../ui/Text';
import { StatusPill } from '../../ui/StatusPill';
import { Banner, EmptyState, Skeleton } from '../../ui/Banner';
import { FailureState } from '../../ui/FailureState';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock, formatDay, formatDuration, formatMeters, formatMoney } from '../../format';
import { dayKey } from '../../data/orderStore';
import {
    scheduledDayOf,
    useAutoArrive,
    useStopUpdate,
    type ManifestRecord,
    type ManifestStopRecord,
} from '../../data';
import type { ApiError } from '../../api/NavigatorAdapter';
import { toGeoPoint, useDeviceLocation } from '../../shell';
import { Card, CARD_RADIUS, Glyph, GUTTER, OrderAvatar, Rail, Rise, SectionLabel, SegmentBar, WaypointMark } from './parts';
import type { JobWaypoint, OrderMark, RouteCounts } from './model';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Drop-off", "Waypoint 1 of 2" — what this place is to its order, when known. */
export function roleLabel(waypoint: Pick<JobWaypoint, 'role' | 'waypointNumber' | 'waypointTotal'>, t: T, numbered = false): string | undefined {
    if (waypoint.role === 'pickup') return t('jobs.role.pickup');
    if (waypoint.role === 'dropoff') return t('jobs.role.dropoff');
    if (waypoint.role === 'waypoint') {
        return numbered && waypoint.waypointNumber && waypoint.waypointTotal && waypoint.waypointTotal > 1
            ? t('jobs.role.waypointOf', { number: waypoint.waypointNumber, total: waypoint.waypointTotal })
            : t('jobs.role.waypoint');
    }
    return undefined;
}

/** The line over a waypoint's name: its state in a word, then its role. */
export function waypointTag(waypoint: JobWaypoint, t: T): string {
    const state =
        waypoint.state === 'current'
            ? t(waypoint.arrived ? 'jobs.state.here' : 'jobs.state.heading')
            : waypoint.state === 'done'
              ? t('jobs.state.done')
              : waypoint.state === 'skipped'
                ? t('jobs.state.skipped')
                : undefined;
    const parts = [state, roleLabel(waypoint, t), waypoint.state === 'later' && waypoint.windowEnd ? t('jobs.byTime', { time: formatClock(waypoint.windowEnd) }) : undefined].filter(Boolean);
    // A waypoint still to come, whose role the server did not say: it is a waypoint.
    return parts.length ? parts.join(' · ') : t('jobs.role.waypoint');
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <YStack flex={1} gap={2}>
            <Body fontSize={20} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                {value}
            </Body>
            <Secondary fontSize={12} numberOfLines={1}>
                {label}
            </Secondary>
        </YStack>
    );
}

function dateLabel(manifest: ManifestRecord, t: T): string {
    const day = scheduledDayOf(manifest);
    const today = dayKey();
    if (!day || day === today) return t('jobs.route.today', { date: formatDay(today, { weekday: true }) });
    return t('jobs.route.onDay', { date: formatDay(day, { weekday: true }) });
}

function Summary({
    manifest,
    waypoints,
    counts,
    units,
    canReorder,
    isOnline,
    onOptimise,
    t,
}: {
    manifest?: ManifestRecord;
    waypoints: JobWaypoint[];
    counts: RouteCounts;
    units: 'metric' | 'imperial';
    canReorder: boolean;
    isOnline: boolean;
    onOptimise?: () => void;
    t: T;
}) {
    const lastEta = [...waypoints].reverse().find((w) => w.eta && w.state !== 'done' && w.state !== 'skipped')?.eta;
    return (
        <Card testID="jobs-route-summary">
            <YStack gap={14}>
                <XStack alignItems="flex-start" justifyContent="space-between" gap={12}>
                    <YStack flex={1} gap={2}>
                        <SectionLabel>{manifest ? dateLabel(manifest, t) : t('jobs.route.derivedLabel')}</SectionLabel>
                        {manifest ? (
                            <Body fontFamily="$mono" fontSize={16} fontWeight="600" selectable testID="jobs-route-manifest-id">
                                {manifest.id}
                            </Body>
                        ) : (
                            <Body fontSize={15} lineHeight={21} testID="jobs-route-derived-note">
                                {t('jobs.route.derivedNote')}
                            </Body>
                        )}
                    </YStack>
                    {manifest?.status ? <StatusPill status={manifest.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} /> : null}
                </XStack>

                <XStack gap={8}>
                    <Stat value={String(counts.total)} label={t('jobs.route.statWaypoints', { count: counts.total })} />
                    <Stat value={String(counts.orders)} label={t('jobs.route.statOrders', { count: counts.orders })} />
                    {manifest?.total_distance_m ? <Stat value={formatMeters(manifest.total_distance_m, units)} label={t('jobs.route.statDistance')} /> : null}
                    {lastEta ? <Stat value={formatClock(lastEta)} label={t('jobs.route.statLast')} /> : null}
                </XStack>

                <XStack alignItems="center" gap={12}>
                    <SegmentBar total={counts.total} done={counts.done} currentIndex={counts.currentIndex} testID="jobs-route-progress" />
                    <Secondary fontSize={13} fontWeight="700" tabular numberOfLines={1}>
                        {t('jobs.route.doneOf', { done: counts.done, total: counts.total })}
                    </Secondary>
                </XStack>

                {canReorder && onOptimise ? (
                    <XStack
                        height={48}
                        borderRadius={14}
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$surfaceRaised"
                        alignItems="center"
                        justifyContent="center"
                        gap={8}
                        opacity={isOnline ? 1 : 0.4}
                        onPress={isOnline ? onOptimise : undefined}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !isOnline }}
                        testID="route-optimise"
                    >
                        <Glyph name="reorder" size={18} strokeWidth={2.4} />
                        <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                            {t('jobs.route.reorder', { count: counts.left })}
                        </Body>
                    </XStack>
                ) : null}
            </YStack>
        </Card>
    );
}

function WaypointCard({
    waypoint,
    mark,
    last,
    units,
    onOpen,
    onOpenOrder,
    t,
}: {
    waypoint: JobWaypoint;
    mark?: OrderMark;
    last: boolean;
    units: 'metric' | 'imperial';
    onOpen?: () => void;
    onOpenOrder?: () => void;
    t: T;
}) {
    const theme = useTheme();
    const done = waypoint.state === 'done' || waypoint.state === 'skipped';
    const current = waypoint.state === 'current';
    const time = done ? waypoint.arrivedAt : waypoint.eta;
    const leg = done
        ? t(waypoint.state === 'skipped' ? 'jobs.state.skipped' : 'jobs.state.done')
        : [waypoint.distanceFromPrevM != null ? formatMeters(waypoint.distanceFromPrevM, units) : null, waypoint.durationFromPrevS ? formatDuration(waypoint.durationFromPrevS) : null]
              .filter(Boolean)
              .join(' · ');
    const part = [roleLabel(waypoint, t, true), waypoint.itemCount ? t('ordersScreen.itemCount', { count: waypoint.itemCount }) : null, waypoint.cash ? t('jobs.collect', { amount: formatMoney(waypoint.cash.amount, waypoint.cash.currency) }) : null].filter(Boolean).join(' · ');
    const tag = waypointTag(waypoint, t);
    const title = waypoint.name ?? waypoint.address ?? t('jobs.unnamed', { sequence: waypoint.sequence });

    return (
        <XStack gap={12} testID={`jobs-waypoint-${waypoint.key}`}>
            <YStack width={36} alignItems="center">
                <WaypointMark state={waypoint.state} label={waypoint.sequence} />
                {last ? null : <Rail vertical done={waypoint.state === 'done'} />}
            </YStack>
            <YStack
                flex={1}
                marginBottom={12}
                padding={14}
                gap={10}
                borderRadius={CARD_RADIUS}
                backgroundColor={current ? '$primaryFill' : '$surface'}
                borderWidth={current ? 1.5 : 1}
                borderColor={current ? '$primary' : '$border'}
                opacity={done ? 0.72 : 1}
            >
                <XStack
                    gap={12}
                    alignItems="flex-start"
                    onPress={onOpen}
                    pressStyle={onOpen ? { opacity: 0.7 } : undefined}
                    accessibilityRole={onOpen ? 'button' : undefined}
                    accessibilityLabel={`${waypoint.sequence}. ${tag}. ${title}`}
                    testID={`route-stop-${waypoint.stopId ?? waypoint.key}`}
                >
                    <YStack flex={1} gap={2}>
                        <SectionLabel tone={waypoint.state === 'done' ? 'success' : current ? 'brand' : 'muted'}>{tag}</SectionLabel>
                        <Body fontSize={17} fontWeight="800" numberOfLines={1}>
                            {title}
                        </Body>
                        {waypoint.name && waypoint.address ? (
                            <Secondary fontSize={13} numberOfLines={1}>
                                {waypoint.address}
                            </Secondary>
                        ) : null}
                    </YStack>
                    {time || leg ? (
                        <YStack alignItems="flex-end" gap={2}>
                            {time ? (
                                <Body fontSize={18} fontWeight="800" tabular>
                                    {formatClock(time)}
                                </Body>
                            ) : null}
                            {leg ? (
                                <Secondary fontSize={12} tabular numberOfLines={1}>
                                    {leg}
                                </Secondary>
                            ) : null}
                        </YStack>
                    ) : null}
                </XStack>

                {waypoint.orderId && waypoint.trackingNumber ? (
                    <XStack
                        minHeight={48}
                        paddingVertical={6}
                        paddingHorizontal={10}
                        gap={10}
                        alignItems="center"
                        borderRadius={12}
                        backgroundColor="$surfaceRaised"
                        onPress={onOpenOrder}
                        pressStyle={onOpenOrder ? { opacity: 0.7 } : undefined}
                        accessibilityRole="button"
                        accessibilityLabel={t('jobs.openOrder', { order: waypoint.trackingNumber })}
                        testID={`jobs-waypoint-order-${waypoint.key}`}
                    >
                        <OrderAvatar mark={mark} size={28} />
                        <YStack flex={1} gap={1}>
                            {/* In full, never cut short: it is read against a label. */}
                            <Body fontFamily="$mono" fontSize={13} fontWeight="600">
                                {waypoint.trackingNumber}
                            </Body>
                            {part ? (
                                <Secondary fontSize={12} tabular numberOfLines={1}>
                                    {part}
                                </Secondary>
                            ) : null}
                        </YStack>
                        <Glyph name="chevron" size={16} color={theme.textSecondary?.val as string} strokeWidth={2.4} />
                    </XStack>
                ) : null}
            </YStack>
        </XStack>
    );
}

export interface JobsRouteProps {
    manifest?: ManifestRecord;
    /** The manifest's own stops, for the arrival geofence. Empty without a manifest. */
    stops: ManifestStopRecord[];
    waypoints: JobWaypoint[];
    counts: RouteCounts;
    marks: Map<string, OrderMark>;
    units: 'metric' | 'imperial';
    isOnline: boolean;
    isLoading: boolean;
    error?: ApiError | null;
    isRefreshing: boolean;
    onRefresh: () => void;
    onRetry: () => void;
    onOpenWaypoint?: (waypoint: JobWaypoint) => void;
    onOpenOrder?: (orderId: string) => void;
    onOptimise?: () => void;
    /** Room for the floating tab bar. */
    bottomSpace: number;
}

export function JobsRoute({
    manifest,
    stops,
    waypoints,
    counts,
    marks,
    units,
    isOnline,
    isLoading,
    error,
    isRefreshing,
    onRefresh,
    onRetry,
    onOpenWaypoint,
    onOpenOrder,
    onOptimise,
    bottomSpace,
}: JobsRouteProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const position = useDeviceLocation();

    /*
     * Inside the arrival radius the waypoint is marked arrived by itself after
     * a ten-second undo, exactly as the old Route tab did. The arrival is
     * recorded with `arrival_check: 'auto'` so dispatch can tell it from a tap.
     */
    const currentStop = stops.find((s) => s.id === waypoints[counts.currentIndex]?.stopId);
    const { update: updateStop } = useStopUpdate(manifest?.id);
    const [autoArrivedId, setAutoArrivedId] = useState<string | undefined>();
    const autoArrive = useAutoArrive(
        currentStop?.status === 'pending' ? currentStop : undefined,
        position,
        async (stop) => {
            const outcome = await updateStop(stop, { status: 'arrived', meta: { arrival_check: 'auto', arrival_position: toGeoPoint(position) } });
            if (outcome !== 'failed') setAutoArrivedId(stop.id);
        },
        { enabled: Boolean(manifest) && manifest?.status !== 'cancelled' }
    );
    const [, tick] = useState(0);
    useEffect(() => {
        if (autoArrive.state.kind !== 'pending') return;
        const id = setInterval(() => tick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [autoArrive.state.kind]);

    const current = counts.currentIndex >= 0 ? waypoints[counts.currentIndex] : undefined;

    if (isLoading && !waypoints.length) {
        return (
            <YStack flex={1} paddingHorizontal={GUTTER} gap={12} testID="route-loading">
                <Skeleton height={190} borderRadius={CARD_RADIUS} />
                <Skeleton height={120} borderRadius={CARD_RADIUS} />
                <Skeleton height={120} borderRadius={CARD_RADIUS} />
            </YStack>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: bottomSpace, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary?.val as string} />}
            showsVerticalScrollIndicator={false}
            testID="route-list-view"
        >
            {error && !waypoints.length ? (
                <FailureState error={error} isOnline={isOnline} onRetry={onRetry} t={t} testID="route-error" />
            ) : !waypoints.length ? (
                <EmptyState title={t('jobs.route.emptyTitle')} body={t('jobs.route.emptyBody')} testID="route-empty-today" />
            ) : (
                <YStack>
                    <YStack gap={12} paddingBottom={16}>
                        <Summary
                            manifest={manifest}
                            waypoints={waypoints}
                            counts={counts}
                            units={units}
                            canReorder={Boolean(manifest) && counts.left >= 3}
                            isOnline={isOnline}
                            onOptimise={onOptimise}
                            t={t}
                        />
                        {manifest?.status === 'draft' ? <Banner tone="neutral" message={t('jobs.route.draft')} testID="route-draft" /> : null}
                        {manifest?.status === 'cancelled' ? <Banner tone="neutral" message={t('jobs.route.cancelled')} testID="route-cancelled" /> : null}
                        {autoArrive.state.kind === 'pending' && current ? (
                            <Banner
                                tone="brand"
                                message={t('jobs.route.autoArriveTitle', { sequence: current.sequence })}
                                meta={t('jobs.route.autoArriveBody', { seconds: Math.max(0, Math.ceil((autoArrive.state.endsAt - Date.now()) / 1000)) })}
                                action={{ label: t('jobs.route.undo'), onPress: autoArrive.undo }}
                                testID="route-auto-arrive"
                            />
                        ) : autoArrivedId && autoArrivedId === current?.stopId ? (
                            <Banner tone="success" message={t('jobs.route.autoArrived')} testID="route-auto-arrived" />
                        ) : null}
                        {counts.total > 0 && counts.left === 0 ? <Banner tone="success" message={t('jobs.route.allDone')} testID="route-all-done" /> : null}
                    </YStack>

                    {waypoints.map((waypoint, index) => (
                        <Rise key={waypoint.key} index={index}>
                            <WaypointCard
                                waypoint={waypoint}
                                mark={waypoint.orderId ? marks.get(waypoint.orderId) : undefined}
                                last={index === waypoints.length - 1}
                                units={units}
                                onOpen={onOpenWaypoint ? () => onOpenWaypoint(waypoint) : undefined}
                                onOpenOrder={onOpenOrder && waypoint.orderId ? () => onOpenOrder(waypoint.orderId as string) : undefined}
                                t={t}
                            />
                        </Rise>
                    ))}
                </YStack>
            )}
        </ScrollView>
    );
}

export default JobsRoute;
