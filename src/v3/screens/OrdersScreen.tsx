/**
 * Orders — R1 frames s05 (light) / s18 (dark).
 *
 * The design's rule leads here: the tracking number gets its own line, in full,
 * monospaced, under a label — a driver reads it off the screen and matches it
 * against a parcel. Everything else on the card is secondary to that.
 *
 * Rows select from the normalised store, so the list's `data` keeps its
 * identity across unrelated re-renders and the memoised cards actually skip.
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { YStack, useTheme } from 'tamagui';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { OrderCard, type OrderCardStop } from '../ui/Cards';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useAllOrders, useOrderQuery, customerNameOf, displayIdOf, payloadOf, trackingNumberOf } from '../data';
import { useSync } from '../shell';
import { formatClock } from '../format';
import { useSettings } from '../settings';
import type { OrderRecord } from '../data';

type Segment = 'active' | 'scheduled' | 'completed';

const TERMINAL = new Set(['completed', 'order_completed', 'canceled', 'order_canceled', 'failed']);

function segmentOf(order: OrderRecord): Segment {
    const status = String(order.status ?? '').toLowerCase();
    if (TERMINAL.has(status)) return 'completed';
    // Scheduled but not yet dispatched or started.
    if (!order.started_at && !order.dispatched_at && order.scheduled_at) return 'scheduled';
    return 'active';
}

/** Case-insensitive match across the fields a driver would actually search by. */
function matches(order: OrderRecord, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    const payload = payloadOf(order);
    return [
        trackingNumberOf(order),
        order.internal_id,
        customerNameOf(order),
        payload?.pickup?.address,
        payload?.dropoff?.address,
    ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
}

function toStops(order: OrderRecord, t: ReturnType<typeof useTranslation>['t']): OrderCardStop[] {
    const payload = payloadOf(order);
    const pickupName = payload.pickup?.name ?? payload.pickup?.address;
    const dropoffName = payload.dropoff?.name ?? payload.dropoff?.address;
    const stops: OrderCardStop[] = [];

    if (pickupName) {
        stops.push({
            name: String(pickupName),
            kind: 'pickup',
            detail: order.started_at
                ? t('ordersScreen.pickupDeparted', { time: formatClock(order.started_at) })
                : order.scheduled_at
                  ? t('ordersScreen.pickupScheduled', { time: formatClock(order.scheduled_at) })
                  : undefined,
        });
    }
    if (dropoffName) {
        stops.push({ name: String(dropoffName), kind: 'dropoff', detail: t('ordersScreen.dropoff') });
    }
    return stops;
}

export function OrdersScreen({ driverId, onOpenOrder }: { driverId?: string; onOpenOrder?: (id: string) => void }) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { units } = useSettings();
    const { isOnline } = useSync();

    const [segment, setSegment] = useState<Segment>('active');
    const [query, setQuery] = useState('');

    const { state, error, isRefreshing, refresh, retry } = useOrderQuery(
        { driver_assigned: driverId, limit: 50 },
        { enabled: !!driverId }
    );

    const all = useAllOrders();

    const rows = useMemo(
        () => all.filter((o) => segmentOf(o) === segment && matches(o, query)),
        [all, segment, query]
    );

    const segments = useMemo(
        () => [
            { value: 'active' as const, label: t('ordersScreen.segmentActive') },
            { value: 'scheduled' as const, label: t('ordersScreen.segmentScheduled') },
            { value: 'completed' as const, label: t('ordersScreen.segmentCompleted') },
        ],
        [t]
    );

    const renderItem = useCallback(
        ({ item }: { item: OrderRecord }) => {
            const payload = payloadOf(item);
            const waypointCount = payload.waypoints?.length ?? 0;

            return (
                <YStack paddingHorizontal={space[4]} paddingVertical={space[2]}>
                    <OrderCard
                        testID={`order-${item.id}`}
                        trackingNumber={displayIdOf(item)}
                        status={item.status}
                        stops={toStops(item, t)}
                        summary={
                            waypointCount > 1
                                ? `${t('ordersScreen.waypointCount', { count: waypointCount })} · ${t('ordersScreen.multiStop')}`
                                : undefined
                        }
                        distanceM={item.distance}
                        durationS={item.time}
                        itemCount={payload.entities?.length}
                        customerName={customerNameOf(item)}
                        units={units}
                        onPress={onOpenOrder ? () => onOpenOrder(item.id) : undefined}
                    />
                </YStack>
            );
        },
        [t, units, onOpenOrder]
    );

    const empty = useMemo(() => {
        if (state === 'loading') {
            return (
                <YStack padding={space[4]} gap={space[3]} testID="orders-skeleton">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} height={148} />
                    ))}
                </YStack>
            );
        }
        if (state === 'error') {
            return (
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="orders-error" />
            );
        }
        if (query) {
            return (
                <YStack padding={space[4]}>
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
            <YStack padding={space[4]}>
                <EmptyState
                    testID="orders-empty"
                    title={t(`ordersScreen.empty${key}Title`)}
                    body={t(`ordersScreen.empty${key}Body`)}
                />
            </YStack>
        );
    }, [state, error, query, segment, t, retry, isOnline]);

    return (
        <YStack flex={1} backgroundColor="$background" testID="orders-screen">
            <YStack paddingHorizontal={space[4]} paddingTop={space[3]} gap={space[3]}>
                <Segmented options={segments} value={segment} onChange={setSegment} testID="orders-segments" />
                <Field
                    value={query}
                    onChangeText={setQuery}
                    placeholder={t('ordersScreen.searchPlaceholder')}
                    autoCapitalize="none"
                    testID="orders-search"
                />
                {/* Offline is a state, not an error: cached rows stay usable. */}
            </YStack>

            <FlatList
                data={rows}
                keyExtractor={(o) => o.id}
                renderItem={renderItem}
                ListEmptyComponent={empty}
                contentContainerStyle={rows.length ? { paddingVertical: space[2] } : { flexGrow: 1 }}
                refreshControl={
                    <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={theme.primary?.val as string} />
                }
                // Long lists of cards: keep the window tight so scrolling a full
                // day of work does not mount every row.
                initialNumToRender={6}
                windowSize={7}
                removeClippedSubviews
                showsVerticalScrollIndicator={false}
            />
        </YStack>
    );
}

export default OrdersScreen;
