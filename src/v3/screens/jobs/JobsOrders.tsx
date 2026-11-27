/**
 * Jobs → Orders — the simple Jobs design (JobsSimpleOrders.dc.html).
 *
 * Every order the driver has, with the one in hand in focus:
 *
 *   - the **current job** is one large card with its places, what it carries
 *     and a Continue button;
 *   - **offers nearby** stay in view as one row that opens the Offers screen;
 *   - the other orders follow as itinerary cards (card option B): every place
 *     named, in order, with its time when the plan gives one;
 *   - a **Completed** row at the foot opens the finished orders in place.
 *
 * Every shape the server allows goes through the same card: pickup + drop-off,
 * pickup + waypoints + drop-off, pickup + waypoints, and waypoints only (see
 * jobs/model). Only what the data supports is drawn: a place with no time shows
 * no time, and a card with nothing for its footer has no footer.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { FlatList } from '../../ui/Scroll';
import { Body, Secondary } from '../../ui/Text';
import { EmptyState, Skeleton } from '../../ui/Banner';
import { FailureState } from '../../ui/FailureState';
import { StopBadge } from '../../ui/RouteMap';
import { colorForId, describeWaypoint } from '../../ui/routeColors';
import { describeStatus } from '../../theme/status';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock, formatDuration, formatMeters, formatMoney } from '../../format';
import {
    cashOnDeliveryOf,
    customerNameOf,
    displayIdOf,
    haversineM,
    isOrderAbandoned,
    isOrderFinished,
    payloadOf,
    trackingNumberOf,
    useTracker,
    type LatLng,
    type OrderNotice,
    type OrderRecord,
} from '../../data';
import { dayKey } from '../../data/orderStore';
import { secondsLeft } from '../../data/useOffers';
import type { ApiError } from '../../api/NavigatorAdapter';
import { DottedRail } from '../home/parts';
import { CARD_RADIUS, FootChip, Glyph, GUTTER, ListHeading, Rise, SmallMark, SmallRail, TagPill } from './parts';
import { OrderNotices } from './OrderNotices';
import { addDays, weekdayDayMonth, mondayOf } from './dates';
import { inWorkingOrder, isOrderStarted, orderPoints, orderTypeLabel, scheduleDayOf, type OrderPoint, type PointTime } from './model';

type T = (key: string, options?: Record<string, unknown>) => string;

/** Case-insensitive match across the fields a driver would actually search by. */
export function orderMatches(order: OrderRecord, query: string): boolean {
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

/** "Pickup", "Dropoff", "Waypoint": what a place is to its order, in the Jobs wording. */
export function kindLabel(role: OrderPoint['role'] | undefined, t: T): string {
    return t(`jobs.kind.${role ?? 'waypoint'}`);
}

/** The order's state as a pill: a word and an icon, so it never rests on colour. */
function OrderPill({ order, t }: { order: OrderRecord; t: T }) {
    const status = describeStatus(order.status);
    const own = order.status ? t(status.labelKey, { defaultValue: status.defaultLabel }) : undefined;
    if (isOrderFinished(order)) {
        return isOrderAbandoned(order as { status?: string }) ? (own ? <TagPill label={own} icon="close" /> : null) : <TagPill label={own ?? t('jobs.state.done')} icon="check" tone="success" />;
    }
    if (isOrderStarted(order)) return <TagPill label={t('jobs.pill.inProgress')} icon="play" tone="brand" />;
    if (order.scheduled_at) return <TagPill label={t('jobs.pill.scheduled')} icon="clock" />;
    return own ? <TagPill label={own} icon="clock" /> : null;
}

/** More places than this and the middle of the itinerary is counted, not listed. */
const ITINERARY_MAX = 7;

export interface OrderCardProps {
    order: OrderRecord;
    /** `orderId:placeId` → the day plan's times for that place. */
    times?: Map<string, PointTime>;
    /** Say the day beside the first time: the card sits in a list that runs over several days. */
    showDay?: boolean;
    onPress?: () => void;
    t: T;
}

/**
 * The order card, option B (CardOptions.dc.html): the tracking number and who it
 * is for, the order's places as an itinerary, and a footer of what it carries.
 */
export const OrderCard = memo(function OrderCard({ order, times, showDay, onPress, t }: OrderCardProps) {
    const points = orderPoints(order);
    const started = isOrderStarted(order);
    const finished = isOrderFinished(order);
    const inHand = started && !finished;
    const color = colorForId(order.id);
    const customer = customerNameOf(order);
    const sub = customer ?? orderTypeLabel(order);
    const itemCount = payloadOf(order).entities?.length ?? 0;
    const cash = cashOnDeliveryOf(order);

    // The place the eye should land on: the one being headed to, else the first still to do.
    const nextIndex = finished ? -1 : points.findIndex((p) => p.state === 'current') >= 0 ? points.findIndex((p) => p.state === 'current') : points.findIndex((p) => p.state === 'later');

    const folded = points.length > ITINERARY_MAX;
    const shown = folded ? [...points.slice(0, 3).map((p, i) => ({ p, i })), ...points.slice(-3).map((p, i) => ({ p, i: points.length - 3 + i }))] : points.map((p, i) => ({ p, i }));

    /*
     * A place's time is the day plan's when there is one (the manifest's
     * estimate, or when the driver got there). Without a plan, the only time the
     * order itself carries is when it is scheduled to start, which is the time
     * of its first place. Nothing is worked out on the phone.
     */
    const timeOf = (point: OrderPoint, index: number): { text: string; done?: boolean } | undefined => {
        const planned = point.id ? times?.get(`${order.id}:${point.id}`) : undefined;
        if (point.state === 'done') return { text: planned?.arrivedAt ? t('jobs.orders.doneAt', { time: formatClock(planned.arrivedAt) }) : t('jobs.state.done'), done: true };
        if (point.state === 'skipped') return { text: t('jobs.state.skipped') };
        if (planned?.eta) return { text: formatClock(planned.eta) };
        if (index === 0 && !started && order.scheduled_at) {
            const clock = formatClock(order.scheduled_at);
            return { text: showDay ? `${weekdayDayMonth(dayKey(order.scheduled_at))} · ${clock}` : clock };
        }
        return undefined;
    };

    const chips = [
        points.length > 2 || (!itemCount && !cash?.toCollect && points.length > 0) ? { key: 'waypoints', label: t('jobs.orders.waypoints', { count: points.length }) } : null,
        itemCount ? { key: 'items', label: t('ordersScreen.itemCount', { count: itemCount }) } : null,
        !finished && cash?.toCollect ? { key: 'cash', label: t('jobs.orders.cash', { amount: formatMoney(cash.amount, cash.currency) }), tone: 'warning' as const } : null,
    ].filter(Boolean) as { key: string; label: string; tone?: 'warning' }[];

    return (
        <YStack
            borderRadius={CARD_RADIUS}
            overflow="hidden"
            backgroundColor={inHand ? '$primaryFill' : '$surface'}
            borderWidth={inHand ? 1.5 : 1}
            borderColor={inHand ? '$primary' : '$border'}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('jobs.openOrder', { order: displayIdOf(order) })}
            testID={`order-${order.id}`}
        >
            <XStack alignItems="center" gap={12} paddingHorizontal={14} paddingTop={14} paddingBottom={12}>
                <YStack flex={1} minWidth={0} gap={2}>
                    {/* In full, on its own line: it is read against a parcel label. */}
                    <Body fontFamily="$mono" fontSize={16} lineHeight={21} fontWeight="600" testID={`order-${order.id}-tracking`}>
                        {displayIdOf(order)}
                    </Body>
                    {sub ? (
                        <Secondary fontSize={13} lineHeight={17} numberOfLines={1}>
                            {sub}
                        </Secondary>
                    ) : null}
                </YStack>
                <OrderPill order={order} t={t} />
            </XStack>

            {shown.length ? (
                <YStack paddingHorizontal={14} paddingBottom={chips.length ? 0 : 2} testID={`order-${order.id}-shape`}>
                    {shown.map(({ p, i }, row) => {
                        const last = row === shown.length - 1;
                        const mark = describeWaypoint(p.role, p.waypointNumber ?? i + 1, color);
                        const time = timeOf(p, i);
                        const isNext = i === nextIndex;
                        const quiet = p.state === 'done' || p.state === 'skipped';
                        const hidden = folded && row === 2 ? points.length - shown.length : 0;
                        return (
                            <YStack key={p.id ?? i}>
                                <XStack gap={12}>
                                    <YStack width={26} alignItems="center">
                                        <SmallMark label={mark.label} color={mark.color} state={p.state} />
                                        {last ? null : <SmallRail done={p.state === 'done'} />}
                                    </YStack>
                                    <XStack flex={1} minWidth={0} alignItems="baseline" justifyContent="space-between" gap={10} paddingTop={3} paddingBottom={12}>
                                        <Body flex={1} fontSize={15} lineHeight={20} fontWeight={isNext ? '800' : quiet ? '600' : '700'} tone={quiet ? 'secondary' : 'primary'} numberOfLines={1}>
                                            {p.name ?? p.address ?? kindLabel(p.role, t)}
                                        </Body>
                                        {time ? (
                                            <Body flexShrink={0} fontSize={13} lineHeight={20} fontWeight="700" tabular numberOfLines={1} tone={time.done ? 'success' : isNext ? 'primary' : 'secondary'}>
                                                {time.text}
                                            </Body>
                                        ) : null}
                                    </XStack>
                                </XStack>
                                {hidden ? (
                                    <XStack gap={12}>
                                        <YStack width={26} alignItems="center">
                                            <SmallRail minHeight={30} />
                                        </YStack>
                                        <Secondary flex={1} fontSize={13} lineHeight={18} fontWeight="700" tabular paddingBottom={12}>
                                            {t('jobs.orders.moreWaypoints', { count: hidden })}
                                        </Secondary>
                                    </XStack>
                                ) : null}
                            </YStack>
                        );
                    })}
                </YStack>
            ) : null}

            {chips.length ? (
                <XStack flexWrap="wrap" gap={6} paddingHorizontal={14} paddingVertical={10} borderTopWidth={1} borderColor="$border" backgroundColor="$background" testID={`order-${order.id}-footer`}>
                    {chips.map((chip) => (
                        <FootChip key={chip.key} label={chip.label} tone={chip.tone} />
                    ))}
                </XStack>
            ) : null}
        </YStack>
    );
});

