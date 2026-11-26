/**
 * Jobs → Orders — design round 3 (Work.dc.html).
 *
 * The orders assigned to the driver. The card leads with the tracking number,
 * in full and monospaced, then shows the order's shape as a strip — one mark
 * per pickup, waypoint and drop-off — so "Pickup → 2 waypoints → Drop-off" is
 * read at a glance and the driver sees how far through it they are.
 *
 * Every shape the server allows goes through the same strip: pickup +
 * drop-off, pickup + waypoints + drop-off, pickup + waypoints, waypoints only
 * (see jobs/model). An order with a great many waypoints keeps its first and
 * last marks and counts the rest, rather than shrinking them to dots.
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { FlatList } from '../../ui/Scroll';
import { Body, Secondary } from '../../ui/Text';
import { StatusPill } from '../../ui/StatusPill';
import { Banner, EmptyState, Skeleton } from '../../ui/Banner';
import { FailureState } from '../../ui/FailureState';
import { Field } from '../../ui/Field';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock, formatDateTime, formatMeters, formatMoney } from '../../format';
import { useSettings } from '../../settings';
import {
    cashOnDeliveryOf,
    customerNameOf,
    displayIdOf,
    isBookingOrder,
    orderStore,
    payloadOf,
    trackingNumberOf,
    type OrderNotice,
    type OrderRecord,
} from '../../data';
import { dayKey } from '../../data/orderStore';
import type { ApiError } from '../../api/NavigatorAdapter';
import { CARD_RADIUS, FilterChip, Glyph, GUTTER, IconButton, OrderAvatar, Rail, Rise, SectionLabel, WaypointMark } from './parts';
import { OrderCardMap, useOrderCardRoute } from './OrderCardMap';
import { colorForId, describeWaypoint } from '../../ui/routeColors';
import { isOrderStarted, nextPoint, orderPoints, orderShape, orderTypeLabel, segmentOf, type OrderMark, type OrderPoint, type OrderSegment } from './model';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Case-insensitive match across the fields a driver would actually search by. */
function matches(order: OrderRecord, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const payload = payloadOf(order);
    return [
        trackingNumberOf(order),
        order.internal_id,
        order.id,
        customerNameOf(order),
        payload?.pickup?.name,
        payload?.pickup?.address,
        payload?.dropoff?.name,
        payload?.dropoff?.address,
        ...(payload?.waypoints ?? []).flatMap((w) => [w?.name, w?.address]),
    ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
}

/** "Pickup → 2 waypoints → Drop-off", for whichever of the three the order has. */
export function shapeLabel(points: OrderPoint[], t: T): string {
    const shape = orderShape(points);
    return [
        shape.hasPickup ? t('jobs.role.pickup') : null,
        shape.waypointCount ? t('jobs.orders.waypoints', { count: shape.waypointCount }) : null,
        shape.hasDropoff ? t('jobs.role.dropoff') : null,
    ]
        .filter(Boolean)
        .join(' → ');
}

const STRIP_MAX = 9;

/** The order's points as marks joined by a rail. */
/**
 * One point of the strip, drawn as the console draws a waypoint: a circle with P,
 * D or the waypoint's number. Done is dimmed; the one being headed to has a ring.
 */
function StripMarker({ point, number, color }: { point: OrderPoint; number: number; color?: string }) {
    const { label, color: fill } = describeWaypoint(point.role, point.waypointNumber ?? number, color);
    const current = point.state === 'current';
    const done = point.state === 'done';
    const skipped = point.state === 'skipped';
    const size = current ? 30 : 24;
    return (
        <YStack width={size + (current ? 8 : 0)} height={size + (current ? 8 : 0)} alignItems="center" justifyContent="center">
            {current ? <YStack position="absolute" width={size + 8} height={size + 8} borderRadius={(size + 8) / 2} borderWidth={2} borderColor={fill as never} opacity={0.5} /> : null}
            <YStack
                width={size}
                height={size}
                borderRadius={size / 2}
                alignItems="center"
                justifyContent="center"
                backgroundColor={(skipped ? 'transparent' : fill) as never}
                borderWidth={2}
                borderColor={(skipped ? fill : '#FFFFFF') as never}
                opacity={done ? 0.55 : 1}
            >
                <Body fontSize={current ? 13 : 11} lineHeight={current ? 16 : 14} fontWeight="800" color={(skipped ? fill : '#FFFFFF') as never}>
                    {skipped ? '–' : label}
                </Body>
            </YStack>
        </YStack>
    );
}

export function ShapeStrip({ points, color, testID }: { points: OrderPoint[]; /** The order's route colour, for its numbered waypoints. */ color?: string; testID?: string }) {
    if (!points.length) return null;
    // Too many to draw: keep both ends and the count of what is between them.
    const folded = points.length > STRIP_MAX;
    const shown = folded ? [...points.slice(0, 4), ...points.slice(-4)] : points;
    return (
        <XStack alignItems="center" gap={4} testID={testID} accessibilityElementsHidden importantForAccessibility="no">
            {shown.map((point, index) => {
                const number = folded && index >= 4 ? points.length - (shown.length - index) + 1 : index + 1;
                const last = index === shown.length - 1;
                return (
                    <XStack key={index} flex={last ? undefined : 1} alignItems="center" gap={4}>
                        <StripMarker point={point} number={number} color={color} />
                        {last ? null : folded && index === 3 ? (
                            <XStack flex={1} alignItems="center" justifyContent="center">
                                <Secondary fontSize={12} fontWeight="700" tabular>
                                    +{points.length - shown.length}
                                </Secondary>
                            </XStack>
                        ) : (
                            <Rail done={point.state === 'done'} />
                        )}
                    </XStack>
                );
            })}
        </XStack>
    );
}

interface CardProps {
    order: OrderRecord;
    mark?: OrderMark;
    /** The manifest's estimate for this order's next waypoint, when there is one. */
    nextEta?: string;
    onPress?: () => void;
    t: T;
}

const OrderJobCard = memo(function OrderJobCard({ order, mark, nextEta, onPress, t }: CardProps) {
    const theme = useTheme();
    const { units } = useSettings();
    const points = orderPoints(order);
    const next = nextPoint(points);
    const started = isOrderStarted(order);
    const finished = segmentOf(order) === 'completed';
    const itemCount = payloadOf(order).entities?.length ?? 0;
    const cash = cashOnDeliveryOf(order);
    const type = isBookingOrder(order) ? t('ordersScreen.job') : orderTypeLabel(order);
    const customer = customerNameOf(order);

    /*
     * The time on the right is whichever is true for this order: the manifest's
     * estimate for the waypoint being headed to, else when it is scheduled. No
     * time is shown rather than one worked out on the device.
     */
    const scheduledToday = order.scheduled_at && dayKey(order.scheduled_at) === dayKey();
    const time = finished ? undefined : nextEta ? formatClock(nextEta) : order.scheduled_at && !started ? (scheduledToday ? formatClock(order.scheduled_at) : formatDateTime(order.scheduled_at)) : undefined;
    const nextName = next?.name ?? next?.address;
    const shape = shapeLabel(points, t);

    const dueBy = !finished && next?.windowEnd ? t('jobs.byTime', { time: formatClock(next.windowEnd) }) : undefined;
    // What is left to drive on this order, by road, from its tracker. Absent rather than estimated.
    const { route, remainingM } = useOrderCardRoute(finished ? undefined : order.id);
    const footer = [
        itemCount ? { key: 'items', label: t('ordersScreen.itemCount', { count: itemCount }), tone: undefined } : null,
        remainingM ? { key: 'distance', label: formatMeters(remainingM, units), tone: undefined } : null,
        !finished && cash?.toCollect ? { key: 'cash', label: t('jobs.orders.cash', { amount: formatMoney(cash.amount, cash.currency) }), tone: 'warning' as const } : null,
    ].filter(Boolean) as { key: string; label: string; tone?: 'warning' }[];

    /*
     * The order card, in three bands:
     *   - a map of the one leg that matters now, from the driver to this order's next waypoint;
     *   - the order itself: tracking number, type, status, its shape as a strip of markers, the next place and when;
     *   - a footer of the figures a driver weighs a job by: items, distance left, cash to collect.
     * A finished order has no next waypoint, so it has no map.
     */
    return (
        <YStack
            borderRadius={CARD_RADIUS}
            overflow="hidden"
            backgroundColor="$surface"
            borderWidth={started && !finished ? 1.5 : 1}
            borderColor={started && !finished ? '$primary' : '$border'}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('jobs.openOrder', { order: displayIdOf(order) })}
            testID={`order-${order.id}`}
        >
            {next && !finished ? <OrderCardMap orderId={order.id} target={next} route={route} testID={`order-${order.id}-map`} /> : null}

            <YStack padding={14} gap={12}>
                <XStack alignItems="flex-start" gap={12}>
                    <YStack flex={1} gap={2}>
                        {/* In full, on its own line: it is read against a parcel label. */}
                        <Body fontFamily="$mono" fontSize={16} fontWeight="600" testID={`order-${order.id}-tracking`}>
                            {displayIdOf(order)}
                        </Body>
                        <Secondary fontSize={13} numberOfLines={1}>
                            {[type, customer].filter(Boolean).join(' · ')}
                        </Secondary>
                    </YStack>
                    <StatusPill status={order.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
                </XStack>

                <ShapeStrip points={points} color={colorForId(order.id)} testID={`order-${order.id}-shape`} />

                {shape || nextName || time ? (
                    <XStack alignItems="flex-end" justifyContent="space-between" gap={12}>
                        <YStack flex={1} gap={2}>
                            {shape ? <SectionLabel>{shape}</SectionLabel> : null}
                            {nextName && !finished ? (
                                <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                                    {t('jobs.orders.next', { name: nextName })}
                                </Body>
                            ) : null}
                        </YStack>
                        {time || dueBy ? (
                            <YStack alignItems="flex-end" gap={1}>
                                {time ? (
                                    <Body fontSize={20} lineHeight={24} fontWeight="800" tabular numberOfLines={1}>
                                        {time}
                                    </Body>
                                ) : null}
                                {dueBy ? (
                                    <Secondary fontSize={12} tabular numberOfLines={1}>
                                        {dueBy}
                                    </Secondary>
                                ) : null}
                            </YStack>
                        ) : null}
                    </XStack>
                ) : null}
            </YStack>

            {footer.length ? (
                <XStack gap={6} paddingHorizontal={14} paddingVertical={10} borderTopWidth={1} borderColor="$border" backgroundColor="$background" testID={`order-${order.id}-footer`}>
                    {footer.map((chip) => (
                        <XStack key={chip.key} height={28} alignItems="center" paddingHorizontal={10} borderRadius={14} backgroundColor="$surfaceRaised">
                            <Body fontSize={13} fontWeight="700" tabular numberOfLines={1} color={chip.tone === 'warning' ? '$warningText' : '$textPrimary'}>
                                {chip.label}
                            </Body>
                        </XStack>
                    ))}
                </XStack>
            ) : null}
        </YStack>
    );
});

export interface JobsOrdersProps {
    orders: OrderRecord[];
    marks: Map<string, OrderMark>;
    /** Order id → the manifest's estimate for its next waypoint. */
    nextEtas: Map<string, string>;
    notices: OrderNotice[];
    state: 'idle' | 'loading' | 'refreshing' | 'ready' | 'error' | string;
    error?: ApiError | null;
    isOnline: boolean;
    isRefreshing: boolean;
    onRefresh: () => void;
    onRetry: () => void;
    onOpenOrder?: (id: string) => void;
    onOpenOffers?: () => void;
    bottomSpace: number;
}

export function JobsOrders({ orders, marks, nextEtas, notices, state, error, isOnline, isRefreshing, onRefresh, onRetry, onOpenOrder, onOpenOffers, bottomSpace }: JobsOrdersProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const [segment, setSegment] = useState<OrderSegment>('active');
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);

    const bySegment = useMemo(() => {
        const groups: Record<OrderSegment, OrderRecord[]> = { active: [], scheduled: [], completed: [] };
        for (const order of orders) groups[segmentOf(order)].push(order);
        return groups;
    }, [orders]);

    const rows = useMemo(() => bySegment[segment].filter((o) => matches(o, query)), [bySegment, segment, query]);

    const chips: { value: OrderSegment; label: string }[] = [
        { value: 'active', label: bySegment.active.length ? t('jobs.orders.activeCount', { count: bySegment.active.length }) : t('jobs.orders.active') },
        { value: 'scheduled', label: bySegment.scheduled.length ? t('jobs.orders.scheduledCount', { count: bySegment.scheduled.length }) : t('jobs.orders.scheduled') },
        { value: 'completed', label: t('jobs.orders.done') },
    ];

    const renderItem = useCallback(
        ({ item, index }: { item: OrderRecord; index: number }) => (
            <YStack paddingHorizontal={GUTTER} paddingBottom={8}>
                <Rise index={index}>
                    <OrderJobCard order={item} mark={marks.get(item.id)} nextEta={nextEtas.get(item.id)} onPress={onOpenOrder ? () => onOpenOrder(item.id) : undefined} t={t} />
                </Rise>
            </YStack>
        ),
        [marks, nextEtas, onOpenOrder, t]
    );

    const empty = useMemo(() => {
        if (state === 'loading') {
            return (
                <YStack paddingHorizontal={GUTTER} gap={8} testID="orders-skeleton">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} height={148} borderRadius={CARD_RADIUS} />
                    ))}
                </YStack>
            );
        }
        if (state === 'error') {
            return (
                <YStack paddingHorizontal={GUTTER}>
                    <FailureState error={error} isOnline={isOnline} onRetry={onRetry} t={t} testID="orders-error" />
                </YStack>
            );
        }
        if (query) {
            return (
                <YStack paddingHorizontal={GUTTER}>
                    <EmptyState
                        testID="orders-no-results"
                        title={t('ordersScreen.noSearchResultsTitle')}
                        body={t('ordersScreen.noSearchResultsBody', { query })}
                        action={{ label: t('common.clear'), onPress: () => setQuery('') }}
                    />
                </YStack>
            );
        }
        const key = segment.charAt(0).toUpperCase() + segment.slice(1);
        return (
            <YStack paddingHorizontal={GUTTER}>
                <EmptyState testID="orders-empty" title={t(`ordersScreen.empty${key}Title`)} body={t(`ordersScreen.empty${key}Body`)} />
            </YStack>
        );
    }, [state, error, query, segment, t, onRetry, isOnline]);

    return (
        <YStack flex={1} testID="orders-list-view">
            <YStack paddingHorizontal={GUTTER} paddingBottom={12} gap={12}>
                <XStack gap={8} alignItems="center" testID="orders-segments">
                    {chips.map((chip) => (
                        <FilterChip key={chip.value} label={chip.label} on={segment === chip.value} onPress={() => setSegment(chip.value)} testID={`orders-segments-${chip.value}`} />
                    ))}
                    <YStack flex={1} />
                    <IconButton
                        name={searching ? 'close' : 'search'}
                        label={t(searching ? 'jobs.orders.closeSearch' : 'jobs.orders.search')}
                        size={36}
                        round
                        onPress={() => {
                            // Closing the search clears it, or the list stays filtered by a field nobody can see.
                            if (searching) setQuery('');
                            setSearching((v) => !v);
                        }}
                        testID="orders-search-toggle"
                    />
                </XStack>
                {searching ? (
                    <Field value={query} onChangeText={setQuery} placeholder={t('ordersScreen.searchPlaceholder')} autoCapitalize="none" testID="orders-search" />
                ) : null}
                {/*
                  * A reassigned order disappears from the list; this says so,
                  * rather than leaving the driver to wonder where it went.
                  */}
                {notices.map((notice) => (
                    <Banner
                        key={notice.orderId}
                        tone="warning"
                        message={t('ordersScreen.reassigned', { order: notice.label })}
                        action={{ label: t('common.dismiss'), onPress: () => orderStore.dismissNotice(notice.orderId) }}
                        testID={`order-notice-${notice.orderId}`}
                    />
                ))}
                {onOpenOffers ? (
                    <XStack
                        minHeight={48}
                        paddingHorizontal={14}
                        gap={10}
                        alignItems="center"
                        borderRadius={14}
                        borderWidth={1}
                        borderColor="$border"
                        backgroundColor="$surfaceRaised"
                        onPress={onOpenOffers}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID="orders-open-offers"
                    >
                        <Body flex={1} fontSize={15} fontWeight="700" numberOfLines={1}>
                            {t('jobs.orders.offers')}
                        </Body>
                        <Glyph name="chevron" size={16} color={theme.textSecondary?.val as string} strokeWidth={2.4} />
                    </XStack>
                ) : null}
            </YStack>

            <FlatList
                data={rows}
                keyExtractor={(o) => o.id}
                renderItem={renderItem}
                ListEmptyComponent={empty}
                contentContainerStyle={{ paddingBottom: bottomSpace, flexGrow: 1 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary?.val as string} />}
                // Long lists of cards: keep the window tight so scrolling a full
                // day of work does not mount every row.
                initialNumToRender={6}
                windowSize={7}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            />
        </YStack>
    );
}

export default JobsOrders;
