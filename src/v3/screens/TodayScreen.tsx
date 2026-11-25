/**
 * Home — the signed-in dashboard, design round 3 (HomeBefore, Home, EndDay).
 *
 * One screen, four states, chosen from what is actually loaded:
 *
 *   - **Off duty**: what is assigned today, the vehicle and its pre-trip check,
 *     and one action — go on duty.
 *   - **On duty with work**: the next waypoint over a real map, then how far
 *     through the day the driver is and what comes after.
 *   - **On duty with nothing assigned**: says so, and points at open offers.
 *   - **Every waypoint done**: a short summary and the way off duty.
 *
 * The day is the manifest's waypoints when the driver has one, plus the
 * waypoints of any order the manifest does not cover (see `home/homeModel`).
 *
 * What the mockups draw that this screen leaves out, because nothing on the
 * driver API supplies it: a name for the route, hours on duty, distance
 * actually driven, drive time and breaks, and the vehicle's range. The tracker
 * reports `is_delayed` as a constant `false`, so "on time" is only ever said
 * when the waypoint has a time window to compare the arrival against.
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../ui/Scroll';
import { Body, Display, Micro, Secondary } from '../ui/Text';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { currentLocale } from '../i18n';
import { useSettings, useResolvedScheme } from '../settings';
import { useDuty, useSync, useDeviceLocation } from '../shell';
import { useShell } from '../navigation/DriverShell';
import { useTabBarSpace } from '../navigation/TabBar';
import { BigButton, CARD_RADIUS } from '../onboarding/AuthScaffold';
import {
    useActiveOrders,
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
import { useLiveRefresh } from '../realtime/liveRefresh';
import { formatClock, formatDuration, formatMeters, formatMoney } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { HomeMap } from './home/HomeMap';
import { buildDay, dayPart, firstNameOf, pickTodayManifest, secondsBetween, trackerIsFor, type HomeDay, type HomeWaypoint } from './home/homeModel';
import { Card, DutyChip, EntryCard, HomeIcon, OrgChip, Rise, SectionLabel, SegmentBar, StatRow, SummaryRow, WaypointRow, type Stat } from './home/parts';

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
    onOpenChat?: () => void;
    onLogFuel?: () => void;
}

const MAP_HEIGHT = 300;
/** How far the content sheet rides up over the bottom of the map. */
const SHEET_OVERLAP = 22;

/** The date and greeting on the left, the duty control on the right. */
function Header({ t, name, organization, duty, onDuty }: { t: Translate; name?: string; organization: string; duty: ReturnType<typeof useDuty>['duty']; onDuty: () => void }) {
    const part = dayPart();
    const date = new Date().toLocaleDateString(currentLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return (
        <XStack alignItems="center" justifyContent="space-between" gap={space[3]} paddingHorizontal={space[4]} paddingTop={space[2]} testID="home-header">
            <YStack flex={1} gap={2} minWidth={0}>
                <Secondary fontSize={14} lineHeight={19} numberOfLines={1}>
                    {[date, organization].filter(Boolean).join(' · ')}
                </Secondary>
                <Display fontSize={30} lineHeight={36} fontWeight="800" letterSpacing={-0.6} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} testID="home-greeting">
                    {name ? t(`home.greeting.${part}`, { name }) : t(`home.greetingNoName.${part}`)}
                </Display>
            </YStack>
            <DutyChip duty={duty} onPress={onDuty} t={t} />
        </XStack>
    );
}

