/**
 * Jobs — the simple Jobs design (JobsSimple*.dc.html).
 *
 * The root of the Jobs tab: one header, the same on every view (the title, a
 * Search button and an Offers button that carries a count when there are open
 * offers), and under it the four views of the driver's work:
 *
 *   - **Orders** — every order, with the one in hand in focus;
 *   - **Route** — every waypoint of the day in driving order, whichever order
 *     it is for;
 *   - **Map** — the same waypoints as one route on a map, with the way to
 *     optimise it;
 *   - **Schedule** — the orders by time: a date strip, a day, a week, a month.
 *
 * The day's sequence comes from today's manifest when dispatch built one.
 * Without a manifest there is still work to show, so Route and Map fall back
 * to the active orders' own waypoints, one order after another.
 *
 * The file keeps its old name because the screen slot (`orders.list`) and the
 * route (`OrdersHome`) did not change; only what it shows did.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../ui/Text';
import { Field } from '../ui/Field';
import { useTranslation } from '../i18n/useTranslation';
import { useTabBarSpace } from '../navigation/TabBar';
import {
    useAllOrders,
    useOrderQuery,
    useOrderNotices,
    useManifests,
    useManifest,
    groupManifests,
    orderStore,
    type ManifestStopRecord,
} from '../data';
import { secondsLeft, useOffers } from '../data/useOffers';
import { useDeviceLocation, useDuty, useSync } from '../shell';
import { useSettings } from '../settings';
import { Glyph, GUTTER, JobsTabs } from './jobs/parts';
import { countWaypoints, fromManifest, fromOrders, inWorkingOrder, pointTimes, segmentOf, type JobWaypoint } from './jobs/model';
import { JobsRoute } from './jobs/JobsRoute';
import { JobsOrders } from './jobs/JobsOrders';
import { JobsMap } from './jobs/JobsMap';
import { JobsSchedule } from './jobs/JobsSchedule';

export type JobsMode = 'orders' | 'route' | 'map' | 'schedule';

const MODES: readonly JobsMode[] = ['orders', 'route', 'map', 'schedule'];

/**
 * Whether the driver is online (working). Offers are only asked for while they
 * are, and their mark on the map is grey while they are not. Read without
 * insisting on the provider, so the screen can still be drawn on its own.
 */
function useOnDuty(): boolean {
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        return useDuty().duty !== 'off';
    } catch {
        return true;
    }
}

/** Running first, then ready to run, then still being built. Finished and cancelled routes are not today's work. */
const MANIFEST_RANK: Record<string, number> = { in_progress: 0, active: 1, draft: 2 };

/** One array for "no manifest", so the waypoint list is not rebuilt on every render. */
const NO_STOPS: ManifestStopRecord[] = [];

