/**
 * Jobs → Route — the simple Jobs design (JobsSimpleRoute.dc.html).
 *
 * Every waypoint of the day in driving order, whichever order it belongs to,
 * as waypoint cards (card option A): what the place is, its name, when, and a
 * row naming its order that opens that order. The sequence is the manifest's
 * when dispatch built one. When there is none the list is the active orders'
 * own waypoints one order after another, and a line under it says so.
 *
 * What the API does not carry is absent rather than made up:
 *
 *   - legs (distance and minutes from the previous waypoint) and times when
 *     there is no manifest: those are the manifest's numbers, and nothing here
 *     asks a routing service for its own;
 *   - one row for several orders at the same place: the manifest has one stop
 *     per order and place, so each is its own row.
 */
import { useEffect, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../../ui/Scroll';
import { Body, Secondary } from '../../ui/Text';
import { Banner, EmptyState, Skeleton } from '../../ui/Banner';
import { FailureState } from '../../ui/FailureState';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock, formatDuration, formatMeters } from '../../format';
import {
    useAutoArrive,
    useStopUpdate,
    type ManifestRecord,
    type ManifestStopRecord,
} from '../../data';
import type { ApiError } from '../../api/NavigatorAdapter';
import { toGeoPoint, useDeviceLocation } from '../../shell';
import { StopBadge } from '../../ui/RouteMap';
import { ROUTE_COLOR_PALETTE, colorForId, describeWaypoint } from '../../ui/routeColors';
import { DottedRail } from '../home/parts';
import { CARD_RADIUS, Glyph, GUTTER, ListHeading, Rise, SmallMark } from './parts';
import type { JobWaypoint, RouteCounts } from './model';

type T = (key: string, options?: Record<string, unknown>) => string;

/** "Dropoff", "Waypoint 1 of 2" — what this place is to its order, when known. */
export function roleLabel(waypoint: Pick<JobWaypoint, 'role' | 'waypointNumber' | 'waypointTotal' | 'isReturn'>, t: T, numbered = false): string | undefined {
    if (waypoint.isReturn) return t('jobs.kind.return');
    if (waypoint.role === 'pickup') return t('jobs.kind.pickup');
    if (waypoint.role === 'dropoff') return t('jobs.kind.dropoff');
    if (waypoint.role === 'waypoint') {
        return numbered && waypoint.waypointNumber && waypoint.waypointTotal && waypoint.waypointTotal > 1
            ? t('jobs.role.waypointOf', { number: waypoint.waypointNumber, total: waypoint.waypointTotal })
            : t('jobs.kind.waypoint');
    }
    return undefined;
}

/**
 * The line over a waypoint's name. The one being headed to leads with that
 * ("Heading here · Pickup"); the others lead with what they are ("Dropoff ·
 * Done", "Waypoint 1 of 2 · by 15:00", "Dropoff · Last one").
 */
export function waypointTag(waypoint: JobWaypoint, t: T, last = false): string {
    // A waypoint whose role the server did not say is still a waypoint.
    const role = roleLabel(waypoint, t, true) ?? t('jobs.kind.waypoint');
    if (waypoint.state === 'current') return `${t(waypoint.arrived ? 'jobs.state.here' : 'jobs.state.heading')} · ${role}`;
    if (waypoint.state === 'done') return `${role} · ${t('jobs.state.done')}`;
    if (waypoint.state === 'skipped') return `${role} · ${t('jobs.state.skipped')}`;
    return [role, waypoint.windowEnd ? t('jobs.byTime', { time: formatClock(waypoint.windowEnd) }) : undefined, last ? t('jobs.route.lastOne') : undefined].filter(Boolean).join(' · ');
}

/** Distance and minutes from the previous waypoint, as the plan has them. */
function legOf(waypoint: JobWaypoint, units: 'metric' | 'imperial', withDuration: boolean): string {
    return [waypoint.distanceFromPrevM != null ? formatMeters(waypoint.distanceFromPrevM, units) : null, withDuration && waypoint.durationFromPrevS ? formatDuration(waypoint.durationFromPrevS) : null].filter(Boolean).join(' · ');
}