/** A waypoint's place and the order it belongs to: name, address, then the tracking number in full. */
function WaypointTitle({ waypoint, eyebrow, t }: { waypoint: HomeWaypoint; eyebrow: string; t: Translate }) {
    return (
        <XStack alignItems="flex-start" gap={space[3]}>
            <YStack width={48} height={48} borderRadius={14} backgroundColor="$primary" alignItems="center" justifyContent="center" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Body fontSize={22} lineHeight={28} fontWeight="800" tone="onPrimary" tabular>
                    {waypoint.number}
                </Body>
            </YStack>
            <YStack flex={1} gap={3} minWidth={0}>
                <SectionLabel tone="brand">{eyebrow}</SectionLabel>
                <Body fontSize={21} lineHeight={25} fontWeight="800" letterSpacing={-0.2} testID="home-next-name">
                    {waypoint.name ?? waypoint.address ?? t('today.noStopRecorded')}
                </Body>
                {waypoint.name && waypoint.address ? (
                    <Secondary fontSize={14} lineHeight={19}>
                        {waypoint.address}
                    </Secondary>
                ) : null}
                {waypoint.trackingNumber ? (
                    // Never truncated: the driver reads this out, or matches it to a label.
                    <Secondary fontFamily="$mono" fontSize={13} lineHeight={18} selectable testID="home-next-tracking">
                        {waypoint.trackingNumber}
                    </Secondary>
                ) : null}
            </YStack>
        </XStack>
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
    onOpenChat,
    onLogFuel,
}: TodayScreenProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const screen = useScreenStyle();
    const tabBarSpace = useTabBarSpace();
    const { units } = useSettings();
    const scheme = useResolvedScheme();
    const { organizationName, driverName, openDutySheet } = useShell();
    const { duty, isChanging, setDuty, error: dutyError } = useDuty();
    const { isOnline, queuedCount } = useSync();
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
     * A pre-trip check is due when the organisation has published a pre-trip
     * form for this vehicle and nothing was filed against the vehicle today.
     * The server has no "due" flag, so this is the same rule a driver would
     * apply reading the history; it stays quiet until the history has loaded,
     * so the card never flashes up and away.
     */
    const forms = useInspectionForms(vehicle?.id, reloadToken);
    const history = useInspectionHistory({ vehicle: vehicle?.id }, reloadToken);
    const pendingInspections = usePendingInspections();
    const inspectionDue = useMemo(() => {
        // A refresh keeps the last answer on screen; only a first load or a failure is "not known yet".
        const known = (state: string) => state === 'ready' || state === 'refreshing';
        if (!vehicle?.id || !known(forms.state) || !known(history.state)) return false;
        const isPreTrip = (type: unknown) => String(type ?? '').toLowerCase() === 'pre_trip';
        if (!forms.forms.some((form) => isPreTrip(form.type))) return false;
        const today = dayKey();
        const filedToday = [...history.submissions, ...pendingInspections].some((s) => {
            const when = s.submitted_at ?? s.started_at ?? (s.created_at as string | undefined);
            const sameVehicle = !s.vehicle?.id || s.vehicle.id === vehicle.id;
            return isPreTrip(s.type) && sameVehicle && !!when && dayKey(when) === today;
        });
        return !filedToday;
    }, [vehicle?.id, forms.state, forms.forms, history.state, history.submissions, pendingInspections]);

    /* -- Refresh ------------------------------------------------------------ */

    const [pulling, setPulling] = useState(false);
    const refreshAll = useCallback(async () => {
        setPulling(true);
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

    const refreshControl = <RefreshControl refreshing={pulling} onRefresh={refreshAll} tintColor={theme.textMuted?.val as string} testID="home-refresh" />;

    /* -- Pieces shared by the states ---------------------------------------- */

    const firstName = firstNameOf(driverName);
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const hasMapPoints = day.waypoints.some((w) => !!w.point);
    const openWaypoint = (waypoint: HomeWaypoint) => {
        if (waypoint.source === 'manifest' && waypoint.manifestId && waypoint.stopId && onOpenWaypoint) onOpenWaypoint(waypoint.manifestId, waypoint.stopId);
        else if (waypoint.orderId) onOpenOrder?.(waypoint.orderId);
    };
    const canOpen = (waypoint: HomeWaypoint) => (waypoint.source === 'manifest' && !!onOpenWaypoint) || (!!waypoint.orderId && !!onOpenOrder);

    const header = <Header t={t} name={firstName} organization={organizationName} duty={duty} onDuty={openDutySheet} />;

    const noticeBanners = notices.map((notice) => (
        <Banner
            key={notice.orderId}
            tone="warning"
            message={t('ordersScreen.reassigned', { order: notice.label })}
            action={{ label: t('common.dismiss'), onPress: () => orderStore.dismissNotice(notice.orderId) }}
            testID={`today-notice-${notice.orderId}`}
        />
    ));

    const dutyErrorBanner = dutyError ? <Banner tone="danger" message={t('home.duty.failed')} meta={dutyError.message} testID="home-duty-error" /> : null;

    // Only what is true right now; a section with nothing in it is not drawn.
    const attention = [
        queuedCount > 0 ? (
            <EntryCard key="sync" icon="upload" title={t('home.attention.unsent', { count: queuedCount })} body={isOnline ? t('home.attention.unsentOnline') : t('home.attention.unsentOffline')} onPress={onOpenSyncQueue} testID="home-attention-sync" />
        ) : null,
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
        unreadChat > 0 ? (
            <EntryCard key="chat" icon="chat" title={t('home.attention.unread', { count: unreadChat })} body={t('home.attention.unreadBody')} count={unreadChat} onPress={onOpenChat} testID="home-attention-chat" />
        ) : null,
    ].filter(Boolean);

    const offersCard =
        onDuty && offers.length > 0 ? (
            <EntryCard
                icon="bolt"
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

    /* -- Loading and failure ------------------------------------------------ */

    const nothingYet = day.total === 0;
    const cold = nothingYet && (ordersQuery.state === 'loading' || ordersQuery.state === 'idle' || manifestsQuery.isLoading || (!!todayManifestId && manifestQuery.isLoading));

    if (cold && !!driverId) {
        return (
            <YStack flex={1} backgroundColor="$background" gap={space[4]} testID="today-loading">
                {header}
                <YStack paddingHorizontal={space[4]} gap={space[3]}>
                    <Skeleton height={220} borderRadius={CARD_RADIUS} />
                    <Skeleton height={76} borderRadius={CARD_RADIUS} />
                    <Skeleton height={76} borderRadius={CARD_RADIUS} />
                </YStack>
            </YStack>
        );
    }

    if (nothingYet && ordersQuery.state === 'error') {
        return (
            <YStack flex={1} backgroundColor="$background" gap={space[4]} testID="today-error">
                {header}
                <YStack flex={1} paddingHorizontal={space[4]} justifyContent="center">
                    <FailureState error={ordersQuery.error} isOnline={isOnline} onRetry={refreshAll} t={t} />
                </YStack>
            </YStack>
        );
    }

    /* -- Off duty: before the shift ----------------------------------------- */

    if (!onDuty) {
        const remaining = Math.max(0, day.total - day.done);
        const stats: Stat[] = [
            { key: 'orders', value: String(day.orderCount), label: t('home.stat.orders', { count: day.orderCount }) },
            ...(day.plannedDistanceM ? [{ key: 'distance', value: formatMeters(day.plannedDistanceM, units), label: t('home.stat.toDrive') }] : []),
            ...(day.firstAt ? [{ key: 'first', value: formatClock(day.firstAt), label: t('home.stat.firstWaypoint') }] : []),
        ];
        const hasVehicleCard = !!vehicle && (!!vehicleName || !!vehiclePlate);

        return (
            <YStack flex={1} backgroundColor="$background" testID="today">
                <ScrollView style={screen} contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }} refreshControl={refreshControl} testID="home-before">
                    {header}
                    <YStack paddingHorizontal={space[4]} gap={space[4]}>
                        {noticeBanners}
                        {dutyErrorBanner}

                        <Rise>
                            {day.total > 0 ? (
                                <Card padded={false} testID="home-today-card">
                                    {hasMapPoints ? <HomeMap waypoints={day.waypoints} activeKey={next?.key} position={position} dark={dark} height={150} testID="home-before-map" /> : null}
                                    <YStack padding={space[4]} gap={14}>
                                        <YStack gap={space[1]}>
                                            <SectionLabel>{day.manifest ? t('home.before.route') : t('home.before.work')}</SectionLabel>
                                            <Body fontSize={22} lineHeight={27} fontWeight="800" letterSpacing={-0.2} testID="home-today-count">
                                                {day.done > 0 ? t('home.before.waypointsLeft', { count: remaining }) : t('home.before.waypoints', { count: day.total })}
                                            </Body>
                                        </YStack>
                                        <StatRow stats={stats} testID="home-today-stats" />
                                        {day.manifest?.status === 'draft' ? (
                                            <Micro tone="warning" testID="home-draft-route">
                                                {t('home.before.draft')}
                                            </Micro>
                                        ) : null}
                                        {next ? (
                                            <YStack gap={2} testID="home-first-waypoint">
                                                <Secondary fontSize={12} lineHeight={16}>
                                                    {t('home.before.startsAt')}
                                                </Secondary>
                                                <Body fontSize={16} lineHeight={21} fontWeight="700">
                                                    {next.name ?? next.address ?? t('today.noStopRecorded')}
                                                </Body>
                                                {next.name && next.address ? (
                                                    <Secondary fontSize={13} lineHeight={18}>
                                                        {next.address}
                                                    </Secondary>
                                                ) : null}
                                            </YStack>
                                        ) : null}
                                    </YStack>
                                </Card>
                            ) : (
                                <Card testID="today-empty">
                                    <YStack gap={space[1]} paddingVertical={space[2]}>
                                        <Body fontSize={18} lineHeight={24} fontWeight="800">
                                            {t('home.before.nothingTitle')}
                                        </Body>
                                        <Secondary fontSize={14} lineHeight={20}>
                                            {t('home.before.nothingBody')}
                                        </Secondary>
                                    </YStack>
                                </Card>
                            )}
                        </Rise>

                        {hasVehicleCard || attention.length ? (
                            <Rise delay={70}>
                                <YStack gap={10} testID="home-before-list">
                                    <SectionLabel>{t('home.before.section')}</SectionLabel>
                                    {/* With a check due, the inspection card names the vehicle; otherwise the vehicle has its own. */}
                                    {hasVehicleCard && !inspectionDue ? (
                                        <EntryCard icon="vehicle" title={vehicleName ?? t('home.vehicle.yours')} body={t('home.vehicle.assigned')} mono={vehiclePlate} onPress={onOpenVehicle} testID="home-vehicle" />
                                    ) : null}
                                    {attention}
                                </YStack>
                            </Rise>
                        ) : null}
                    </YStack>
                </ScrollView>

                {/* The one action, where a thumb is, clear of the floating tab bar. */}
                <YStack paddingHorizontal={space[4]} paddingTop={space[2]} paddingBottom={tabBarSpace} gap={space[2]}>
                    <BigButton onPress={() => void setDuty('on')} loading={isChanging} icon={<HomeIcon name="power" color={theme.onPrimary?.val as string} />} gap={10} testID="home-go-on-duty">
                        {t('home.before.goOnDuty')}
                    </BigButton>
                    <Micro center fontSize={12} lineHeight={16} testID="home-location-note">
                        {organizationName ? t('home.before.locationNote', { organization: organizationName }) : t('home.before.locationNoteNoOrg')}
                    </Micro>
                </YStack>
            </YStack>
        );
    }

    /* -- On duty, every waypoint done --------------------------------------- */

    if (day.allDone) {
        const completed = day.done - day.skipped;
        const routeSeconds = secondsBetween(day.manifest?.started_at, day.manifest?.completed_at);
        const tiles: Stat[] = [
            { key: 'waypoints', value: t('home.end.ofTotal', { done: completed, total: day.total }), label: t('home.end.waypoints') },
            { key: 'orders', value: day.finishedOrderCount === day.orderCount ? String(day.orderCount) : t('home.end.ofTotal', { done: day.finishedOrderCount, total: day.orderCount }), label: t('home.end.orders', { count: day.orderCount }) },
            // The plan's length, labelled as that: nothing measures what was actually driven.
            ...(day.plannedDistanceM ? [{ key: 'distance', value: formatMeters(day.plannedDistanceM, units), label: t('home.end.plannedRoute') }] : []),
            ...(routeSeconds ? [{ key: 'time', value: formatDuration(routeSeconds), label: t('home.end.routeTime') }] : []),
        ];
        const rows: { key: string; kind: 'ok' | 'attention'; title: string; body?: string; value?: string }[] = [
            ...day.cash.map((cash) => ({
                key: `cash-${cash.currency ?? ''}`,
                kind: 'attention' as const,
                title: t('home.end.cash'),
                body: t('home.end.cashBody', { count: cash.orders }),
                value: formatMoney(cash.amount, cash.currency),
            })),
            ...(day.skipped > 0 ? [{ key: 'skipped', kind: 'attention' as const, title: t('home.end.skipped'), body: t('home.end.skippedBody'), value: String(day.skipped) }] : []),
            // Unsent work has its own card below, which opens the queue; this row only ever confirms there is none.
            ...(queuedCount === 0 ? [{ key: 'sent', kind: 'ok' as const, title: t('home.end.allSent'), body: t('home.end.allSentBody') }] : []),
        ];

        return (
            <YStack flex={1} backgroundColor="$background" testID="today">
                <ScrollView style={screen} contentContainerStyle={{ gap: space[4], paddingBottom: space[4] }} refreshControl={refreshControl} testID="home-end">
                    <XStack justifyContent="flex-end" paddingHorizontal={space[4]} paddingTop={space[2]}>
                        <DutyChip duty={duty} onPress={openDutySheet} t={t} />
                    </XStack>
                    <YStack paddingHorizontal={space[4]} gap={space[4]}>
                        {noticeBanners}
                        {dutyErrorBanner}
                        <YStack gap={6}>
                            <SectionLabel tone="success">
                                {day.manifest?.completed_at ? t('home.end.finishedAt', { time: formatClock(day.manifest.completed_at) }) : t('home.end.finished')}
                            </SectionLabel>
                            <Display fontSize={32} lineHeight={36} fontWeight="800" letterSpacing={-0.6} testID="home-end-title">
                                {firstName ? t('home.end.title', { name: firstName }) : t('home.end.titleNoName')}
                            </Display>
                        </YStack>

                        <Rise delay={60}>
                            <XStack flexWrap="wrap" gap={space[2]} testID="home-end-stats">
                                {tiles.map((stat) => (
                                    <YStack key={stat.key} flexBasis="47%" flexGrow={1} gap={2} padding={14} borderRadius={CARD_RADIUS} borderWidth={1} borderColor="$border" backgroundColor="$surface" testID={`home-end-stat-${stat.key}`}>
                                        <Body fontSize={26} lineHeight={32} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                                            {stat.value}
                                        </Body>
                                        <Secondary fontSize={13} lineHeight={18}>
                                            {stat.label}
                                        </Secondary>
                                    </YStack>
                                ))}
                            </XStack>
                        </Rise>

                        {rows.length ? (
                            <Rise delay={130}>
                                <Card padded={false} testID="home-end-list">
                                    {rows.map((row, index) => (
                                        <SummaryRow key={row.key} kind={row.kind} title={row.title} body={row.body} value={row.value} first={index === 0} testID={`home-end-${row.key}`} />
                                    ))}
                                </Card>
                            </Rise>
                        ) : null}

                        {offersCard}
                        {attention.length ? <YStack gap={10}>{attention}</YStack> : null}
                    </YStack>
                </ScrollView>

                <YStack paddingHorizontal={space[4]} paddingTop={space[2]} paddingBottom={tabBarSpace} gap={space[2]}>
                    <BigButton onPress={openDutySheet} testID="home-go-off-duty">
                        {t('home.end.goOffDuty')}
                    </BigButton>
                    {onLogFuel ? (
                        <BigButton variant="secondary" onPress={onLogFuel} testID="home-log-fuel">
                            {t('home.end.logFuel')}
                        </BigButton>
                    ) : null}
                </YStack>
            </YStack>
        );
    }

    /* -- On duty, nothing assigned ------------------------------------------ */

    if (!next) {
        return (
            <ScrollView style={screen} contentContainerStyle={{ gap: space[4], paddingBottom: tabBarSpace }} refreshControl={refreshControl} testID="today">
                {header}
                <YStack paddingHorizontal={space[4]} gap={space[4]}>
                    {noticeBanners}
                    {dutyErrorBanner}
                    <Rise>
                        <Card testID="today-empty">
                            <YStack gap={space[2]} paddingVertical={space[4]} alignItems="center">
                                <YStack width={12} height={12} borderRadius={6} backgroundColor="$successText" />
                                <Body fontSize={20} lineHeight={26} fontWeight="800" center>
                                    {t('home.empty.title')}
                                </Body>
                                <Secondary fontSize={14} lineHeight={20} center>
                                    {offers.length ? t('home.empty.bodyOffers') : t('home.empty.body')}
                                </Secondary>
                            </YStack>
                        </Card>
                    </Rise>
                    {offersCard ? <Rise delay={70}>{offersCard}</Rise> : null}
                    {attention.length ? (
                        <Rise delay={140}>
                            <YStack gap={10} testID="home-attention">
                                <SectionLabel>{t('home.attention.section')}</SectionLabel>
                                {attention}
                            </YStack>
                        </Rise>
                    ) : null}
                </YStack>
            </ScrollView>
        );
    }

    /* -- On duty with work: the next waypoint -------------------------------- */

    const eta: ChosenEta = tracker ? chooseEta(tracker) : { kind: 'none', stale: false };
    const etaAt = eta.kind === 'none' ? undefined : (eta.at ?? (eta.seconds != null ? new Date(Date.now() + eta.seconds * 1000).toISOString() : undefined));
    const insights = tracker?.insights;
    // The first leg ends at the waypoint being headed to, so its length is the road distance to it.
    const roadM = tracker?.route?.legs?.[0]?.distance_m;
    const straightM = position && next.point ? haversineM(position, next.point) : undefined;
    const arrived = manifest?.stops?.find((stop) => stop.id === next.stopId)?.status === 'arrived';

    const heroStats: Stat[] = [];
    if (etaAt && eta.kind === 'live') heroStats.push({ key: 'arrive', value: formatClock(etaAt), label: t('home.hero.arrive') });
    else if (etaAt && eta.kind === 'start') heroStats.push({ key: 'start', value: formatClock(etaAt), label: t('home.hero.start') });
    else if (next.plannedAt) heroStats.push({ key: 'planned', value: formatClock(next.plannedAt), label: t('home.hero.planned') });

    if (roadM != null && Number.isFinite(Number(roadM))) {
        heroStats.push({
            key: 'distance',
            value: formatMeters(Number(roadM), units),
            label: eta.kind === 'live' && eta.seconds != null ? t('home.hero.away', { duration: formatDuration(eta.seconds) }) : t('home.hero.byRoad'),
        });
    } else if (straightM != null) {
        // Not a road distance, and it says so.
        heroStats.push({ key: 'distance', value: formatMeters(straightM, units), label: t('home.hero.straightLine') });
    }

    // The waypoint's own window, else the one the tracker reports for where the driver is heading.
    const windowEnd = next.windowEnd ?? (eta.kind === 'live' ? (insights?.due_by ?? undefined) : undefined);
    if (windowEnd) {
        const due = formatClock(windowEnd);
        if (etaAt && eta.kind === 'live') {
            const late = Date.parse(etaAt) > Date.parse(windowEnd);
            heroStats.push({ key: 'due', value: late ? t('home.hero.late') : t('home.hero.onTime'), tone: late ? 'danger' : 'success', label: t('home.hero.dueBy', { time: due }) });
        } else {
            heroStats.push({ key: 'due', value: due, label: t('home.hero.deliverBy') });
        }
    }

    const kindLabel = next.kind ? t(`home.kind.${next.kind}`) : undefined;
    const eyebrow = [arrived ? t('home.hero.arrived') : t('home.hero.next'), kindLabel].filter(Boolean).join(' · ');
    const route = tracker ? decodePolyline(tracker.route?.polyline) : [];
    const destination: Destination | undefined = next.point ? { ...next.point, label: next.name ?? next.address } : undefined;
    const finishAt = day.finishAt ?? (eta.kind === 'live' && day.total - day.done === (tracker?.progress?.remaining_stops ?? -1) ? (tracker?.eta?.completion_at ?? undefined) : undefined);
    const showMap = !!next.point;

    return (
        <ScrollView style={screen} contentContainerStyle={{ paddingBottom: tabBarSpace }} refreshControl={refreshControl} testID="today">
            {showMap ? (
                <YStack>
                    <HomeMap waypoints={day.waypoints} activeKey={next.key} route={route} position={position} dark={dark} height={MAP_HEIGHT} padding={{ top: 52, bottom: SHEET_OVERLAP }} />
                    <XStack position="absolute" top={space[2]} left={space[4]} right={space[4]} alignItems="center" justifyContent="space-between" gap={space[2]}>
                        <OrgChip name={organizationName} />
                        <DutyChip duty={duty} onPress={openDutySheet} t={t} floating />
                    </XStack>
                </YStack>
            ) : (
                header
            )}

            <YStack
                marginTop={showMap ? -SHEET_OVERLAP : space[4]}
                borderTopLeftRadius={showMap ? 22 : 0}
                borderTopRightRadius={showMap ? 22 : 0}
                borderTopWidth={showMap ? 1 : 0}
                borderColor="$border"
                backgroundColor="$background"
                paddingTop={showMap ? 18 : 0}
                paddingHorizontal={space[4]}
                gap={14}
            >
                {noticeBanners}
                {dutyErrorBanner}

                <Rise>
                    <YStack gap={14} testID="today-next-stop">
                        <WaypointTitle waypoint={next} eyebrow={eyebrow} t={t} />

                        {heroStats.length ? (
                            <Card testID={`today-eta-${eta.kind}`}>
                                <StatRow stats={heroStats} size={heroStats.length > 2 ? 24 : 26} />
                            </Card>
                        ) : null}

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

                        <XStack gap={space[2]}>
                            {onNavigate && destination ? (
                                <YStack flex={1}>
                                    <BigButton
                                        onPress={() => onNavigate(destination, next.source === 'order' ? next.orderId : undefined)}
                                        icon={<HomeIcon name="navigate" color={theme.onPrimary?.val as string} />}
                                        gap={10}
                                        testID="today-navigate"
                                    >
                                        {t('today.navigate')}
                                    </BigButton>
                                </YStack>
                            ) : null}
                            {canOpen(next) ? (
                                <YStack flex={onNavigate && destination ? undefined : 1}>
                                    <BigButton variant="secondary" fullWidth={!(onNavigate && destination)} paddingHorizontal={20} onPress={() => openWaypoint(next)} testID="today-open-order">
                                        {next.source === 'manifest' ? t('home.hero.openWaypoint') : t('today.openOrder')}
                                    </BigButton>
                                </YStack>
                            ) : null}
                        </XStack>
                    </YStack>
                </Rise>

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
                        <SegmentBar total={day.total} done={day.done} hasCurrent />
                        {day.manifest?.status === 'draft' ? (
                            <Micro tone="warning" testID="home-draft-route">
                                {t('home.before.draft')}
                            </Micro>
                        ) : null}
                    </YStack>
                </Rise>

                {day.upcoming.length ? (
                    <Rise delay={140}>
                        <YStack gap={10} testID="home-upcoming">
                            <SectionLabel>{t('home.upcoming.section')}</SectionLabel>
                            <Card padded={false}>
                                {day.upcoming.map((waypoint, index) => (
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

                {offersCard ? <Rise delay={200}>{offersCard}</Rise> : null}

                {attention.length ? (
                    <Rise delay={240}>
                        <YStack gap={10} testID="home-attention">
                            <SectionLabel>{t('home.attention.section')}</SectionLabel>
                            {attention}
                        </YStack>
                    </Rise>
                ) : null}
            </YStack>
        </ScrollView>
    );
}

export default TodayScreen;
