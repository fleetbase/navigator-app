/**
 * Home — the signed-in dashboard, design round 3 (mockups s25 `Home` and s26
 * `HomeLight`, the same screen in the two themes).
 *
 * One layout in every state: the map is the whole background, showing the
 * driver; the organisation and the driver's status are fixed over its top; and
 * a sheet over its bottom, which can be pulled down to see more map but never
 * up over the chips, carries, in this order, a hero, a card of
 * figures, the action row, the day's progress line, and a list of rows. What
 * changes between states is only what fills those places:
 *
 *   - **Online with a next waypoint**: the waypoint, its arrival figures,
 *     Navigate and Open.
 *   - **Offline**: the first waypoint and what is assigned today, with Go
 *     online where Navigate sits.
 *   - **Online with nothing assigned**: says so; the map centres on the driver.
 *   - **Every waypoint done**: the day's summary, with Go offline.
 *
 * The day is the manifest's waypoints when the driver has one, plus the
 * waypoints of any order the manifest does not cover (see `home/homeModel`).
 *
 * Time online, distance driven and the end-of-day counts come from the
 * server's day summary (`useDaySummary`) when it has one; against an older
 * server, or with work still waiting to send, the screen's own figures stand.
 *
 * What the mockups draw that this screen leaves out, because nothing on the
 * driver API supplies it: how far an offered job is from the driver's route
 * (the offers row names the pickup instead), and a one-tap "I'm here" (arrival
 * is recorded on the waypoint's own screen, which the second button opens).
 * The tracker reports `is_delayed` as a constant `false`, so "on time" is only
 * ever said when the waypoint has a time window to compare the arrival against.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderNotices } from './jobs/OrderNotices';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings, useResolvedScheme } from '../settings';
import { useDuty, useSync, useDeviceLocation } from '../shell';
import { useShell } from '../navigation/DriverShell';
import { useTabBarSpace } from '../navigation/TabBar';
import { BigButton, CARD_RADIUS } from '../onboarding/AuthScaffold';
import {
    useActiveOrders,
    useAllOrders,
    useWeekSummary,
    cashOnDeliveryOf,
    deliveryInstructionsOf,
    isOrderFinished,
    isOrderAbandoned,
    trackingNumberOf,
    useOrdersOnDay,
    useOrderQuery,
    useOrderNotices,
    useManifests,
    useManifest,
    useTracker,
    useDriver,
    useInspectionForms,
    useInspectionHistory,
    usePendingInspections,
    useChatUnreadTotal,
    orderStore,
    chooseEta,
    decodePolyline,
    haversineM,
    payloadOf,
    vehicleOf,
    vehicleDescription,
    type ChosenEta,
} from '../data';
import { dayKey } from '../data/orderStore';
import { useOffers as useOpenOffers } from '../data/useOffers';
import { secondsOnDuty, useDaySummary } from '../data/useDaySummary';
import { useLiveRefresh } from '../realtime/liveRefresh';
import { formatClock, formatDay, formatDuration, formatMeters, formatMoney } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { HomeMap } from './home/HomeMap';
import { buildDay, firstNameOf, pickTodayManifest, secondsBetween, trackerIsFor, type HomeDay, type HomeWaypoint } from './home/homeModel';
import { Card, DutyChip, EntryCard, HeroBadge, HomeIcon, OrgChip, Rise, SectionLabel, SegmentBar, StatCard, SummaryRow, WaypointRow, WeekCard, Shortcuts, JobCard, FactChips, type FactChip, type Stat, type WeekBar } from './home/parts';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Destination = { latitude: number; longitude: number; label?: string };

export interface TodayScreenProps {
    driverId?: string;
    reloadToken?: number;
    onOpenOrder?: (orderId: string) => void;
    /** A manifest waypoint opens its own screen, not the order's. */
    onOpenWaypoint?: (manifestId: string, stopId: string) => void;
    /** `orderId` lets the hand-off follow the order's current destination. */
    onNavigate?: (destination: Destination, orderId?: string) => void;
    onOpenOffers?: () => void;
    onOpenSyncQueue?: () => void;
    onOpenInspection?: (vehicleId?: string, vehicleName?: string) => void;
    onOpenVehicle?: () => void;
    /** The organisation chip opens the switcher. */
    onOpenOrganizations?: () => void;
    onOpenChat?: () => void;
    onLogFuel?: () => void;
    onReportIssue?: () => void;
}

/** How much of the map shows between the status bar and the sheet where the sheet rests. */
const MAP_SHOWING = 250;
/** The part of that taken by the chips floating over the map. */
const CHIPS_ROOM = 56;
/** What stays of the sheet when it is pulled down: its handle and the header block. */
const PEEK_BODY = 128;
/** The gap between the sheet's blocks. */
const SHEET_GAP = 14;

/** The hero's text: an eyebrow, a title, and whatever lines there are under it. */
function HeroText({ eyebrow, eyebrowTone = 'brand', title, lines = [], mono, titleTestID = 'home-next-name' }: { eyebrow: string; eyebrowTone?: 'brand' | 'success' | 'muted'; title: string; lines?: (string | undefined)[]; mono?: string; titleTestID?: string }) {
    return (
        <YStack flex={1} gap={3} minWidth={0}>
            <SectionLabel tone={eyebrowTone} weight="700">
                {eyebrow}
            </SectionLabel>
            <Body fontSize={21} lineHeight={25} fontWeight="800" letterSpacing={-0.2} testID={titleTestID}>
                {title}
            </Body>
            {lines.filter(Boolean).map((line) => (
                <Secondary key={line} fontSize={14} lineHeight={19}>
                    {line}
                </Secondary>
            ))}
            {mono ? (
                // Never truncated: the driver reads this out, or matches it to a label.
                <Secondary fontFamily="$mono" fontSize={13} lineHeight={18} selectable testID="home-next-tracking">
                    {mono}
                </Secondary>
            ) : null}
        </YStack>
    );
}