/** The waypoint card, option A (CardOptions.dc.html): the place, when, and a row for its order. */
function WaypointCard({
    waypoint,
    last,
    units,
    onOpen,
    onOpenOrder,
    t,
}: {
    waypoint: JobWaypoint;
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
    const leg = done ? '' : legOf(waypoint, units, current);
    const tag = waypointTag(waypoint, t, last);
    const title = waypoint.name ?? waypoint.address ?? t('jobs.unnamed', { sequence: waypoint.sequence });
    const orderColor = waypoint.orderId ? colorForId(waypoint.orderId) : undefined;

    return (
        <XStack gap={12} testID={`jobs-waypoint-${waypoint.key}`}>
            <YStack width={32} alignItems="center">
                {/* The same marker as on the map and in the console: P, D, R or the waypoint's number, in its order's colour. Its frame is wider than the rail, so it is centred over it. */}
                <YStack width={32} height={32} alignItems="center" justifyContent="center">
                    <StopBadge kind={waypoint.isReturn ? 'return' : waypoint.role} number={waypoint.waypointNumber ?? waypoint.sequence} color={orderColor} state={waypoint.state === 'later' ? 'pending' : waypoint.state} />
                </YStack>
                {last ? null : waypoint.state === 'done' ? <YStack flexGrow={1} width={3} marginVertical={4} borderRadius={1.5} backgroundColor="$success" /> : <DottedRail />}
            </YStack>
            <YStack
                flex={1}
                minWidth={0}
                marginBottom={10}
                padding={12}
                gap={10}
                borderRadius={CARD_RADIUS}
                backgroundColor={current ? '$primaryFill' : '$surface'}
                borderWidth={current ? 1.5 : 1}
                borderColor={current ? '$primary' : '$border'}
                opacity={done ? 0.7 : 1}
            >
                <XStack
                    alignItems="flex-start"
                    gap={10}
                    onPress={onOpen}
                    pressStyle={onOpen ? { opacity: 0.7 } : undefined}
                    accessibilityRole={onOpen ? 'button' : undefined}
                    accessibilityLabel={`${waypoint.sequence}. ${tag}. ${title}`}
                    testID={`route-stop-${waypoint.stopId ?? waypoint.key}`}
                >
                    <YStack flex={1} minWidth={0} gap={2}>
                        <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} textTransform="uppercase" tabular tone={waypoint.state === 'done' ? 'success' : current ? 'brand' : 'secondary'} numberOfLines={1}>
                            {tag}
                        </Body>
                        <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                            {title}
                        </Body>
                    </YStack>
                    {time || leg ? (
                        <YStack flexShrink={0} alignItems="flex-end" testID={`jobs-waypoint-time-${waypoint.key}`}>
                            {time ? (
                                <Body fontSize={17} lineHeight={22} fontWeight="800" tabular numberOfLines={1}>
                                    {formatClock(time)}
                                </Body>
                            ) : null}
                            {leg ? (
                                <Secondary fontSize={12} lineHeight={16} tabular numberOfLines={1}>
                                    {leg}
                                </Secondary>
                            ) : null}
                        </YStack>
                    ) : null}
                </XStack>

                {waypoint.orderId && waypoint.trackingNumber ? (
                    <XStack
                        minHeight={36}
                        paddingHorizontal={10}
                        paddingVertical={4}
                        gap={8}
                        alignItems="center"
                        borderRadius={10}
                        backgroundColor="$surfaceRaised"
                        onPress={onOpenOrder}
                        // 36 high as drawn; the touch reaches into the card's own padding.
                        hitSlop={{ top: 5, bottom: 6 }}
                        pressStyle={onOpenOrder ? { opacity: 0.7 } : undefined}
                        accessibilityRole="button"
                        accessibilityLabel={t('jobs.openOrder', { order: waypoint.trackingNumber })}
                        testID={`jobs-waypoint-order-${waypoint.key}`}
                    >
                        {/* The order's colour: the same on its markers and on its line on the map. */}
                        <YStack width={10} height={10} borderRadius={3} backgroundColor={(orderColor ?? theme.textMuted?.val) as never} />
                        {/* In full, never cut short: it is read against a label. */}
                        <Body flex={1} fontFamily="$mono" fontSize={13} lineHeight={18} fontWeight="600">
                            {waypoint.trackingNumber}
                        </Body>
                        <Glyph name="chevron" size={14} color={theme.textSecondary?.val as string} strokeWidth={2.6} />
                    </XStack>
                ) : null}

                {current && onOpen ? (
                    <XStack
                        height={52}
                        borderRadius={16}
                        alignItems="center"
                        justifyContent="center"
                        gap={10}
                        paddingHorizontal={12}
                        backgroundColor="$primary"
                        onPress={onOpen}
                        pressStyle={{ opacity: 0.8 }}
                        accessibilityRole="button"
                        testID="route-continue"
                    >
                        <Glyph name="navigate" size={17} color={theme.onPrimary?.val as string} />
                        <Body flexShrink={1} fontSize={17} lineHeight={22} fontWeight="800" tabular tone="onPrimary" numberOfLines={1}>
                            {[t('jobs.current.continue'), leg].filter(Boolean).join(' · ')}
                        </Body>
                    </XStack>
                ) : null}
            </YStack>
        </XStack>
    );
}

/** What the markers mean, under the list. */
function MarkerKey({ t }: { t: T }) {
    const keys = [
        { ...describeWaypoint('pickup', undefined), word: t('jobs.kind.pickup') },
        { ...describeWaypoint('dropoff', undefined), word: t('jobs.kind.dropoff') },
        { ...describeWaypoint('waypoint', 1, ROUTE_COLOR_PALETTE[1]), word: t('jobs.kind.waypoint') },
    ];
    return (
        <XStack alignItems="center" justifyContent="space-between" gap={10} paddingTop={6} accessibilityLabel={t('jobs.route.keyLabel')} testID="jobs-route-key">
            {keys.map((key) => (
                <XStack key={key.word} alignItems="center" gap={7}>
                    <SmallMark label={key.label} color={key.color} size={22} />
                    <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary" numberOfLines={1}>
                        {key.word}
                    </Body>
                </XStack>
            ))}
        </XStack>
    );
}