export function OrdersScreen({
    driverId,
    reloadToken = 0,
    initialMode,
    modeRequest,
    onOpenOrder,
    onOpenOffers,
    onOpenStop,
    onOptimise,
}: {
    driverId?: string;
    /** Bumped on screen focus: the orders and the manifest are asked again. */
    reloadToken?: number;
    /** Opens on this view instead of on Orders. */
    initialMode?: JobsMode;
    /** Changes identity each time another screen asks for `initialMode` again (the route's params). */
    modeRequest?: unknown;
    onOpenOrder?: (id: string) => void;
    /** Opens the offers screen: ad-hoc orders nearby that any driver can take. */
    onOpenOffers?: () => void;
    /** Opens a manifest waypoint's own screen. */
    onOpenStop?: (manifestId: string, stopId: string) => void;
    /** Opens the before / after preview that re-orders what is left of the manifest. */
    onOptimise?: (manifestId: string) => void;
}) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const onDuty = useOnDuty();
    const position = useDeviceLocation();
    const bottomSpace = useTabBarSpace();

    const orderQuery = useOrderQuery({ driver_assigned: driverId, limit: 50 }, { enabled: !!driverId });
    const all = useAllOrders();
    const notices = useOrderNotices();

    const manifestList = useManifests(driverId, reloadToken);
    const todays = useMemo(
        () => [...groupManifests(manifestList.manifests).today].filter((m) => String(m.status) in MANIFEST_RANK).sort((a, b) => MANIFEST_RANK[String(a.status)] - MANIFEST_RANK[String(b.status)])[0],
        [manifestList.manifests]
    );
    const manifestDetail = useManifest(todays?.id, reloadToken);
    const manifest = todays ? (manifestDetail.manifest ?? todays) : undefined;
    const stops = todays ? manifestDetail.stops : NO_STOPS;

    // Opens on Orders, the first view, unless another screen asked for one.
    const [mode, setMode] = useState<JobsMode>(initialMode && MODES.includes(initialMode) ? initialMode : 'orders');
    // Asked for again while already mounted — tabs keep their screens alive.
    useEffect(() => {
        if (initialMode && MODES.includes(initialMode)) setMode(initialMode);
    }, [initialMode, modeRequest]);

    // Search is the header's, and what it finds is orders: opening it shows the Orders view.
    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');
    const closeSearch = useCallback(() => {
        // Closing the search clears it, or the list stays filtered by a field nobody can see.
        setQuery('');
        setSearching(false);
    }, []);
    const pickMode = useCallback(
        (next: JobsMode) => {
            if (next !== 'orders') closeSearch();
            setMode(next);
        },
        [closeSearch]
    );

    // Offers this driver could take, while they are online. An offer whose time has run out is not one.
    const offersQuery = useOffers(onDuty ? driverId : undefined);
    const offers = useMemo(() => (offersQuery.offers ?? []).filter((order) => secondsLeft(order) !== 0), [offersQuery.offers]);

    const active = useMemo(() => inWorkingOrder(all.filter((o) => segmentOf(o) === 'active')), [all]);

    const waypoints = useMemo<JobWaypoint[]>(
        // `all` is a dependency on purpose: a role is matched against the stored order, which may load later.
        () => (todays ? fromManifest(todays.id, stops, (id) => orderStore.get(id)) : fromOrders(active)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [todays?.id, stops, active, all]
    );
    const counts = useMemo(() => countWaypoints(waypoints), [waypoints]);

    /** What the day's plan says about each place of each order: when the driver is due, or when they got there. */
    const times = useMemo(() => pointTimes(waypoints), [waypoints]);

    const openWaypoint = useCallback(
        (waypoint: JobWaypoint) => {
            // A manifest waypoint has its own screen; one worked out from an order opens that order.
            if (waypoint.manifestId && waypoint.stopId && onOpenStop) onOpenStop(waypoint.manifestId, waypoint.stopId);
            else if (waypoint.orderId) onOpenOrder?.(waypoint.orderId);
        },
        [onOpenStop, onOpenOrder]
    );

    const refreshRoute = useCallback(() => {
        void manifestList.refresh();
        void manifestDetail.refresh();
        void orderQuery.refresh();
    }, [manifestList, manifestDetail, orderQuery]);

    const refreshOrders = useCallback(() => {
        void orderQuery.refresh();
        void offersQuery.reload();
    }, [orderQuery, offersQuery]);

    const modes = useMemo(
        () => [
            { value: 'orders' as const, label: t('jobs.modeOrders') },
            { value: 'route' as const, label: t('jobs.modeRoute') },
            { value: 'map' as const, label: t('jobs.modeMap') },
            { value: 'schedule' as const, label: t('jobs.modeSchedule') },
        ],
        [t]
    );

    const routeLoading = todays ? manifestDetail.isLoading : manifestList.isLoading || (orderQuery.state === 'loading' && !all.length);
    const routeError = todays ? (manifestDetail.failed ? manifestDetail.error : null) : orderQuery.state === 'error' ? orderQuery.error : null;

    return (
        <YStack flex={1} backgroundColor="$background" testID="orders-screen">
            <XStack paddingHorizontal={GUTTER} paddingTop={4} alignItems="center" gap={8}>
                <Body flex={1} fontSize={30} lineHeight={48} fontWeight="800" letterSpacing={-0.6} numberOfLines={1} accessibilityRole="header" testID="jobs-title">
                    {t('jobs.title')}
                </Body>
                <YStack
                    width={48}
                    height={48}
                    borderRadius={24}
                    alignItems="center"
                    justifyContent="center"
                    borderWidth={1}
                    borderColor={searching ? '$primary' : '$border'}
                    backgroundColor="$surface"
                    onPress={() => {
                        if (searching) closeSearch();
                        else {
                            setMode('orders');
                            setSearching(true);
                        }
                    }}
                    pressStyle={{ opacity: 0.6 }}
                    accessibilityRole="button"
                    accessibilityLabel={t(searching ? 'jobs.orders.closeSearch' : 'jobs.searchLabel')}
                    testID="orders-search-toggle"
                >
                    <Glyph name={searching ? 'close' : 'search'} size={20} strokeWidth={2.6} />
                </YStack>
                {onOpenOffers ? (
                    // Amber with a count while there is an offer to look at; a plain button otherwise. The count is a number beside the word, never the colour alone.
                    <XStack
                        height={48}
                        alignItems="center"
                        gap={8}
                        paddingStart={14}
                        paddingEnd={offers.length ? 10 : 14}
                        borderRadius={24}
                        borderWidth={1}
                        borderColor={offers.length ? '$warningBorder' : '$border'}
                        backgroundColor={offers.length ? '$warningFill' : '$surface'}
                        onPress={onOpenOffers}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        accessibilityLabel={offers.length ? t('jobs.offers.buttonOpen', { count: offers.length }) : t('jobs.offers.button')}
                        testID="jobs-offers"
                    >
                        <Glyph name="bolt" size={16} color={(offers.length ? theme.warningText?.val : theme.textSecondary?.val) as string} />
                        <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1} tone={offers.length ? 'warning' : 'primary'}>
                            {t('jobs.offers.button')}
                        </Body>
                        {offers.length ? (
                            <YStack minWidth={26} height={26} paddingHorizontal={6} borderRadius={13} alignItems="center" justifyContent="center" backgroundColor="$warning" testID="jobs-offers-count">
                                {/* Dark ink on amber in every scheme: the amber does not change with the theme. */}
                                <Body fontSize={15} lineHeight={20} fontWeight="800" tabular color="#1D1808">
                                    {offers.length}
                                </Body>
                            </YStack>
                        ) : null}
                    </XStack>
                ) : null}
            </XStack>

            <YStack paddingHorizontal={GUTTER} paddingTop={12} paddingBottom={mode === 'map' ? 12 : 0}>
                <JobsTabs options={modes} value={mode} onChange={pickMode} label={t('jobs.modeLabel')} testID="jobs-mode" />
            </YStack>

            {searching && mode === 'orders' ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                    <Field value={query} onChangeText={setQuery} placeholder={t('ordersScreen.searchPlaceholder')} autoCapitalize="none" testID="orders-search" />
                </YStack>
            ) : null}

            {mode === 'orders' ? (
                <JobsOrders
                    orders={all}
                    times={times}
                    notices={notices}
                    offers={offers}
                    position={position}
                    units={units}
                    query={searching ? query : ''}
                    onClearQuery={() => setQuery('')}
                    state={orderQuery.state}
                    error={orderQuery.error}
                    isOnline={isOnline}
                    isRefreshing={orderQuery.isRefreshing}
                    onRefresh={refreshOrders}
                    onRetry={orderQuery.retry}
                    onOpenOrder={onOpenOrder}
                    onOpenOffers={onOpenOffers}
                    bottomSpace={bottomSpace}
                />
            ) : mode === 'route' ? (
                <JobsRoute
                    manifest={manifest}
                    stops={stops}
                    waypoints={waypoints}
                    counts={counts}
                    units={units}
                    isOnline={isOnline}
                    isLoading={routeLoading}
                    error={routeError}
                    isRefreshing={manifestList.isRefreshing || manifestDetail.isRefreshing || orderQuery.isRefreshing}
                    onRefresh={refreshRoute}
                    onRetry={refreshRoute}
                    onOpenWaypoint={openWaypoint}
                    onOpenOrder={onOpenOrder}
                    bottomSpace={bottomSpace}
                />
            ) : mode === 'map' ? (
                <JobsMap
                    manifest={manifest}
                    waypoints={waypoints}
                    counts={counts}
                    units={units}
                    isOnline={isOnline}
                    offDuty={!onDuty}
                    onOpenWaypoint={openWaypoint}
                    onOptimise={todays && onOptimise ? () => onOptimise(todays.id) : undefined}
                    bottomSpace={bottomSpace}
                />
            ) : (
                <JobsSchedule driverId={driverId} orders={all} times={times} isRefreshing={orderQuery.isRefreshing} onRefresh={refreshOrders} onOpenOrder={onOpenOrder} bottomSpace={bottomSpace} />
            )}
        </YStack>
    );
}

export default OrdersScreen;