/** More places than this still to do and the focused card counts the rest. */
const CURRENT_MAX = 4;

/**
 * The job in hand: one card in focus, with the places still to drive to, what
 * the order carries, and Continue.
 */
function CurrentJobCard({ order, units, onContinue, t }: { order: OrderRecord; units: 'metric' | 'imperial'; onContinue?: () => void; t: T }) {
    const theme = useTheme();
    const points = orderPoints(order);
    const ahead = points.filter((p) => p.state === 'current' || p.state === 'later');
    const heading = ahead.find((p) => p.state === 'current') ?? ahead[0];
    const shown = ahead.slice(0, CURRENT_MAX);
    const more = ahead.length - shown.length;
    const color = colorForId(order.id);
    const customer = customerNameOf(order);
    const itemCount = payloadOf(order).entities?.length ?? 0;
    const cash = cashOnDeliveryOf(order);

    // The road to the place being headed to, from the order's tracker. Absent rather than estimated.
    const { tracker } = useTracker(order.id);
    const leg = tracker?.route?.legs?.[0];
    const legLine = [leg?.distance_m != null && Number.isFinite(Number(leg.distance_m)) ? formatMeters(Number(leg.distance_m), units) : null, leg?.duration_s != null && Number.isFinite(Number(leg.duration_s)) ? formatDuration(Number(leg.duration_s)) : null]
        .filter(Boolean)
        .join(' · ');

    const eyebrow = [t('jobs.current.label'), order.scheduled_at && dayKey(order.scheduled_at) === dayKey() ? formatClock(order.scheduled_at) : null].filter(Boolean).join(' · ');

    return (
        <YStack
            padding={14}
            borderRadius={CARD_RADIUS}
            backgroundColor="$primaryFill"
            borderWidth={1.5}
            borderColor="$primary"
            shadowColor="$shadowColor"
            shadowOpacity={0.3}
            shadowRadius={16}
            shadowOffset={{ width: 0, height: 10 }}
            onPress={onContinue}
            pressStyle={onContinue ? { opacity: 0.85 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('jobs.current.open', { order: displayIdOf(order) })}
            testID="jobs-current"
        >
            <XStack alignItems="center" justifyContent="space-between" gap={12}>
                <Body flexShrink={1} fontSize={13} lineHeight={18} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tabular tone="brand" numberOfLines={1}>
                    {eyebrow}
                </Body>
                {heading ? <TagPill label={t(`jobs.current.heading.${heading.role}`)} icon="navigate" tone="brand" testID="jobs-current-heading" /> : null}
            </XStack>
            {/* In full, never cut short: it is read against a label. */}
            <Body fontFamily="$mono" paddingTop={6} fontSize={18} lineHeight={24} fontWeight="600" testID={`order-${order.id}-tracking`}>
                {displayIdOf(order)}
            </Body>
            {customer ? (
                <Body fontSize={16} lineHeight={22} tone="secondary" numberOfLines={1}>
                    {customer}
                </Body>
            ) : null}

            {shown.length ? (
                <YStack paddingTop={14}>
                    {shown.map((p, index) => {
                        const last = index === shown.length - 1;
                        const current = p === heading && p.state === 'current';
                        return (
                            <XStack key={p.id ?? index} gap={12}>
                                <YStack width={32} alignItems="center">
                                    {/* The console's marker, the same one as on the map. Its frame is wider than the rail, so it is centred over it. */}
                                    <YStack width={32} height={32} alignItems="center" justifyContent="center">
                                        <StopBadge kind={p.role} number={p.waypointNumber} color={color} state={current ? 'current' : 'pending'} />
                                    </YStack>
                                    {last ? null : <DottedRail />}
                                </YStack>
                                <YStack flex={1} minWidth={0} paddingBottom={last ? 0 : 12}>
                                    <Body fontSize={13} lineHeight={18} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tone={current ? 'success' : 'secondary'} numberOfLines={1}>
                                        {current ? `${kindLabel(p.role, t)} · ${t('jobs.state.heading')}` : kindLabel(p.role, t)}
                                    </Body>
                                    <Body fontSize={18} lineHeight={24} fontWeight={current ? '800' : '700'} letterSpacing={current ? -0.2 : 0} numberOfLines={1}>
                                        {p.name ?? p.address ?? kindLabel(p.role, t)}
                                    </Body>
                                    {current && legLine ? (
                                        <Body fontSize={15} lineHeight={20} fontWeight="700" tabular tone="secondary" numberOfLines={1} testID="jobs-current-leg">
                                            {legLine}
                                        </Body>
                                    ) : null}
                                </YStack>
                            </XStack>
                        );
                    })}
                    {more > 0 ? (
                        <Secondary paddingStart={44} paddingTop={8} fontSize={15} lineHeight={20} fontWeight="700" tabular>
                            {t('jobs.orders.moreWaypoints', { count: more })}
                        </Secondary>
                    ) : null}
                </YStack>
            ) : null}

            {itemCount || cash?.toCollect ? (
                <XStack flexWrap="wrap" gap={6} paddingTop={12}>
                    {itemCount ? <FootChip large icon="box" label={t('ordersScreen.itemCount', { count: itemCount })} /> : null}
                    {cash?.toCollect ? <FootChip large icon="cash" tone="warning" label={t('jobs.orders.cash', { amount: formatMoney(cash.amount, cash.currency) })} /> : null}
                </XStack>
            ) : null}

            <XStack
                marginTop={12}
                height={56}
                borderRadius={16}
                alignItems="center"
                justifyContent="center"
                gap={10}
                backgroundColor="$primary"
                onPress={onContinue}
                pressStyle={{ opacity: 0.8 }}
                accessibilityRole="button"
                accessibilityLabel={t('jobs.current.continue')}
                testID="jobs-current-continue"
            >
                <Glyph name="navigate" size={19} color={theme.onPrimary?.val as string} />
                <Body fontSize={18} lineHeight={24} fontWeight="800" tone="onPrimary" numberOfLines={1}>
                    {t('jobs.current.continue')}
                </Body>
            </XStack>
        </YStack>
    );
}

function formatCountdown(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Offers nearby, kept in view as one row. It says how many, how far the nearest
 * pickup is, and how long is left on an offer made to this driver alone. The
 * accepting is done on the Offers screen, which this opens.
 */
function OffersRow({ offers, position, units, onPress, t }: { offers: OrderRecord[]; position?: LatLng | null; units: 'metric' | 'imperial'; onPress?: () => void; t: T }) {
    const theme = useTheme();
    const timed = offers.some((order) => secondsLeft(order) !== null);
    const [now, setNow] = useState(() => Date.now());
    // The countdown ticks only while there is one to show.
    useEffect(() => {
        if (!timed) return undefined;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [timed]);

    const open = offers.filter((order) => secondsLeft(order, now) !== 0);
    if (!open.length) return null;

    // In a straight line from the phone to where each offer starts; the nearest one is the one spoken for.
    const withDistance = open
        .map((order) => {
            const first = orderPoints(order)[0]?.point;
            return { order, meters: position && first ? haversineM(position, first) : undefined };
        })
        .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));
    const nearest = withDistance[0];
    const away = nearest.meters != null ? t('jobs.offers.away', { distance: formatMeters(nearest.meters, units) }) : undefined;
    const waypointCount = open.length === 1 ? orderPoints(nearest.order).length : 0;
    const detail = [open.length > 1 && away ? t('jobs.offers.nearest', { distance: away }) : away, waypointCount ? t('jobs.orders.waypoints', { count: waypointCount }) : null].filter(Boolean).join(' · ');
    const lefts = open.map((order) => secondsLeft(order, now)).filter((s): s is number => s !== null);
    const left = lefts.length ? Math.min(...lefts) : null;

    return (
        <XStack
            height={68}
            alignItems="center"
            gap={12}
            paddingStart={14}
            paddingEnd={12}
            borderRadius={CARD_RADIUS}
            backgroundColor="$warningFill"
            borderWidth={1.5}
            borderColor="$warningBorder"
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={[t('jobs.offers.nearby', { count: open.length }), detail, left !== null ? t('jobs.offers.left', { time: formatCountdown(left) }) : null, t('jobs.offers.opens')].filter(Boolean).join(', ')}
            testID="orders-open-offers"
        >
            <YStack width={40} height={40} borderRadius={20} alignItems="center" justifyContent="center" backgroundColor="$warningFill" borderWidth={1} borderColor="$warningBorder">
                <Glyph name="bolt" size={18} color={theme.warningText?.val as string} />
            </YStack>
            <YStack flex={1} minWidth={0}>
                <Body fontSize={17} lineHeight={23} fontWeight="800" tabular numberOfLines={1}>
                    {t('jobs.offers.nearby', { count: open.length })}
                </Body>
                {detail ? (
                    <Body fontSize={15} lineHeight={20} tabular tone="secondary" numberOfLines={1}>
                        {detail}
                    </Body>
                ) : null}
            </YStack>
            {left !== null ? (
                <Body flexShrink={0} fontSize={17} fontWeight="800" tabular tone="warning" numberOfLines={1} testID="orders-offers-countdown">
                    {t('jobs.offers.left', { time: formatCountdown(left) })}
                </Body>
            ) : null}
            <Glyph name="chevron" size={16} color={theme.textSecondary?.val as string} strokeWidth={2.6} />
        </XStack>
    );
}

/** The row that leads to past work: a tick, the word, and how much there is. */
function CompletedRow({ summary, open, onPress, t }: { summary?: string; open: boolean; onPress: () => void; t: T }) {
    const theme = useTheme();
    return (
        <XStack
            height={56}
            alignItems="center"
            gap={12}
            paddingStart={14}
            paddingEnd={12}
            borderRadius={CARD_RADIUS}
            borderWidth={1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={[t('jobs.completed.title'), summary].filter(Boolean).join(', ')}
            testID="orders-completed"
        >
            <YStack width={28} height={28} borderRadius={14} alignItems="center" justifyContent="center" backgroundColor="$successFill" borderWidth={1} borderColor="$successBorder">
                <Glyph name="check" size={14} color={theme.successText?.val as string} strokeWidth={3.6} />
            </YStack>
            <Body flexShrink={0} fontSize={17} fontWeight="800" numberOfLines={1}>
                {t('jobs.completed.title')}
            </Body>
            <Body flex={1} fontSize={15} tabular tone="secondary" numberOfLines={1}>
                {summary ?? ''}
            </Body>
            <Glyph name={open ? 'chevronDown' : 'chevron'} size={16} color={theme.textSecondary?.val as string} strokeWidth={2.4} />
        </XStack>
    );
}

type Row =
    | { key: string; kind: 'heading'; title: string; aside?: string }
    | { key: string; kind: 'order'; order: OrderRecord; showDay?: boolean }
    | { key: string; kind: 'completed' }
    | { key: string; kind: 'empty' };

export interface JobsOrdersProps {
    orders: OrderRecord[];
    /** `orderId:placeId` → the day plan's times for that place. */
    times: Map<string, PointTime>;
    notices: OrderNotice[];
    /** Offers this driver could take. Empty when there are none, or when the driver is offline. */
    offers: OrderRecord[];
    position?: LatLng | null;
    units: 'metric' | 'imperial';
    /** What the driver typed in the header's search; empty when not searching. */
    query: string;
    onClearQuery: () => void;
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

export function JobsOrders({ orders, times, notices, offers, position, units, query, onClearQuery, state, error, isOnline, isRefreshing, onRefresh, onRetry, onOpenOrder, onOpenOffers, bottomSpace }: JobsOrdersProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const [showCompleted, setShowCompleted] = useState(false);

    const groups = useMemo(() => {
        const today = dayKey();
        const open = inWorkingOrder(orders.filter((o) => !isOrderFinished(o)));
        const current = open.find((o) => isOrderStarted(o));
        const rest = open.filter((o) => o !== current);
        const todays = rest.filter((o) => (scheduleDayOf(o, today) ?? today) <= today);
        const later = rest.filter((o) => (scheduleDayOf(o, today) ?? today) > today).sort((a, b) => String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? '')));
        const stamp = (o: OrderRecord) => String(o.scheduled_at ?? (o as { updated_at?: unknown }).updated_at ?? o.created_at ?? '');
        const completed = orders.filter((o) => isOrderFinished(o)).sort((a, b) => stamp(b).localeCompare(stamp(a)));

        // "Yesterday 4 · this week 11": finished orders by the day they were scheduled for, cancelled ones left out.
        const done = completed.filter((o) => !isOrderAbandoned(o as { status?: string }));
        const yesterday = addDays(today, -1);
        const monday = mondayOf(today);
        let onYesterday = 0;
        let thisWeek = 0;
        for (const order of done) {
            const day = scheduleDayOf(order, today);
            if (!day) continue;
            if (day === yesterday) onYesterday += 1;
            if (day >= monday && day <= today) thisWeek += 1;
        }
        return { current, todays, later, completed, onYesterday, thisWeek };
    }, [orders]);

    const completedSummary = useMemo(() => {
        const text = [groups.onYesterday ? t('jobs.completed.yesterday', { count: groups.onYesterday }) : null, groups.thisWeek ? t('jobs.completed.thisWeek', { count: groups.thisWeek }) : null].filter(Boolean).join(' · ');
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : undefined;
    }, [groups.onYesterday, groups.thisWeek, t]);

    const searching = query.trim().length > 0;

    const rows = useMemo<Row[]>(() => {
        if (searching) {
            const found = orders.filter((o) => orderMatches(o, query.trim()));
            return found.map((order) => ({ key: order.id, kind: 'order' as const, order, showDay: true }));
        }
        const list: Row[] = [];
        if (groups.todays.length) {
            list.push({ key: 'h-today', kind: 'heading', title: t(groups.current ? 'jobs.orders.nextToday' : 'jobs.orders.today'), aside: t('jobs.orders.count', { count: groups.todays.length }) });
            for (const order of groups.todays) list.push({ key: order.id, kind: 'order', order });
        }
        if (groups.later.length) {
            list.push({ key: 'h-later', kind: 'heading', title: t('jobs.orders.later'), aside: t('jobs.orders.count', { count: groups.later.length }) });
            for (const order of groups.later) list.push({ key: order.id, kind: 'order', order, showDay: true });
        }
        // Nothing in hand and nothing waiting: say so, above the way to past work.
        if (!groups.current && !groups.todays.length && !groups.later.length) list.push({ key: 'empty', kind: 'empty' });
        if (groups.completed.length) {
            list.push({ key: 'completed', kind: 'completed' });
            if (showCompleted) for (const order of groups.completed) list.push({ key: order.id, kind: 'order', order, showDay: true });
        }
        return list;
    }, [searching, query, orders, groups, showCompleted, t]);

    const renderItem = useCallback(
        ({ item, index }: { item: Row; index: number }) => {
            if (item.kind === 'heading') {
                return (
                    <YStack paddingHorizontal={GUTTER} paddingTop={18} paddingBottom={8}>
                        <ListHeading title={item.title} aside={item.aside} testID={`orders-${item.key}`} />
                    </YStack>
                );
            }
            if (item.kind === 'completed') {
                return (
                    <YStack paddingHorizontal={GUTTER} paddingTop={index === 0 ? 16 : 8} paddingBottom={8}>
                        <CompletedRow summary={completedSummary} open={showCompleted} onPress={() => setShowCompleted((v) => !v)} t={t} />
                    </YStack>
                );
            }
            if (item.kind === 'empty') {
                return (
                    <YStack paddingHorizontal={GUTTER} paddingTop={16} paddingBottom={8}>
                        <EmptyState testID="orders-empty" title={t('ordersScreen.emptyActiveTitle')} body={t('ordersScreen.emptyActiveBody')} />
                    </YStack>
                );
            }
            return (
                <YStack paddingHorizontal={GUTTER} paddingBottom={8} paddingTop={searching && index === 0 ? 16 : 0}>
                    <Rise index={index}>
                        <OrderCard order={item.order} times={times} showDay={item.showDay} onPress={onOpenOrder ? () => onOpenOrder(item.order.id) : undefined} t={t} />
                    </Rise>
                </YStack>
            );
        },
        [completedSummary, showCompleted, searching, times, onOpenOrder, t]
    );

    const loading = state === 'loading' && !orders.length;
    const failed = state === 'error' && !orders.length;

    const header = (
        <YStack>
            {notices.length ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={12}>
                    {/* An order that left the list says so once, in one line, and clears itself. */}
                    <OrderNotices notices={notices} testID="order-notices" />
                </YStack>
            ) : null}
            {!searching && groups.current ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={16}>
                    <Rise>
                        <CurrentJobCard key={groups.current.id} order={groups.current} units={units} onContinue={onOpenOrder ? () => onOpenOrder((groups.current as OrderRecord).id) : undefined} t={t} />
                    </Rise>
                </YStack>
            ) : null}
            {!searching && offers.length ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={groups.current ? 12 : 16}>
                    <OffersRow offers={offers} position={position} units={units} onPress={onOpenOffers} t={t} />
                </YStack>
            ) : null}
        </YStack>
    );

    const empty = loading ? (
        <YStack paddingHorizontal={GUTTER} paddingTop={16} gap={8} testID="orders-skeleton">
            {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={148} borderRadius={CARD_RADIUS} />
            ))}
        </YStack>
    ) : failed ? (
        <YStack paddingHorizontal={GUTTER} paddingTop={16}>
            <FailureState error={error} isOnline={isOnline} onRetry={onRetry} t={t} testID="orders-error" />
        </YStack>
    ) : searching ? (
        <YStack paddingHorizontal={GUTTER} paddingTop={16}>
            <EmptyState testID="orders-no-results" title={t('ordersScreen.noSearchResultsTitle')} body={t('ordersScreen.noSearchResultsBody', { query: query.trim() })} action={{ label: t('common.clear'), onPress: onClearQuery }} />
        </YStack>
    ) : null;

    return (
        <YStack flex={1} testID="orders-list-view">
            <FlatList
                data={loading || failed ? [] : rows}
                keyExtractor={(row) => row.key}
                renderItem={renderItem}
                ListHeaderComponent={loading || failed ? null : header}
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