export interface JobsRouteProps {
    manifest?: ManifestRecord;
    /** The manifest's own stops, for the arrival geofence. Empty without a manifest. */
    stops: ManifestStopRecord[];
    waypoints: JobWaypoint[];
    counts: RouteCounts;
    units: 'metric' | 'imperial';
    isOnline: boolean;
    isLoading: boolean;
    error?: ApiError | null;
    isRefreshing: boolean;
    onRefresh: () => void;
    onRetry: () => void;
    onOpenWaypoint?: (waypoint: JobWaypoint) => void;
    onOpenOrder?: (orderId: string) => void;
    /** Room for the floating tab bar. */
    bottomSpace: number;
}

export function JobsRoute({
    manifest,
    stops,
    waypoints,
    counts,
    units,
    isOnline,
    isLoading,
    error,
    isRefreshing,
    onRefresh,
    onRetry,
    onOpenWaypoint,
    onOpenOrder,
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

    // The plan's own length. Without a manifest there is no figure, and none is worked out here.
    const totalM = typeof manifest?.total_distance_m === 'number' && manifest.total_distance_m > 0 ? manifest.total_distance_m : undefined;

    const banners = [
        manifest?.status === 'draft' ? <Banner key="draft" tone="neutral" message={t('jobs.route.draft')} testID="route-draft" /> : null,
        manifest?.status === 'cancelled' ? <Banner key="cancelled" tone="neutral" message={t('jobs.route.cancelled')} testID="route-cancelled" /> : null,
        autoArrive.state.kind === 'pending' && current ? (
            <Banner
                key="auto-arrive"
                tone="brand"
                message={t('jobs.route.autoArriveTitle', { sequence: current.sequence })}
                meta={t('jobs.route.autoArriveBody', { seconds: Math.max(0, Math.ceil((autoArrive.state.endsAt - Date.now()) / 1000)) })}
                action={{ label: t('jobs.route.undo'), onPress: autoArrive.undo }}
                testID="route-auto-arrive"
            />
        ) : autoArrivedId && autoArrivedId === current?.stopId ? (
            <Banner key="auto-arrived" tone="success" message={t('jobs.route.autoArrived')} testID="route-auto-arrived" />
        ) : null,
        counts.total > 0 && counts.left === 0 ? <Banner key="all-done" tone="success" message={t('jobs.route.allDone')} testID="route-all-done" /> : null,
    ].filter(Boolean);

    if (isLoading && !waypoints.length) {
        return (
            <YStack flex={1} paddingHorizontal={GUTTER} paddingTop={18} gap={12} testID="route-loading">
                <Skeleton height={26} borderRadius={8} />
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
                <YStack paddingTop={16}>
                    <FailureState error={error} isOnline={isOnline} onRetry={onRetry} t={t} testID="route-error" />
                </YStack>
            ) : !waypoints.length ? (
                <YStack paddingTop={16}>
                    <EmptyState title={t('jobs.route.emptyTitle')} body={t('jobs.route.emptyBody')} testID="route-empty-today" />
                </YStack>
            ) : (
                <YStack>
                    <YStack paddingTop={18} paddingBottom={12} testID="jobs-route-summary">
                        <ListHeading title={t('jobs.route.title')} aside={[t('jobs.route.doneOf', { done: counts.done, total: counts.total }), totalM ? formatMeters(totalM, units) : null].filter(Boolean).join(' · ')} />
                    </YStack>

                    {banners.length ? (
                        <YStack gap={8} paddingBottom={12}>
                            {banners}
                        </YStack>
                    ) : null}

                    <YStack accessibilityLabel={t('jobs.route.listLabel', { count: counts.total })}>
                        {waypoints.map((waypoint, index) => (
                            <Rise key={waypoint.key} index={index}>
                                <WaypointCard
                                    waypoint={waypoint}
                                    last={index === waypoints.length - 1}
                                    units={units}
                                    onOpen={onOpenWaypoint ? () => onOpenWaypoint(waypoint) : undefined}
                                    onOpenOrder={onOpenOrder && waypoint.orderId ? () => onOpenOrder(waypoint.orderId as string) : undefined}
                                    t={t}
                                />
                            </Rise>
                        ))}
                    </YStack>

                    <MarkerKey t={t} />

                    {manifest ? null : (
                        <Secondary paddingTop={14} fontSize={14} lineHeight={20} testID="jobs-route-derived-note">
                            {t('jobs.route.derivedNote')}
                        </Secondary>
                    )}
                </YStack>
            )}
        </ScrollView>
    );
}

export default JobsRoute;
