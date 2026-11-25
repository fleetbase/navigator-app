/**
 * Jobs — design round 3 (Route.dc.html, Work.dc.html, WorkMap.dc.html).
 *
 * The root of the Jobs tab: one header and a three-way switch over the same
 * day's work.
 *
 *   - **Route** — every waypoint in driving order, whichever order it is for.
 *   - **Orders** — the orders assigned to the driver, each showing its shape.
 *   - **Map** — the same waypoints on a map.
 *
 * The sequence comes from today's manifest when dispatch built one. Without a
 * manifest there is still work to show, so Route and Map fall back to the
 * active orders' own waypoints, one order after another, and Route says that
 * this is the order of the orders rather than a planned route. The switch
 * opens on Route when there is a manifest and on Orders when there is not,
 * until the driver picks for themselves.
 *
 * The file keeps its old name because the screen slot (`orders.list`) and the
 * route (`OrdersHome`) did not change; only what it shows did.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body } from '../ui/Text';
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
import { useSync } from '../shell';
import { useSettings } from '../settings';
import { GUTTER, ModeSwitch } from './jobs/parts';
import { countWaypoints, fromManifest, fromOrders, inWorkingOrder, orderMarks, segmentOf, type JobWaypoint } from './jobs/model';
import { JobsRoute } from './jobs/JobsRoute';
import { JobsOrders } from './jobs/JobsOrders';
import { JobsMap } from './jobs/JobsMap';

export type JobsMode = 'route' | 'orders' | 'map';

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
    /** Opens on this view instead of choosing by whether there is a manifest. */
    initialMode?: JobsMode;
    /** Changes identity each time another screen asks for `initialMode` again (the route's params). */
    modeRequest?: unknown;
    onOpenOrder?: (id: string) => void;
    /** Opens the offers screen: ad-hoc orders nearby that any driver can take. */
    onOpenOffers?: () => void;
    /** Opens a manifest waypoint's own screen. */
    onOpenStop?: (manifestId: string, stopId: string) => void;
    /** Opens the re-order preview for the manifest. */
    onOptimise?: (manifestId: string) => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
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

    // The driver's choice wins once made; until then the manifest decides.
    const [picked, setPicked] = useState<JobsMode | undefined>(initialMode);
    const mode: JobsMode = picked ?? (todays ? 'route' : 'orders');
    // Asked for again while already mounted — tabs keep their screens alive.
    useEffect(() => {
        if (initialMode) setPicked(initialMode);
    }, [initialMode, modeRequest]);

    const active = useMemo(() => inWorkingOrder(all.filter((o) => segmentOf(o) === 'active')), [all]);
    const marks = useMemo(() => orderMarks(active), [active]);

    const waypoints = useMemo<JobWaypoint[]>(
        // `all` is a dependency on purpose: a role is matched against the stored order, which may load later.
        () => (todays ? fromManifest(todays.id, stops, (id) => orderStore.get(id)) : fromOrders(active)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [todays?.id, stops, active, all]
    );
    const counts = useMemo(() => countWaypoints(waypoints), [waypoints]);

    /** Order id → the manifest's estimate for the next waypoint of that order. */
    const nextEtas = useMemo(() => {
        const etas = new Map<string, string>();
        for (const w of waypoints) {
            if (!w.orderId || !w.eta || w.state === 'done' || w.state === 'skipped' || etas.has(w.orderId)) continue;
            etas.set(w.orderId, w.eta);
        }
        return etas;
    }, [waypoints]);

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

    const modes = useMemo(
        () => [
            { value: 'route' as const, label: t('jobs.modeRoute') },
            { value: 'orders' as const, label: t('jobs.modeOrders') },
            { value: 'map' as const, label: t('jobs.modeMap') },
        ],
        [t]
    );

    const routeLoading = todays ? manifestDetail.isLoading : manifestList.isLoading || (orderQuery.state === 'loading' && !all.length);
    const routeError = todays ? (manifestDetail.failed ? manifestDetail.error : null) : orderQuery.state === 'error' ? orderQuery.error : null;

    return (
        <YStack flex={1} backgroundColor="$background" testID="orders-screen">
            <XStack paddingHorizontal={GUTTER} paddingTop={8} paddingBottom={12} alignItems="center" justifyContent="space-between" gap={12}>
                <Body fontSize={30} lineHeight={36} fontWeight="800" letterSpacing={-0.6} numberOfLines={1} accessibilityRole="header" testID="jobs-title">
                    {t('jobs.title')}
                </Body>
                <ModeSwitch options={modes} value={mode} onChange={setPicked} label={t('jobs.modeLabel')} testID="jobs-mode" />
            </XStack>

            {mode === 'route' ? (
                <JobsRoute
                    manifest={manifest}
                    stops={stops}
                    waypoints={waypoints}
                    counts={counts}
                    marks={marks}
                    units={units}
                    isOnline={isOnline}
                    isLoading={routeLoading}
                    error={routeError}
                    isRefreshing={manifestList.isRefreshing || manifestDetail.isRefreshing || orderQuery.isRefreshing}
                    onRefresh={refreshRoute}
                    onRetry={refreshRoute}
                    onOpenWaypoint={openWaypoint}
                    onOpenOrder={onOpenOrder}
                    onOptimise={todays && onOptimise ? () => onOptimise(todays.id) : undefined}
                    bottomSpace={bottomSpace}
                />
            ) : mode === 'orders' ? (
                <JobsOrders
                    orders={all}
                    marks={marks}
                    nextEtas={nextEtas}
                    notices={notices}
                    state={orderQuery.state}
                    error={orderQuery.error}
                    isOnline={isOnline}
                    isRefreshing={orderQuery.isRefreshing}
                    onRefresh={orderQuery.refresh}
                    onRetry={orderQuery.retry}
                    onOpenOrder={onOpenOrder}
                    onOpenOffers={onOpenOffers}
                    bottomSpace={bottomSpace}
                />
            ) : (
                <JobsMap waypoints={waypoints} units={units} onOpenWaypoint={openWaypoint} bottomSpace={bottomSpace} />
            )}
        </YStack>
    );
}

export default OrdersScreen;