export function TodayScreen({
    driverId,
    reloadToken = 0,
    onOpenOrder,
    onOpenWaypoint,
    onNavigate,
    onOpenOffers,
    onOpenSyncQueue,
    onOpenInspection,
    onOpenVehicle,
    onOpenOrganizations,
    onOpenChat,
    onLogFuel,
    onReportIssue,
}: TodayScreenProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const screen = useScreenStyle();
    const tabBarSpace = useTabBarSpace();
    const { units } = useSettings();
    const scheme = useResolvedScheme();
    const { organizationName, driverName, openDutySheet, openOrgSheet } = useShell();
    const { duty, isChanging, setDuty, error: dutyError } = useDuty();
    const { isOnline, queuedCount, syncState, lastSyncedCount } = useSync();
    /*
     * The map runs to the very top of the screen, under the status bar. The shell
     * normally pads every screen down by the status bar's height; this screen asks
     * it not to (see `setBleedTop`) and gives that height to the map. The one
     * exception is while the shell is showing its strip about signal or syncing
     * (same conditions as shell/OfflineBar): that strip sits where the map would
     * go, and it matters more than the bleed.
     */
    const insets = useSafeAreaInsets();
    const bleed = insets.top;
    // Ask the shell to give up its status-bar padding while this screen is in front.
    const { setBleedTop } = useShell();
    useFocusEffect(
        useCallback(() => {
            setBleedTop(true);
            return () => setBleedTop(false);
        }, [setBleedTop])
    );
    const position = useDeviceLocation();
    const unreadChat = useChatUnreadTotal();
    const onDuty = duty !== 'off';

    /* -- The day's work ---------------------------------------------------- */

    // The query fills the store; the selectors read it. Same split as Jobs, so
    // both surfaces show the same rows without fetching twice.
    const ordersQuery = useOrderQuery({ driver_assigned: driverId, limit: 50 }, { enabled: !!driverId });
    const activeOrders = useActiveOrders();
    const dayOrders = useOrdersOnDay();
    const notices = useOrderNotices();

    const manifestsQuery = useManifests(driverId, reloadToken);
    const todayManifestId = useMemo(() => pickTodayManifest(manifestsQuery.manifests)?.id, [manifestsQuery.manifests]);
    // The list row has no waypoints; the detail read does.
    const manifestQuery = useManifest(todayManifestId, reloadToken);
    const manifest = manifestQuery.manifest;

    const day: HomeDay = useMemo(() => buildDay({ manifest, activeOrders, dayOrders }), [manifest, activeOrders, dayOrders]);
    const next = day.next;

    // Re-asked when the server says something moved (a new drop-off changes the next waypoint).
    const revision = useLiveRefresh();
    const trackerQuery = useTracker(onDuty ? next?.orderId : undefined, reloadToken + revision);
    // The hook keeps its last answer while the next one loads, so it may still be about another place.
    const tracker = trackerIsFor(trackerQuery.tracker, next) ? trackerQuery.tracker : null;

    /* -- Around the work ---------------------------------------------------- */

    const offersQuery = useOpenOffers(onDuty ? driverId : undefined);
    const offers = offersQuery.offers ?? [];

    const driverQuery = useDriver(driverId, null, reloadToken);
    const vehicle = vehicleOf(driverQuery.driver);
    const vehicleName = vehicleDescription(vehicle) ?? vehicle?.name ?? undefined;
    const vehiclePlate = vehicle?.plate_number ?? undefined;

    /*
     * The server's own count of the day. Asked again once a change of status
     * has gone through, so the time online starts and stops with the chip. With
     * work still waiting to send the server has not heard all of it, so its
     * counts are set aside and the screen's own are shown; time online and
     * distance are still its to give.
     */
    const [summaryPulls, setSummaryPulls] = useState(0);
    const { summary, fetchedAt: summaryAt } = useDaySummary(driverId, `${reloadToken}:${duty}:${isChanging}:${summaryPulls}`, dayKey());
    // An answer about another day (the phone crossed midnight, or the server cut the day elsewhere) is not today's.
    const todaySummary = summary && summary.date === dayKey() ? summary : null;
    const serverCounts = todaySummary && queuedCount === 0 ? todaySummary : null;
    const onDutySince = onDuty && !isChanging ? (todaySummary?.online_since ?? null) : null;

    /*
     * A pre-trip check is due when the organisation has published a pre-trip
     * form for this vehicle and nothing was filed against the vehicle today.
     * The server has no "due" flag, so this is the same rule a driver would
     * apply reading the history; it stays quiet until the history has loaded,
     * so the card never flashes up and away.
     */
    const forms = useInspectionForms(vehicle?.id, reloadToken);
    const history = useInspectionHistory({ vehicle: vehicle?.id }, reloadToken);
    const pendingInspections = usePendingInspections();
    const { inspectionDue, checkedToday } = useMemo(() => {
        // A refresh keeps the last answer on screen; only a first load or a failure is "not known yet".
        const known = (state: string) => state === 'ready' || state === 'refreshing';
        if (!vehicle?.id || !known(history.state)) return { inspectionDue: false, checkedToday: undefined };
        const isPreTrip = (type: unknown) => String(type ?? '').toLowerCase() === 'pre_trip';
        const today = dayKey();
        const whenOf = (s: (typeof history.submissions)[number]) => s.submitted_at ?? s.started_at ?? (s.created_at as string | undefined);
        // Today's pre-trip check of this vehicle, the latest when there are several: the vehicle row says when it was done.
        const filedToday = [...history.submissions, ...pendingInspections]
            .filter((s) => {
                const when = whenOf(s);
                const sameVehicle = !s.vehicle?.id || s.vehicle.id === vehicle.id;
                return isPreTrip(s.type) && sameVehicle && !!when && dayKey(when) === today;
            })
            .sort((a, b) => String(whenOf(b)).localeCompare(String(whenOf(a))))[0];
        const hasForm = known(forms.state) && forms.forms.some((form) => isPreTrip(form.type));
        return { inspectionDue: hasForm && !filedToday, checkedToday: filedToday ? { at: whenOf(filedToday) as string, record: filedToday } : undefined };
    }, [vehicle?.id, forms.state, forms.forms, history.state, history.submissions, pendingInspections]);

    /* -- The week, the next job and the last one: what Home shows with nothing to drive to -- */

    const allOrders = useAllOrders();
    const ordersById = useMemo(() => new Map(allOrders.map((order) => [order.id, order])), [allOrders]);
    const week = useWeekSummary(driverId, `${reloadToken}:${summaryPulls}`, day.total === 0);
    const { comingUp, lastJob } = useMemo(() => {
        const today = dayKey();
        const mine = allOrders.filter((order) => !order.adhoc || !!order.driver_assigned);
        const stamp = (order: (typeof allOrders)[number], field: string) => String((order as Record<string, unknown>)[field] ?? '');
        const upcoming = mine
            .filter((order) => !isOrderFinished(order) && !isOrderAbandoned(order) && !!order.scheduled_at && dayKey(order.scheduled_at) > today)
            .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)))[0];
        const finished = mine
            .filter((order) => isOrderFinished(order) && !isOrderAbandoned(order))
            .sort((a, b) => (stamp(b, 'updated_at') || stamp(b, 'created_at')).localeCompare(stamp(a, 'updated_at') || stamp(a, 'created_at')))[0];
        return { comingUp: upcoming, lastJob: finished };
    }, [allOrders]);

    /* -- Refresh ------------------------------------------------------------ */

    const [pulling, setPulling] = useState(false);
    const refreshAll = useCallback(async () => {
        setPulling(true);
        setSummaryPulls((n) => n + 1);
        try {
            await Promise.all([
                ordersQuery.refresh(),
                manifestsQuery.refresh(),
                manifestQuery.refresh(),
                trackerQuery.retry(),
                offersQuery.reload(),
                driverQuery.retry(),
                history.refresh(),
            ]);
        } finally {
            setPulling(false);
        }
        // The hooks' callbacks are stable per query; listing the objects would refire on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ordersQuery.refresh, manifestsQuery.refresh, manifestQuery.refresh, trackerQuery.retry, offersQuery.reload, driverQuery.retry, history.refresh]);



    /* -- Pieces shared by the states ---------------------------------------- */

    const firstName = firstNameOf(driverName);
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const openWaypoint = (waypoint: HomeWaypoint) => {
        if (waypoint.source === 'manifest' && waypoint.manifestId && waypoint.stopId && onOpenWaypoint) onOpenWaypoint(waypoint.manifestId, waypoint.stopId);
        else if (waypoint.orderId) onOpenOrder?.(waypoint.orderId);
    };
    const canOpen = (waypoint: HomeWaypoint) => (waypoint.source === 'manifest' && !!onOpenWaypoint) || (!!waypoint.orderId && !!onOpenOrder);

    // One line however many orders left, clearing itself: see OrderNotices.
    const noticeBanners = notices.length ? <OrderNotices notices={notices} testID="today-notices" /> : null;

    const dutyErrorBanner = dutyError ? <Banner tone="danger" message={t('home.duty.failed')} meta={dutyError.message} testID="home-duty-error" /> : null;

    /* -- What the tracker says about the next waypoint (online only) --------- */

    const eta: ChosenEta = tracker ? chooseEta(tracker) : { kind: 'none', stale: false };
    const etaAt = eta.kind === 'none' ? undefined : (eta.at ?? (eta.seconds != null ? new Date(Date.now() + eta.seconds * 1000).toISOString() : undefined));
    const insights = tracker?.insights;
    // The road to the next waypoint, for the map. Empty while offline, when the map draws the day's road instead.
    const route = useMemo(() => (tracker ? decodePolyline(tracker.route?.polyline) : []), [tracker]);

    /* -- Loading and failure ------------------------------------------------ */

    const nothingYet = day.total === 0;
    const cold = !!driverId && nothingYet && (ordersQuery.state === 'loading' || ordersQuery.state === 'idle' || manifestsQuery.isLoading || (!!todayManifestId && manifestQuery.isLoading));
    const failed = !cold && nothingYet && ordersQuery.state === 'error';

    /* -- The rows under the progress line ------------------------------------ */

    const offersCard =
        onDuty && offers.length > 0 ? (
            <EntryCard
                key="offers"
                icon="bolt"
                accent="warning"
                title={t('home.offers.title', { count: offers.length })}
                body={(() => {
                    const pickup = payloadOf(offers[0]).pickup;
                    const place = pickup?.name ?? pickup?.address;
                    return place ? t('home.offers.pickupAt', { place }) : t('home.offers.body');
                })()}
                onPress={onOpenOffers}
                testID="home-offers"
            />
        ) : null;

    // With a check due, the check's row names the vehicle; otherwise the vehicle has its own, saying when it was checked.
    const hasVehicle = !!vehicle && (!!vehicleName || !!vehiclePlate);
    const failedItems = Number(checkedToday?.record.failed_items ?? 0) || 0;
    const checkedClean = !!checkedToday && (checkedToday.record.has_failures === false || checkedToday.record.result === 'passed') && failedItems === 0;
    const vehicleBody = !checkedToday
        ? t('home.vehicle.assigned')
        : failedItems > 0
          ? t('home.vehicle.checkedDefects', { time: formatClock(checkedToday.at), count: failedItems })
          : checkedClean
            ? t('home.vehicle.checkedClean', { time: formatClock(checkedToday.at) })
            : t('home.vehicle.checked', { time: formatClock(checkedToday.at) });

    // Only what is true right now; a row with nothing behind it is not drawn.
    const rows = [
        offersCard,
        inspectionDue ? (
            <EntryCard
                key="inspection"
                icon="check"
                tone="warning"
                title={t('home.attention.inspection')}
                body={vehicleName}
                mono={vehiclePlate}
                onPress={onOpenInspection ? () => onOpenInspection(vehicle?.id, vehicleName) : undefined}
                testID="home-attention-inspection"
            />
        ) : null,
        queuedCount > 0 ? (
            <EntryCard key="sync" icon="upload" title={t('home.attention.unsent', { count: queuedCount })} body={isOnline ? t('home.attention.unsentOnline') : t('home.attention.unsentOffline')} onPress={onOpenSyncQueue} testID="home-attention-sync" />
        ) : null,
        unreadChat > 0 ? (
            <EntryCard key="chat" icon="chat" title={t('home.attention.unread', { count: unreadChat })} body={t('home.attention.unreadBody')} count={unreadChat} onPress={onOpenChat} testID="home-attention-chat" />
        ) : null,
        hasVehicle && !inspectionDue ? (
            <EntryCard key="vehicle" icon="vehicle" title={vehicleName ?? t('home.vehicle.yours')} body={vehicleBody} mono={vehiclePlate} onPress={onOpenVehicle} testID="home-vehicle" />
        ) : null,
    ].filter(Boolean);

    /* -- What fills the sheet, by state --------------------------------------- */

    let hero: ReactNode = null;
    let stats: Stat[] = [];
    let statsTestID = 'home-stats';
    let notes: ReactNode = null;
    let actions: ReactNode = null;
    let summaryList: ReactNode = null;
    let extras: ReactNode = null;
    let facts: FactChip[] = [];
    let peek: ReactNode = null;
    let state: 'loading' | 'error' | 'end' | 'next' | 'before' | 'empty' = 'empty';

    const goOnline = (
        <BigButton onPress={() => void setDuty('on')} loading={isChanging} icon={<HomeIcon name="power" color={theme.onPrimary?.val as string} />} gap={10} testID="home-go-on-duty">
            {t('home.before.goOnDuty')}
        </BigButton>
    );
    // Said under "Go online", because that tap is what starts the sharing.
    const locationNote = (
        <Micro center fontSize={12} lineHeight={16} testID="home-location-note">
            {organizationName ? t('home.before.locationNote', { organization: organizationName }) : t('home.before.locationNoteNoOrg')}
        </Micro>
    );
    // The mockup's second button: as wide as its words, beside the primary one.
    const openNext = (waypoint: HomeWaypoint) =>
        canOpen(waypoint) ? (
            <YStack flexShrink={0}>
                <BigButton variant="secondary" fullWidth={false} paddingHorizontal={20} onPress={() => openWaypoint(waypoint)} testID="today-open-order">
                    {waypoint.source === 'manifest' ? t('home.hero.openWaypoint') : t('today.openOrder')}
                </BigButton>
            </YStack>
        ) : null;

    const placeLine = (order: (typeof allOrders)[number]) => {
        const payload = payloadOf(order);
        const from = payload.pickup?.name ?? payload.pickup?.address;
        const to = payload.dropoff?.name ?? payload.dropoff?.address;
        return [from, to].filter(Boolean).join(' → ') || undefined;
    };
    const itemCount = (order?: (typeof allOrders)[number]) => (order ? (payloadOf(order).entities?.length ?? 0) : 0);

    if (cold) {
        state = 'loading';
    } else if (failed) {
        state = 'error';
    } else if (day.allDone) {
        state = 'end';
        // The server's counts when it has them; the screen's own otherwise.
        const counted = serverCounts?.waypoints;
        const completed = counted ? counted.completed : day.done - day.skipped;
        const total = counted ? counted.total : day.total;
        const skipped = counted ? counted.skipped : day.skipped;
        const ordersDone = serverCounts?.orders_completed;
        const plannedM = serverCounts?.planned_distance_m ?? day.plannedDistanceM;
        const drivenM = todaySummary?.distance_driven_m;
        const onlineSeconds = secondsOnDuty(todaySummary, summaryAt);
        const cashRows: { currency?: string | null; amount: number; orders: number }[] = serverCounts?.cash_on_delivery_due ?? day.cash;
        const routeSeconds = secondsBetween(day.manifest?.started_at, day.manifest?.completed_at);

        hero = (
            <XStack alignItems="flex-start" gap={space[3]} testID="home-end">
                <HeroBadge icon="tick" tone="success" />
                <HeroText
                    eyebrowTone="success"
                    eyebrow={day.manifest?.completed_at ? t('home.end.finishedAt', { time: formatClock(day.manifest.completed_at) }) : t('home.end.finished')}
                    title={firstName ? t('home.end.title', { name: firstName }) : t('home.end.titleNoName')}
                    titleTestID="home-end-title"
                />
            </XStack>
        );
        statsTestID = 'home-end-stats';
        stats = [
            { key: 'waypoints', value: t('home.end.ofTotal', { done: completed, total }), label: t('home.end.waypoints') },
            ordersDone != null
                ? { key: 'orders', value: String(ordersDone), label: t('home.end.ordersCompleted', { count: ordersDone }) }
                : { key: 'orders', value: day.finishedOrderCount === day.orderCount ? String(day.orderCount) : t('home.end.ofTotal', { done: day.finishedOrderCount, total: day.orderCount }), label: t('home.end.orders', { count: day.orderCount }) },
            ...(onlineSeconds ? [{ key: 'duty', value: formatDuration(onlineSeconds), label: t('home.end.onDuty') }] : []),
            // Measured from the positions this phone reported, so it is only there when the server could measure it.
            ...(drivenM ? [{ key: 'driven', value: formatMeters(drivenM, units), label: t('home.end.driven') }] : []),
            // The plan's length, labelled as that.
            ...(plannedM ? [{ key: 'distance', value: formatMeters(plannedM, units), label: t('home.end.plannedRoute') }] : []),
            ...(routeSeconds ? [{ key: 'time', value: formatDuration(routeSeconds), label: t('home.end.routeTime') }] : []),
        ];
        const summaryRows: { key: string; kind: 'ok' | 'attention'; title: string; body?: string; value?: string }[] = [
            ...cashRows.map((cash) => ({
                key: `cash-${cash.currency ?? ''}`,
                kind: 'attention' as const,
                title: t('home.end.cash'),
                body: t('home.end.cashBody', { count: cash.orders }),
                value: formatMoney(cash.amount, cash.currency ?? undefined),
            })),
            ...(skipped > 0 ? [{ key: 'skipped', kind: 'attention' as const, title: t('home.end.skipped'), body: t('home.end.skippedBody'), value: String(skipped) }] : []),
            // Unsent work has its own row below, which opens the queue; this one only ever confirms there is none.
            ...(queuedCount === 0 ? [{ key: 'sent', kind: 'ok' as const, title: t('home.end.allSent'), body: t('home.end.allSentBody') }] : []),
        ];
        summaryList = summaryRows.length ? (
            <Card padded={false} testID="home-end-list">
                {summaryRows.map((row, index) => (
                    <SummaryRow key={row.key} kind={row.kind} title={row.title} body={row.body} value={row.value} first={index === 0} testID={`home-end-${row.key}`} />
                ))}
            </Card>
        ) : null;
        // "Log a fill-up first" is too long to share a row with the primary action without one of them shrinking, so it sits under it.
        actions =
            onDuty || onLogFuel ? (
                <YStack gap={space[2]}>
                    {onDuty ? (
                        <BigButton onPress={openDutySheet} testID="home-go-off-duty">
                            {t('home.end.goOffDuty')}
                        </BigButton>
                    ) : null}
                    {onLogFuel ? (
                        <BigButton variant="secondary" onPress={onLogFuel} testID="home-log-fuel">
                            {onDuty ? t('home.end.logFuel') : t('home.end.logFuelOnly')}
                        </BigButton>
                    ) : null}
                </YStack>
            ) : null;
    } else if (next && onDuty) {
        state = 'next';
        // The first leg ends at the waypoint being headed to, so its length is the road distance to it.
        const roadM = tracker?.route?.legs?.[0]?.distance_m;
        const straightM = position && next.point ? haversineM(position, next.point) : undefined;
        const arrived = manifest?.stops?.find((stop) => stop.id === next.stopId)?.status === 'arrived';

        if (etaAt && eta.kind === 'live') stats.push({ key: 'arrive', value: formatClock(etaAt), label: t('home.hero.arrive') });
        else if (etaAt && eta.kind === 'start') stats.push({ key: 'start', value: formatClock(etaAt), label: t('home.hero.start') });
        else if (next.plannedAt) stats.push({ key: 'planned', value: formatClock(next.plannedAt), label: t('home.hero.planned') });

        if (roadM != null && Number.isFinite(Number(roadM))) {
            stats.push({
                key: 'distance',
                value: formatMeters(Number(roadM), units),
                label: eta.kind === 'live' && eta.seconds != null ? t('home.hero.away', { duration: formatDuration(eta.seconds) }) : t('home.hero.byRoad'),
            });
        } else if (straightM != null) {
            // Not a road distance, and it says so.
            stats.push({ key: 'distance', value: formatMeters(straightM, units), label: t('home.hero.straightLine') });
        }

        // The waypoint's own window, else the one the tracker reports for where the driver is heading.
        const windowEnd = next.windowEnd ?? (eta.kind === 'live' ? (insights?.due_by ?? undefined) : undefined);
        if (windowEnd) {
            const due = formatClock(windowEnd);
            if (etaAt && eta.kind === 'live') {
                const late = Date.parse(etaAt) > Date.parse(windowEnd);
                stats.push({ key: 'due', value: late ? t('home.hero.late') : t('home.hero.onTime'), tone: late ? 'danger' : 'success', label: t('home.hero.dueBy', { time: due }) });
            } else {
                stats.push({ key: 'due', value: due, label: t('home.hero.deliverBy') });
            }
        }
        statsTestID = `today-eta-${eta.kind}`;

        const kindLabel = next.kind ? t(`home.kind.${next.kind}`) : undefined;
        hero = (
            <XStack alignItems="flex-start" gap={space[3]}>
                <HeroBadge number={next.number} />
                <HeroText
                    eyebrow={[arrived ? t('home.hero.arrived') : t('home.hero.next'), kindLabel].filter(Boolean).join(' · ')}
                    title={next.name ?? next.address ?? t('today.noStopRecorded')}
                    lines={[next.name ? next.address : undefined]}
                    mono={next.trackingNumber}
                />
            </XStack>
        );
        notes = (
            <>
                {/* Only warn when a number drawn from the position is on screen. */}
                {eta.stale && eta.kind !== 'none' ? (
                    <Micro tone="warning" testID="today-stale-location">
                        {t('today.staleLocation')}
                    </Micro>
                ) : null}
                {insights?.is_off_route ? (
                    <Micro tone="warning" testID="today-off-route">
                        {t('today.offRoute')}
                    </Micro>
                ) : null}
            </>
        );
        // What this waypoint asks for, read from its order and, on a route, from the waypoint itself.
        const nextOrder = next.orderId ? ordersById.get(next.orderId) : undefined;
        const nextStop = manifest?.stops?.find((stop) => stop.id === next.stopId);
        const items = itemCount(nextOrder);
        const cash = cashOnDeliveryOf(nextOrder);
        const proof = String(nextStop?.pod_method ?? '').toLowerCase();
        const proofNeeded = nextStop ? !!nextStop.pod_required : !!nextOrder?.pod_required;
        const note = nextStop?.notes || deliveryInstructionsOf(nextOrder);
        facts = [
            ...(items > 0 ? [{ key: 'items', icon: 'box' as const, label: t('home.facts.items', { count: items }) }] : []),
            ...(cash?.toCollect && next.kind !== 'pickup' ? [{ key: 'cash', icon: 'cash' as const, tone: 'warning' as const, label: t('home.facts.collect', { amount: formatMoney(cash.amount, cash.currency) }) }] : []),
            ...(proofNeeded
                ? [
                      proof === 'signature'
                          ? { key: 'proof', icon: 'pen' as const, label: t('home.facts.signature') }
                          : proof === 'photo'
                            ? { key: 'proof', icon: 'camera' as const, label: t('home.facts.photo') }
                            : proof === 'scan' || proof === 'qr_scan'
                              ? { key: 'proof', icon: 'scan' as const, label: t('home.facts.scan') }
                              : { key: 'proof', icon: 'check' as const, label: t('home.facts.proof') },
                  ]
                : []),
            ...(note ? [{ key: 'note', icon: 'note' as const, label: t('home.facts.note') }] : []),
        ];

        const destination: Destination | undefined = next.point ? { ...next.point, label: next.name ?? next.address } : undefined;
        const canNavigate = !!onNavigate && !!destination;
        // The sheet pulled down: one row that still says where next and gets the driver going.
        const distanceStat = stats.find((stat) => stat.key === 'distance');
        const peekLine = [etaAt && eta.kind === 'live' ? t('home.peek.arrive', { time: formatClock(etaAt) }) : undefined, distanceStat?.value].filter(Boolean).join(' · ');
        peek = (
            <XStack alignItems="center" gap={space[3]} testID="home-peek">
                <HeroBadge number={next.number} />
                <YStack flex={1} gap={2} minWidth={0}>
                    <Body fontSize={17} lineHeight={22} fontWeight="800" numberOfLines={1}>
                        {next.name ?? next.address ?? t('today.noStopRecorded')}
                    </Body>
                    {peekLine ? (
                        <Secondary fontSize={14} lineHeight={19} tabular numberOfLines={1}>
                            {peekLine}
                        </Secondary>
                    ) : null}
                </YStack>
                {canNavigate ? (
                    <YStack
                        width={52}
                        height={52}
                        borderRadius={26}
                        backgroundColor="$primary"
                        alignItems="center"
                        justifyContent="center"
                        onPress={() => onNavigate?.(destination as Destination, next.source === 'order' ? next.orderId : undefined)}
                        pressStyle={{ opacity: 0.8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('today.navigate')}
                        testID="home-peek-navigate"
                    >
                        <HomeIcon name="navigate" color={theme.onPrimary?.val as string} size={22} />
                    </YStack>
                ) : null}
            </XStack>
        );
        const open = openNext(next);
        actions =
            canNavigate || open ? (
                <XStack gap={space[2]}>
                    {canNavigate ? (
                        <YStack flex={1}>
                            <BigButton
                                onPress={() => onNavigate?.(destination as Destination, next.source === 'order' ? next.orderId : undefined)}
                                icon={<HomeIcon name="navigate" color={theme.onPrimary?.val as string} />}
                                gap={10}
                                testID="today-navigate"
                            >
                                {t('today.navigate')}
                            </BigButton>
                        </YStack>
                    ) : null}
                    {/* With nowhere to navigate to, Open is the only action and takes the row. */}
                    {canNavigate ? open : open ? <YStack flex={1}>{open}</YStack> : null}
                </XStack>
            ) : null;
    } else if (next) {
        // Offline with work assigned: the same hero, about where the day starts, and the way online.
        state = 'before';
        const remaining = Math.max(0, day.total - day.done);
        const started = day.done > 0;
        const kindLabel = next.kind ? t(`home.kind.${next.kind}`) : undefined;
        hero = (
            <XStack alignItems="flex-start" gap={space[3]} testID="home-first-waypoint">
                <HeroBadge number={next.number} />
                <HeroText
                    eyebrow={[started ? t('home.hero.next') : t('home.hero.first'), kindLabel].filter(Boolean).join(' · ')}
                    title={next.name ?? next.address ?? t('today.noStopRecorded')}
                    lines={[next.name ? next.address : undefined]}
                    mono={next.trackingNumber}
                />
            </XStack>
        );
        statsTestID = 'home-today-stats';
        stats = [
            {
                key: 'waypoints',
                value: String(started ? remaining : day.total),
                label: [started ? t('home.stat.waypointsLeft', { count: remaining }) : t('home.stat.waypoints', { count: day.total }), day.orderCount ? t('home.stat.inOrders', { count: day.orderCount }) : undefined]
                    .filter(Boolean)
                    .join(' · '),
            },
            ...(day.firstAt && !started ? [{ key: 'first', value: formatClock(day.firstAt), label: t('home.stat.firstWaypoint') }] : next.plannedAt ? [{ key: 'planned', value: formatClock(next.plannedAt), label: t('home.hero.planned') }] : []),
            ...(day.plannedDistanceM ? [{ key: 'distance', value: formatMeters(day.plannedDistanceM, units), label: t('home.stat.toDrive') }] : []),
        ];
        // What the day's orders carry between them, and the cash they ask for.
        const dayOrderIds = [...new Set(day.waypoints.flatMap((w) => (w.orderId && !w.done ? [w.orderId] : [])))];
        const carried = dayOrderIds.reduce((sum, id) => sum + itemCount(ordersById.get(id)), 0);
        const toCollect = dayOrderIds.reduce<{ amount: number; currency?: string }>((sum, id) => {
            const cash = cashOnDeliveryOf(ordersById.get(id));
            return cash?.toCollect ? { amount: sum.amount + cash.amount, currency: sum.currency ?? cash.currency } : sum;
        }, { amount: 0 });
        facts = [
            ...(carried > 0 ? [{ key: 'items', icon: 'box' as const, label: t('home.facts.items', { count: carried }) }] : []),
            ...(toCollect.amount > 0 ? [{ key: 'cash', icon: 'cash' as const, tone: 'warning' as const, label: t('home.facts.collect', { amount: formatMoney(toCollect.amount, toCollect.currency) }) }] : []),
        ];
        const open = openNext(next);
        actions = (
            <YStack gap={space[2]}>
                <XStack gap={space[2]}>
                    <YStack flex={1}>{goOnline}</YStack>
                    {open}
                </XStack>
                {locationNote}
            </YStack>
        );
    } else {
        // Nothing assigned. Online, that is news dispatch can act on; offline, the way online is the action.
        state = 'empty';
        hero = (
            <XStack alignItems="flex-start" gap={space[3]} testID="today-empty">
                <HeroBadge icon={onDuty ? 'tick' : 'power'} tone={onDuty ? 'success' : 'neutral'} />
                <HeroText
                    eyebrowTone={onDuty ? 'success' : 'muted'}
                    eyebrow={onDuty ? t('home.empty.eyebrow') : t('home.before.today')}
                    title={onDuty ? t('home.empty.title') : t('home.before.nothingTitle')}
                    lines={[onDuty ? (offers.length ? t('home.empty.bodyOffers') : t('home.empty.body')) : t('home.before.nothingBody')]}
                    titleTestID="home-empty-title"
                />
            </XStack>
        );
        actions = onDuty ? null : (
            <YStack gap={space[2]}>
                {goOnline}
                {locationNote}
            </YStack>
        );

        const comingUpCard = comingUp ? (
            <JobCard
                key="coming-up"
                eyebrow={t('home.idle.comingUp')}
                icon="calendar"
                title={[formatDay(dayKey(comingUp.scheduled_at as string), { weekday: true }), formatClock(comingUp.scheduled_at)].join(' · ')}
                lines={[placeLine(comingUp)]}
                mono={trackingNumberOf(comingUp)}
                onPress={onOpenOrder ? () => onOpenOrder(comingUp.id) : undefined}
                testID="home-coming-up"
            />
        ) : null;

        if (onDuty) {
            // Online with nothing to drive to: the week so far, the last job, and what a driver does between jobs.
            const bars: WeekBar[] = week.days.map((weekDay) => {
                const [y, m, d] = weekDay.date.split('-').map(Number);
                return {
                    key: weekDay.date,
                    label: new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' }),
                    value: weekDay.summary?.waypoints?.completed ?? 0,
                    today: weekDay.isToday,
                };
            });
            const weekStats: Stat[] = [
                { key: 'week-waypoints', value: String(week.totals.waypoints), label: t('home.week.waypoints', { count: week.totals.waypoints }) },
                ...(week.totals.distanceM > 0 ? [{ key: 'week-driven', value: formatMeters(week.totals.distanceM, units), label: t('home.week.driven') }] : []),
                ...(week.totals.seconds > 0 ? [{ key: 'week-online', value: formatDuration(week.totals.seconds), label: t('home.week.online') }] : []),
            ];
            const lastStamp = lastJob ? String((lastJob as Record<string, unknown>).updated_at ?? '') : '';
            extras = (
                <>
                    {week.known ? <WeekCard title={t('home.week.title')} bars={bars} stats={weekStats} testID="home-week" /> : null}
                    {comingUpCard}
                    {lastJob ? (
                        <JobCard
                            eyebrow={t('home.idle.lastJob')}
                            icon="tick"
                            title={placeLine(lastJob) ?? trackingNumberOf(lastJob) ?? lastJob.id}
                            lines={[lastStamp ? t('home.idle.completedOn', { when: [formatDay(dayKey(lastStamp), { weekday: true }), formatClock(lastStamp)].join(' · ') }) : undefined]}
                            mono={trackingNumberOf(lastJob)}
                            onPress={onOpenOrder ? () => onOpenOrder(lastJob.id) : undefined}
                            testID="home-last-job"
                        />
                    ) : null}
                    <Shortcuts
                        testID="home-shortcuts"
                        items={[
                            { key: 'issue', icon: 'issue', label: t('home.shortcuts.issue'), onPress: onReportIssue },
                            { key: 'fuel', icon: 'fuel', label: t('home.shortcuts.fuel'), onPress: onLogFuel },
                            {
                                key: 'inspection',
                                icon: 'check',
                                label: t('home.shortcuts.inspection'),
                                tone: inspectionDue ? 'warning' : undefined,
                                onPress: onOpenInspection && hasVehicle ? () => onOpenInspection(vehicle?.id, vehicleName) : undefined,
                            },
                        ]}
                    />
                </>
            );
        } else {
            // Offline with nothing assigned: what is coming, and how yesterday went.
            const yesterday = week.days[week.days.length - 2]?.summary;
            const yesterdayStats: Stat[] = yesterday
                ? [
                      { key: 'y-waypoints', value: String(yesterday.waypoints?.completed ?? 0), label: t('home.week.waypoints', { count: yesterday.waypoints?.completed ?? 0 }) },
                      { key: 'y-orders', value: String(yesterday.orders_completed ?? 0), label: t('home.end.ordersCompleted', { count: yesterday.orders_completed ?? 0 }) },
                      ...(yesterday.distance_driven_m ? [{ key: 'y-driven', value: formatMeters(yesterday.distance_driven_m, units), label: t('home.week.driven') }] : []),
                      ...(yesterday.seconds_on_duty ? [{ key: 'y-online', value: formatDuration(yesterday.seconds_on_duty), label: t('home.week.online') }] : []),
                  ]
                : [];
            const workedYesterday = !!yesterday && ((yesterday.waypoints?.completed ?? 0) > 0 || (yesterday.orders_completed ?? 0) > 0 || !!yesterday.seconds_on_duty);
            extras = (
                <>
                    {comingUpCard}
                    {workedYesterday ? (
                        <YStack gap={10} testID="home-yesterday">
                            <SectionLabel>{t('home.idle.yesterday')}</SectionLabel>
                            <StatCard stats={yesterdayStats} testID="home-yesterday-stats" />
                        </YStack>
                    ) : null}
                </>
            );
        }
    }

    const finishAt =
        state === 'next' || state === 'before'
            ? (day.finishAt ?? (eta.kind === 'live' && day.total - day.done === (tracker?.progress?.remaining_stops ?? -1) ? (tracker?.eta?.completion_at ?? undefined) : undefined))
            : undefined;
    const showProgress = (state === 'next' || state === 'before') && day.total > 0;

    /*
     * The layout: the map is the whole background; the organisation and the
     * driver's status are fixed over its top; the content is a sheet over its
     * bottom. The sheet rests where it leaves the top of the map showing, can be
     * pulled down to a short strip to see more map, and goes no higher than
     * where it rests, so it never covers the chips. Content taller than the
     * sheet scrolls inside it.
     */
    const windowHeight = useWindowDimensions().height;
    const [layoutHeight, setLayoutHeight] = useState(0);
    const height = layoutHeight || windowHeight;
    const restHeight = Math.max(PEEK_BODY + tabBarSpace + 80, Math.round(height - bleed - MAP_SHOWING));
    const peekHeight = Math.min(restHeight - 60, PEEK_BODY + tabBarSpace);
    const snapPoints = useMemo(() => [peekHeight, restHeight], [peekHeight, restHeight]);
    const [sheetIndex, setSheetIndex] = useState(1);
    const [refitToken, setRefitToken] = useState(0);
    const [mapMoved, setMapMoved] = useState(false);
    const sheetHeight = sheetIndex === 0 ? peekHeight : restHeight;
    const recentre = () => {
        setMapMoved(false);
        setRefitToken((n) => n + 1);
    };

    return (
        <YStack flex={1} backgroundColor="$mapBackground" onLayout={(event) => setLayoutHeight(Math.round(event.nativeEvent.layout.height))} testID="today">
            <YStack position="absolute" top={0} left={0} right={0} bottom={0}>
                <HomeMap
                    waypoints={day.waypoints}
                    // Online, the view is the leg to the next waypoint; otherwise the whole day.
                    activeKey={state === 'next' ? next?.key : undefined}
                    route={state === 'next' ? route : undefined}
                    position={position}
                    dark={dark}
                    height={height}
                    // The part of the map that can be seen: under the chips, above the sheet.
                    padding={{ top: bleed + CHIPS_ROOM, bottom: sheetHeight }}
                    refitToken={refitToken}
                    onMoved={() => setMapMoved(true)}
                />
            </YStack>

            {/* Fixed over the map; the sheet never reaches them. */}
            <XStack position="absolute" top={bleed} left={space[3] - 2} right={space[3] - 2} alignItems="flex-start" justifyContent="space-between" gap={space[2]} pointerEvents="box-none" testID="home-header">
                <OrgChip name={organizationName} dark={dark} onPress={openOrgSheet} />
                <DutyChip duty={duty} onPress={openDutySheet} t={t} dark={dark} since={onDutySince} />
            </XStack>

            {/* Shown once the driver has moved the map: puts the view back. */}
            {mapMoved ? (
                <YStack
                    position="absolute"
                    right={space[3]}
                    bottom={sheetHeight + space[3]}
                    width={46}
                    height={46}
                    borderRadius={23}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor="$surface"
                    borderWidth={1}
                    borderColor="$border"
                    onPress={recentre}
                    pressStyle={{ opacity: 0.7 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.map.recentre')}
                    testID="home-recentre"
                >
                    <HomeIcon name="navigate" color={theme.primary?.val as string} />
                </YStack>
            ) : null}

            <BottomSheet
                index={1}
                snapPoints={snapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={false}
                enableOverDrag={false}
                animateOnMount={false}
                // Told as the sheet starts to move, so what it shows changes with it rather than after.
                onAnimate={(_from: number, to: number) => setSheetIndex(to < 0 ? 0 : to)}
                onChange={(index: number) => setSheetIndex(index < 0 ? 0 : index)}
                backgroundStyle={{ backgroundColor: theme.background?.val as string, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: theme.border?.val as string }}
                handleIndicatorStyle={{ backgroundColor: theme.border?.val as string, width: 40, height: 5 }}
                handleStyle={{ paddingTop: 10, paddingBottom: 8 }}
            >
                <BottomSheetScrollView
                    showsVerticalScrollIndicator={false}
                    // Content that fits stays still; only content taller than the sheet scrolls, and it does not bounce.
                    bounces={false}
                    alwaysBounceVertical={false}
                    overScrollMode="never"
                    contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: 6, paddingBottom: tabBarSpace + space[2], gap: SHEET_GAP }}
                    testID={`home-sheet-${state}`}
                >
                    {noticeBanners}
                    {dutyErrorBanner}

                    {state === 'loading' ? (
                        <YStack gap={SHEET_GAP} testID="today-loading">
                            <Skeleton height={92} borderRadius={CARD_RADIUS} />
                            <Skeleton height={84} borderRadius={CARD_RADIUS} />
                            <Skeleton height={60} borderRadius={16} />
                        </YStack>
                    ) : state === 'error' ? (
                        <YStack paddingVertical={space[4]} testID="today-error">
                            <FailureState error={ordersQuery.error} isOnline={isOnline} onRetry={refreshAll} t={t} />
                        </YStack>
                    ) : (
                        <>
                            <Rise>
                                <YStack gap={SHEET_GAP} testID={state === 'next' ? 'today-next-stop' : `home-hero-${state}`}>
                                    {/* Room under the header before the figures and rows. */}
                                    <YStack paddingBottom={space[3]}>{sheetIndex === 0 && peek ? peek : hero}</YStack>
                                    <StatCard stats={stats} testID={statsTestID} />
                                    <FactChips chips={facts} testID="home-facts" />
                                    {notes}
                                    {actions}
                                </YStack>
                            </Rise>

                            {showProgress ? (
                                <Rise delay={70}>
                                    <YStack gap={space[2]} testID="today-progress">
                                        <XStack alignItems="baseline" justifyContent="space-between" gap={space[2]}>
                                            <Body fontSize={14} lineHeight={19} fontWeight="700" tabular>
                                                {t('home.progress.done', { done: day.done, total: day.total })}
                                            </Body>
                                            {finishAt ? (
                                                <Secondary fontSize={13} lineHeight={18} tabular testID="home-finish">
                                                    {t('home.progress.finish', { time: formatClock(finishAt) })}
                                                </Secondary>
                                            ) : null}
                                        </XStack>
                                        <SegmentBar total={day.total} done={day.done} hasCurrent={state === 'next'} />
                                        {day.manifest?.status === 'draft' ? (
                                            <Micro tone="warning" testID="home-draft-route">
                                                {t('home.before.draft')}
                                            </Micro>
                                        ) : null}
                                    </YStack>
                                </Rise>
                            ) : null}

                            {summaryList ? <Rise delay={70}>{summaryList}</Rise> : null}

                            {showProgress && day.upcoming.length ? (
                                <Rise delay={200}>
                                    <YStack gap={10} testID="home-upcoming">
                                        <SectionLabel>{t('home.upcoming.section')}</SectionLabel>
                                        <Card padded={false}>
                                            {(state === 'next' ? day.upcoming.slice(0, 2) : day.upcoming).map((waypoint, index) => (
                                                <WaypointRow
                                                    key={waypoint.key}
                                                    waypoint={waypoint}
                                                    first={index === 0}
                                                    time={waypoint.plannedAt ? formatClock(waypoint.plannedAt) : waypoint.windowEnd ? t('home.upcoming.by', { time: formatClock(waypoint.windowEnd) }) : undefined}
                                                    onPress={canOpen(waypoint) ? () => openWaypoint(waypoint) : undefined}
                                                />
                                            ))}
                                        </Card>
                                    </YStack>
                                </Rise>
                            ) : null}
                        {extras ? (
                            <Rise delay={100}>
                                <YStack gap={SHEET_GAP}>{extras}</YStack>
                            </Rise>
                        ) : null}

                        {rows.length ? (
                                <Rise delay={140}>
                                    <YStack gap={10} testID="home-attention">
                                        {rows}
                                    </YStack>
                                </Rise>
                            ) : null}

                            </>
                    )}
                </BottomSheetScrollView>
            </BottomSheet>
        </YStack>
    );
}

export default TodayScreen;
