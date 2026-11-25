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
import { formatClock, formatDateTime, formatMoney } from '../../format';
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
import { OrderCardMap } from './OrderCardMap';
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
export function ShapeStrip({ points, testID }: { points: OrderPoint[]; testID?: string }) {
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
                        <WaypointMark state={point.state} label={number} size={22} />
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

    const done = points.filter((p) => p.state === 'done').length;
    const progress = points.length ? t('jobs.orders.progress', { done, total: points.length }) : undefined;
    const under = [progress, itemCount ? t('ordersScreen.itemCount', { count: itemCount }) : null, type].filter(Boolean).join(' · ');
    const dueBy = !finished && next?.windowEnd ? t('jobs.byTime', { time: formatClock(next.windowEnd) }) : undefined;
    const cashLine = !finished && cash?.toCollect ? t('jobs.orders.cash', { amount: formatMoney(cash.amount, cash.currency) }) : undefined;

    /*
     * Order card C: the order's route on a small map first, because where it goes
     * is how a driver recognises a job; then the tracking number, the next place
     * and when. The status sits on the map so the text below stays three lines.
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
            <YStack>
                <OrderCardMap orderId={order.id} points={points} finished={finished} testID={`order-${order.id}-map`} />
                <XStack position="absolute" top={10} left={10}>
                    <StatusPill status={order.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
                </XStack>
            </YStack>

            <XStack alignItems="flex-end" justifyContent="space-between" gap={12} paddingHorizontal={14} paddingTop={12} paddingBottom={14}>
                <YStack flex={1} gap={2}>
                    {/* In full, on its own line: it is read against a parcel label. */}
                    <Body fontFamily="$mono" fontSize={15} fontWeight="600" testID={`order-${order.id}-tracking`}>
                        {displayIdOf(order)}
                    </Body>
                    {nextName && !finished ? (
                        <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                            {t('jobs.orders.next', { name: nextName })}
                        </Body>
                    ) : shape ? (
                        <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                            {shape}
                        </Body>
                    ) : null}
                    {under ? (
                        <Secondary fontSize={13} tabular numberOfLines={1}>
                            {under}
                        </Secondary>
                    ) : null}
                </YStack>
                {time || dueBy || cashLine ? (
                    <YStack alignItems="flex-end" gap={1}>
                        {time ? (
                            <Body fontSize={24} lineHeight={28} fontWeight="800" tabular numberOfLines={1}>
                                {time}
                            </Body>
                        ) : null}
                        {dueBy ? (
                            <Secondary fontSize={12} tabular numberOfLines={1}>
                                {dueBy}
                            </Secondary>
                        ) : null}
                        {cashLine ? (
                            <Secondary fontSize={12} fontWeight="700" tabular numberOfLines={1} color="$warningText">
                                {cashLine}
                            </Secondary>
                        ) : null}
                    </YStack>
                ) : null}
            </XStack>
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
