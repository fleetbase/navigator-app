/**
 * Jobs → Schedule — the simple Jobs design (JobsSimpleSchedule*.dc.html).
 *
 * The driver's orders by time, four ways, chosen with one small chip switch:
 *
 *   - **Dates** — a strip of the week (Monday to Sunday) with the chosen day's
 *     orders under it;
 *   - **Day** — the hours of one day, each order placed at its scheduled time;
 *   - **Week** — seven rows, one per day, with how many orders and when;
 *   - **Month** — a month grid with the days that have work marked, and the
 *     chosen day's orders under it.
 *
 * An order belongs to the day it is scheduled for, in the phone's own time; an
 * order with no schedule that is still in hand belongs to today (see
 * `scheduleDayOf`). Cancelled orders are not work and are left out.
 *
 * The Jobs screen's own query loads the driver's most recent orders, which may
 * not reach far back or far ahead. So this view asks for the orders scheduled
 * inside the month grid around what is on screen (whole weeks, up to six of
 * them) with the same `useOrderQuery`, told not to treat its answer as the
 * whole of the driver's orders. An order outside every window that has been
 * looked at is simply not on this phone, and its day shows as empty.
 *
 * Nothing here knows how long a job takes, so the Day view draws every order
 * as a block of one fixed height at its start time and never as a duration.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, RefreshControl, View } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { ScrollView } from '../../ui/Scroll';
import { Body } from '../../ui/Text';
import { EmptyState } from '../../ui/Banner';
import { useTranslation } from '../../i18n/useTranslation';
import { formatClock } from '../../format';
import { customerNameOf, displayIdOf, isOrderAbandoned, isOrderFinished, useOrderQuery, type OrderRecord } from '../../data';
import { dayKey } from '../../data/orderStore';
import { ArrowButton, CARD_RADIUS, ChipSwitch, Glyph, GUTTER, ListHeading } from './parts';
import { OrderCard } from './JobsOrders';
import { addDays, addMonths, dayMonth, dayNumber, instantRange, monthGrid, monthYear, rangeLabel, spokenDay, weekOf, weekdayDayMonth, weekdayShort } from './dates';
import { isOrderStarted, orderPoints, scheduleDayOf, type PointTime } from './model';

type T = (key: string, options?: Record<string, unknown>) => string;

export type ScheduleView = 'dates' | 'day' | 'week' | 'month';

/** What a day holds, worked out once for every view. */
interface DayWork {
    orders: OrderRecord[];
    /** Still to do, or being done. */
    open: OrderRecord[];
    done: number;
}

const NO_WORK: DayWork = { orders: [], open: [], done: 0 };

const whenOf = (order: OrderRecord) => String(order.scheduled_at ?? order.created_at ?? '');

/** The current time, refreshed often enough for a line that moves a pixel or two a minute. */
function useNow(everyMs = 30_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), everyMs);
        return () => clearInterval(timer);
    }, [everyMs]);
    return now;
}

/** "Today · Fri 27 Nov", "Tomorrow · Sat 28 Nov", or just the day. */
function dayTitle(day: string, today: string, t: T): string {
    const label = weekdayDayMonth(day);
    if (day === today) return `${t('jobs.schedule.today')} · ${label}`;
    if (day === addDays(today, 1)) return `${t('jobs.schedule.tomorrow')} · ${label}`;
    if (day === addDays(today, -1)) return `${t('jobs.schedule.yesterday')} · ${label}`;
    return label;
}

/** What a screen reader says for a day: its name and what it holds. */
function spokenWork(day: string, work: DayWork, t: T): string {
    const parts = [spokenDay(day)];
    if (work.open.length) parts.push(t('jobs.orders.count', { count: work.open.length }));
    if (work.done) parts.push(t('jobs.schedule.completed', { count: work.done }));
    if (!work.orders.length) parts.push(t('jobs.schedule.nothing'));
    return parts.join(', ');
}

/* -- Dates: the week strip ------------------------------------------------------ */

function WeekStrip({ days, selected, today, workOf, onSelect, onShift, t }: { days: string[]; selected: string; today: string; workOf: (day: string) => DayWork; onSelect: (day: string) => void; onShift: (weeks: number) => void; t: T }) {
    const theme = useTheme();
    // Sideways across the strip is "another week". The responder is made once, so it reads the callback through a ref.
    const shift = useRef(onShift);
    shift.current = onShift;
    const pan = useMemo(
        () =>
            PanResponder.create({
                // Asked on the way down as well as on the way up: a day under the finger is pressable and would otherwise keep the touch.
                onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
                onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
                onPanResponderRelease: (_event, gesture) => {
                    if (gesture.dx <= -40) shift.current(1);
                    else if (gesture.dx >= 40) shift.current(-1);
                },
            }),
        []
    );
    return (
        <View {...pan.panHandlers} accessibilityLabel={t('jobs.schedule.stripLabel')} testID="schedule-strip">
            <XStack gap={4}>
                {days.map((day) => {
                    const work = workOf(day);
                    const on = day === selected;
                    const past = day < today;
                    const ink = on ? (theme.onPrimary?.val as string) : undefined;
                    return (
                        <YStack
                            key={day}
                            flex={1}
                            flexBasis={0}
                            minWidth={0}
                            height={54}
                            paddingTop={6}
                            gap={1}
                            alignItems="center"
                            borderRadius={12}
                            borderWidth={1}
                            backgroundColor={on ? '$primary' : past ? 'transparent' : '$surface'}
                            borderColor={on || day === today ? '$primary' : '$border'}
                            onPress={() => onSelect(day)}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            accessibilityLabel={spokenWork(day, work, t)}
                            testID={`schedule-day-${day}`}
                        >
                            <Body fontSize={11} lineHeight={14} fontWeight="800" letterSpacing={0.4} textTransform="uppercase" numberOfLines={1} color={(ink ?? '$textSecondary') as never}>
                                {weekdayShort(day)}
                            </Body>
                            <Body fontSize={17} lineHeight={20} fontWeight="800" tabular numberOfLines={1} color={(ink ?? (past ? '$textSecondary' : work.orders.length ? '$textPrimary' : '$textMuted')) as never}>
                                {dayNumber(day)}
                            </Body>
                            {/* Dots for work still to do (three at most), a tick for a day that is all done. */}
                            <XStack height={9} alignItems="center" justifyContent="center" gap={2}>
                                {work.open.length ? (
                                    Array.from({ length: Math.min(work.open.length, 3) }, (_, index) => <YStack key={index} width={5} height={5} borderRadius={2.5} backgroundColor={(ink ?? '$primary') as never} />)
                                ) : work.done ? (
                                    <Glyph name="check" size={9} strokeWidth={4.5} color={ink ?? (theme.successText?.val as string)} />
                                ) : null}
                            </XStack>
                        </YStack>
                    );
                })}
            </XStack>
        </View>
    );
}

/* -- A step header: ‹ title › ---------------------------------------------------- */

function StepHeader({ title, sub, previous, next, onPrevious, onNext, testID }: { title: string; sub?: string; previous: string; next: string; onPrevious: () => void; onNext: () => void; testID?: string }) {
    return (
        <XStack alignItems="center" gap={8} testID={testID}>
            <ArrowButton direction="previous" label={previous} onPress={onPrevious} testID={testID ? `${testID}-previous` : undefined} />
            <YStack flex={1} minWidth={0} alignItems="center">
                <Body fontSize={20} lineHeight={26} fontWeight="800" letterSpacing={-0.2} numberOfLines={1} accessibilityRole="header">
                    {title}
                </Body>
                {sub ? (
                    <Body fontSize={15} lineHeight={20} fontWeight="700" tabular tone="secondary" numberOfLines={1}>
                        {sub}
                    </Body>
                ) : null}
            </YStack>
            <ArrowButton direction="next" label={next} onPress={onNext} testID={testID ? `${testID}-next` : undefined} />
        </XStack>
    );
}

/* -- Day: the hours ---------------------------------------------------------------- */

const HOUR = 84;
const BLOCK = 80;
const GRID_TOP = 16;

/** An order on the day's hours: its tracking number, who it is for, and where it runs from and to. */
function DayBlock({ order, top, onPress, t }: { order: OrderRecord; /** Left out for a block in normal flow (no set time). */ top?: number; onPress?: () => void; t: T }) {
    const inHand = isOrderStarted(order) && !isOrderFinished(order);
    const done = isOrderFinished(order);
    const points = orderPoints(order);
    const first = points[0];
    const last = points.length > 1 ? points[points.length - 1] : undefined;
    const way = [first?.name ?? first?.address, last?.name ?? last?.address].filter(Boolean).join(' → ');
    const who = customerNameOf(order) ?? first?.name ?? first?.address;
    return (
        <YStack
            {...(top != null ? { position: 'absolute' as const, top, left: 70, right: GUTTER } : {})}
            height={BLOCK}
            borderRadius={16}
            overflow="hidden"
            paddingTop={7}
            paddingStart={16}
            paddingEnd={12}
            backgroundColor={inHand ? '$primaryFill' : '$surface'}
            borderWidth={inHand ? 1.5 : 1}
            borderColor={inHand ? '$primary' : '$border'}
            opacity={done ? 0.7 : 1}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.75 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('jobs.openOrder', { order: displayIdOf(order) })}
            testID={`schedule-block-${order.id}`}
        >
            {/* The edge says the same thing as the words at the right: blue for the one in hand. */}
            <YStack position="absolute" left={0} top={0} bottom={0} width={5} backgroundColor={inHand ? '$primary' : done ? '$success' : '$textMuted'} />
            <XStack alignItems="center" justifyContent="space-between" gap={8}>
                {/* In full: a long one takes the room and the time gives way, never the other way round. */}
                <Body flexShrink={0} fontFamily="$mono" fontSize={15} lineHeight={22} fontWeight="600" tone="secondary">
                    {displayIdOf(order)}
                </Body>
                {inHand ? (
                    <Body flexShrink={1} fontSize={13} lineHeight={22} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tone="brand" numberOfLines={1}>
                        {t('jobs.pill.inProgress')}
                    </Body>
                ) : done ? (
                    <Body flexShrink={1} fontSize={13} lineHeight={22} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tone="success" numberOfLines={1}>
                        {t('jobs.state.done')}
                    </Body>
                ) : order.scheduled_at ? (
                    <Body flexShrink={1} fontSize={15} lineHeight={22} fontWeight="800" tabular numberOfLines={1}>
                        {formatClock(order.scheduled_at)}
                    </Body>
                ) : null}
            </XStack>
            {who ? (
                <Body fontSize={18} lineHeight={24} fontWeight="800" numberOfLines={1}>
                    {who}
                </Body>
            ) : null}
            {way ? (
                <Body fontSize={15} lineHeight={20} tone="secondary" numberOfLines={1}>
                    {way}
                </Body>
            ) : null}
        </YStack>
    );
}

function DayHours({ day, today, work, onOpenOrder, t }: { day: string; today: string; work: DayWork; onOpenOrder?: (id: string) => void; t: T }) {
    const now = useNow();
    const isToday = day === today;
    const nowDate = new Date(now);
    const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

    const { timed, untimed, startHour, endHour } = useMemo(() => {
        // Only an order scheduled on this very day has a place among its hours.
        const timed = work.orders
            .filter((o) => !!o.scheduled_at && dayKey(o.scheduled_at) === day)
            .map((order) => {
                const at = new Date(order.scheduled_at as string);
                return { order, minutes: at.getHours() * 60 + at.getMinutes() };
            })
            .sort((a, b) => a.minutes - b.minutes);
        const untimed = work.orders.filter((o) => !timed.some((entry) => entry.order === o));
        const hours = timed.map((entry) => Math.floor(entry.minutes / 60));
        const nowHour = Math.floor(nowMinutes / 60);
        const firstHour = hours.length ? Math.min(...hours) : undefined;
        const lastHour = hours.length ? Math.max(...hours) : undefined;
        // From the first thing on the day (or now, if that is earlier) to a little after the last.
        const startHour = Math.max(0, Math.min(firstHour ?? (isToday ? nowHour : 8), isToday ? nowHour : 24));
        const endHour = Math.min(24, Math.max((lastHour ?? startHour) + 2, isToday ? nowHour + 2 : 0, startHour + 6));
        return { timed, untimed, startHour, endHour };
        // The hour, not the minute: the grid's span only changes when the hour does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [work.orders, day, isToday, Math.floor(nowMinutes / 60)]);

    const yOf = (minutes: number) => GRID_TOP + ((minutes - startHour * 60) / 60) * HOUR;

    // Each block sits at its own time. Two that start close together cannot share the space, so the later one moves down just clear of the one before.
    let floor = -Infinity;
    const blocks = timed.map((entry) => {
        const top = Math.max(yOf(entry.minutes), floor);
        floor = top + BLOCK + 4;
        return { ...entry, top };
    });

    const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
    const gridHeight = Math.max(yOf(endHour * 60) + GRID_TOP, blocks.length ? blocks[blocks.length - 1].top + BLOCK + GRID_TOP : 0);
    const nowY = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60 ? yOf(nowMinutes) : undefined;

    return (
        <YStack>
            {untimed.length ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={12} gap={8} testID="schedule-day-untimed">
                    <Body fontSize={13} lineHeight={18} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tone="secondary">
                        {t('jobs.schedule.noSetTime')}
                    </Body>
                    {untimed.map((order) => (
                        <DayBlock key={order.id} order={order} onPress={onOpenOrder ? () => onOpenOrder(order.id) : undefined} t={t} />
                    ))}
                </YStack>
            ) : null}

            <View style={{ height: gridHeight, marginTop: 8 }} testID="schedule-day-hours">
                {hours.map((hour) => {
                    const y = yOf(hour * 60);
                    // The hour's label gives way to the "now" time when the two would sit on top of each other.
                    const hidden = nowY != null && Math.abs(nowY - y) < 18;
                    return (
                        <View key={hour} pointerEvents="none">
                            {hidden ? null : (
                                <Body position="absolute" left={GUTTER} top={y - 10} width={44} textAlign="right" fontSize={15} lineHeight={20} fontWeight="700" tabular tone="muted">
                                    {`${String(hour % 24).padStart(2, '0')}:00`}
                                </Body>
                            )}
                            <YStack position="absolute" left={70} right={GUTTER} top={y} height={1} backgroundColor="$border" opacity={0.7} />
                        </View>
                    );
                })}

                {blocks.map(({ order, top }) => (
                    <DayBlock key={order.id} order={order} top={top} onPress={onOpenOrder ? () => onOpenOrder(order.id) : undefined} t={t} />
                ))}

                {nowY != null ? (
                    <View pointerEvents="none" testID="schedule-now">
                        <YStack position="absolute" left={66} right={GUTTER} top={nowY - 1} height={2} backgroundColor="$danger" />
                        <YStack position="absolute" left={65} top={nowY - 5} width={10} height={10} borderRadius={5} backgroundColor="$danger" />
                        <YStack position="absolute" left={8} top={nowY - 11} width={52} height={22} borderRadius={11} alignItems="center" justifyContent="center" backgroundColor="$danger">
                            <Body fontSize={15} lineHeight={20} fontWeight="800" tabular color="#FFFFFF">
                                {formatClock(new Date(now).toISOString())}
                            </Body>
                        </YStack>
                        <Body position="absolute" right={GUTTER} top={nowY - 22} fontSize={13} lineHeight={18} fontWeight="800" letterSpacing={0.8} textTransform="uppercase" tone="danger">
                            {t('jobs.schedule.now')}
                        </Body>
                    </View>
                ) : null}
            </View>
        </YStack>
    );
}

/* -- Week: seven rows --------------------------------------------------------------- */

function WeekRow({ day, today, work, onPress, t }: { day: string; today: string; work: DayWork; onPress: () => void; t: T }) {
    const theme = useTheme();
    const isToday = day === today;
    const none = !work.orders.length;
    const allDone = !none && !work.open.length;
    const quiet = none || allDone;
    const clocks = work.open.filter((o) => !!o.scheduled_at && dayKey(o.scheduled_at) === day).map((o) => formatClock(o.scheduled_at));
    const times = clocks.length > 3 ? `${clocks.slice(0, 3).join(' · ')} · +${clocks.length - 3}` : clocks.join(' · ');
    return (
        <XStack
            height={60}
            alignItems="center"
            gap={12}
            paddingStart={14}
            paddingEnd={10}
            borderRadius={CARD_RADIUS}
            backgroundColor={isToday ? '$primaryFill' : quiet ? 'transparent' : '$surface'}
            borderWidth={isToday ? 1.5 : 1}
            borderColor={isToday ? '$primary' : '$border'}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={spokenWork(day, work, t)}
            testID={`schedule-week-${day}`}
        >
            <YStack width={46} flexShrink={0}>
                <Body fontSize={15} lineHeight={18} fontWeight="700" tone={isToday ? 'brand' : 'secondary'} numberOfLines={1}>
                    {isToday ? t('jobs.schedule.today') : weekdayShort(day)}
                </Body>
                <Body fontSize={20} lineHeight={24} fontWeight="800" tabular tone={none ? 'muted' : allDone && !isToday ? 'secondary' : 'primary'}>
                    {dayNumber(day)}
                </Body>
            </YStack>
            {none ? (
                <Body flex={1} minWidth={0} fontSize={17} fontWeight="600" tone="muted" numberOfLines={1}>
                    {t('jobs.schedule.nothing')}
                </Body>
            ) : allDone ? (
                <XStack flex={1} minWidth={0} alignItems="center" gap={8}>
                    <Glyph name="check" size={16} strokeWidth={3.6} color={theme.successText?.val as string} />
                    <Body flexShrink={1} fontSize={17} fontWeight="700" tabular tone="success" numberOfLines={1}>
                        {t('jobs.schedule.completed', { count: work.done })}
                    </Body>
                </XStack>
            ) : (
                <>
                    <Body flex={1} minWidth={0} fontSize={17} fontWeight="800" tabular numberOfLines={1}>
                        {t('jobs.orders.count', { count: work.open.length })}
                    </Body>
                    {times ? (
                        <Body flexShrink={0} fontSize={15} fontWeight="700" tabular tone="secondary" numberOfLines={1}>
                            {times}
                        </Body>
                    ) : null}
                </>
            )}
            {none ? null : <Glyph name="chevron" size={16} strokeWidth={2.4} color={(allDone ? theme.textMuted?.val : theme.textSecondary?.val) as string} />}
        </XStack>
    );
}

/* -- Month: the grid ---------------------------------------------------------------- */

function MonthGrid({ days, month, selected, today, workOf, onSelect, t }: { days: string[]; /** `YYYY-MM` of the month on show. */ month: string; selected: string; today: string; workOf: (day: string) => DayWork; onSelect: (day: string) => void; t: T }) {
    const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));
    return (
        <YStack testID="schedule-month-grid">
            <XStack accessibilityElementsHidden importantForAccessibility="no">
                {weeks[0].map((day) => (
                    <YStack key={day} flex={1} flexBasis={0} height={18} alignItems="center" justifyContent="center">
                        <Body fontSize={13} lineHeight={18} fontWeight="800" letterSpacing={0.5} textTransform="uppercase" tone="muted" numberOfLines={1}>
                            {weekdayShort(day)}
                        </Body>
                    </YStack>
                ))}
            </XStack>
            {weeks.map((week) => (
                <XStack key={week[0]}>
                    {week.map((day) => {
                        const work = workOf(day);
                        const out = day.slice(0, 7) !== month;
                        const on = day === selected;
                        const isToday = day === today;
                        const ink = on ? '$background' : isToday ? '$textPrimary' : out ? (work.orders.length ? '$textSecondary' : '$textMuted') : day < today ? '$textSecondary' : work.orders.length ? '$textPrimary' : '$textSecondary';
                        return (
                            <YStack
                                key={day}
                                flex={1}
                                flexBasis={0}
                                height={42}
                                gap={2}
                                alignItems="center"
                                opacity={out && !work.orders.length && !on ? 0.6 : 1}
                                onPress={() => onSelect(day)}
                                pressStyle={{ opacity: 0.6 }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={spokenWork(day, work, t)}
                                testID={`schedule-month-${day}`}
                            >
                                {/* Selected is a filled disc, today is a ring: two shapes, so the two are never told apart by colour. */}
                                <YStack width={32} height={32} borderRadius={16} alignItems="center" justifyContent="center" backgroundColor={on ? '$textPrimary' : 'transparent'} borderWidth={isToday ? 2 : 0} borderColor="$primary">
                                    <Body fontSize={16} lineHeight={20} fontWeight={on || isToday ? '800' : '700'} tabular color={ink as never}>
                                        {dayNumber(day)}
                                    </Body>
                                </YStack>
                                {/* Blue dots are orders still to do (three at most); one green dot is a day that is all done. */}
                                <XStack height={6} alignItems="center" justifyContent="center" gap={3}>
                                    {work.open.length ? (
                                        Array.from({ length: Math.min(work.open.length, 3) }, (_, index) => <YStack key={index} width={6} height={6} borderRadius={3} backgroundColor="$primary" />)
                                    ) : work.done ? (
                                        <YStack width={6} height={6} borderRadius={3} backgroundColor="$success" />
                                    ) : null}
                                </XStack>
                            </YStack>
                        );
                    })}
                </XStack>
            ))}
        </YStack>
    );
}

/* -- The view ------------------------------------------------------------------------ */

export interface JobsScheduleProps {
    driverId?: string;
    /** Every order on this phone; the view sorts them into days. */
    orders: OrderRecord[];
    /** `orderId:placeId` → the day plan's times for that place. */
    times: Map<string, PointTime>;
    isRefreshing: boolean;
    /** Asks again for the driver's orders (the screen's own query). */
    onRefresh: () => void;
    onOpenOrder?: (id: string) => void;
    /** Room for the floating tab bar. */
    bottomSpace: number;
}

export function JobsSchedule({ driverId, orders, times, isRefreshing, onRefresh, onOpenOrder, bottomSpace }: JobsScheduleProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    // Re-read every so often, so a screen left open over midnight moves on to the new day.
    const today = dayKey(new Date(useNow(60_000)));

    const [view, setView] = useState<ScheduleView>('dates');
    const [selected, setSelected] = useState(today);
    // The day the week or the month on show is taken from. It follows the chosen day, except while paging through months.
    const [cursor, setCursor] = useState(today);

    const choose = (day: string) => {
        setSelected(day);
        setCursor(day);
    };

    /*
     * The window asked of the server: the month grid around what is on show,
     * in whole weeks. Paging by day or week inside a month asks for nothing new.
     */
    const month = cursor.slice(0, 7);
    const grid = useMemo(() => monthGrid(`${month}-01`), [month]);
    const [from, to] = useMemo(() => instantRange(grid[0], grid[grid.length - 1]), [grid]);
    const ranged = useOrderQuery({ driver_assigned: driverId, scheduled_at: `${from},${to}`, limit: 200 }, { enabled: !!driverId, reconcile: false });

    const byDay = useMemo(() => {
        const days = new Map<string, DayWork>();
        for (const order of orders) {
            // A cancelled order is not work to plan around.
            if (isOrderAbandoned(order as { status?: string })) continue;
            const day = scheduleDayOf(order, today);
            if (!day) continue;
            const work = days.get(day) ?? { orders: [], open: [], done: 0 };
            work.orders.push(order);
            if (isOrderFinished(order)) work.done += 1;
            else work.open.push(order);
            days.set(day, work);
        }
        for (const work of days.values()) {
            work.orders.sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
            work.open.sort((a, b) => whenOf(a).localeCompare(whenOf(b)));
        }
        return days;
    }, [orders, today]);
    const workOf = (day: string): DayWork => byDay.get(day) ?? NO_WORK;

    const views = useMemo(
        () => [
            { value: 'dates' as const, label: t('jobs.schedule.viewDates') },
            { value: 'day' as const, label: t('jobs.schedule.viewDay') },
            { value: 'week' as const, label: t('jobs.schedule.viewWeek') },
            { value: 'month' as const, label: t('jobs.schedule.viewMonth') },
        ],
        [t]
    );

    const refresh = () => {
        onRefresh();
        void ranged.refresh();
    };
    const refreshControl = <RefreshControl refreshing={isRefreshing || ranged.isRefreshing} onRefresh={refresh} tintColor={theme.primary?.val as string} />;

    const selectedWork = workOf(selected);
    const count = (work: DayWork) => (work.orders.length ? t('jobs.orders.count', { count: work.orders.length }) : undefined);

    const dayList = (work: DayWork, gap: number) =>
        work.orders.length ? (
            <YStack gap={gap}>
                {work.orders.map((order) => (
                    <OrderCard key={order.id} order={order} times={times} onPress={onOpenOrder ? () => onOpenOrder(order.id) : undefined} t={t} />
                ))}
            </YStack>
        ) : (
            <EmptyState title={t('jobs.schedule.nothing')} body={t('jobs.schedule.nothingBody')} testID="schedule-empty" />
        );

    const week = weekOf(cursor);
    const thisMonday = weekOf(today)[0];

    return (
        <YStack flex={1} testID="schedule-view">
            <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                <ChipSwitch
                    options={views}
                    value={view}
                    // Choosing the view already on show goes back to today.
                    onChange={(next) => {
                        if (next === view) choose(today);
                        else {
                            setView(next);
                            setCursor(selected);
                        }
                    }}
                    label={t('jobs.schedule.viewLabel')}
                    testID="schedule-views"
                />
            </YStack>

            {view === 'dates' ? (
                <>
                    <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                        <WeekStrip days={week} selected={selected} today={today} workOf={workOf} onSelect={choose} onShift={(weeks) => choose(addDays(selected, weeks * 7))} t={t} />
                    </YStack>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: bottomSpace, flexGrow: 1 }} refreshControl={refreshControl} testID="schedule-dates">
                        <YStack paddingTop={16} paddingBottom={10}>
                            <ListHeading title={dayTitle(selected, today, t)} aside={count(selectedWork)} testID="schedule-day-title" />
                        </YStack>
                        {dayList(selectedWork, 10)}
                    </ScrollView>
                </>
            ) : view === 'day' ? (
                <>
                    <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                        <StepHeader
                            title={dayTitle(selected, today, t)}
                            sub={count(selectedWork) ?? t('jobs.schedule.nothing')}
                            previous={t('jobs.schedule.previousDay', { day: spokenDay(addDays(selected, -1)) })}
                            next={t('jobs.schedule.nextDay', { day: spokenDay(addDays(selected, 1)) })}
                            onPrevious={() => choose(addDays(selected, -1))}
                            onNext={() => choose(addDays(selected, 1))}
                            testID="schedule-day-step"
                        />
                    </YStack>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomSpace, flexGrow: 1 }} refreshControl={refreshControl} testID="schedule-day">
                        <DayHours day={selected} today={today} work={selectedWork} onOpenOrder={onOpenOrder} t={t} />
                    </ScrollView>
                </>
            ) : view === 'week' ? (
                <>
                    <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                        <StepHeader
                            title={week[0] === thisMonday ? t('jobs.schedule.thisWeek') : week[0] === addDays(thisMonday, 7) ? t('jobs.schedule.nextWeek') : week[0] === addDays(thisMonday, -7) ? t('jobs.schedule.lastWeek') : t('jobs.schedule.weekOf', { date: dayMonth(week[0]) })}
                            sub={rangeLabel(week[0], week[6])}
                            previous={t('jobs.schedule.previousWeek', { range: rangeLabel(addDays(week[0], -7), addDays(week[6], -7)) })}
                            next={t('jobs.schedule.nextWeekRange', { range: rangeLabel(addDays(week[0], 7), addDays(week[6], 7)) })}
                            onPrevious={() => choose(addDays(selected, -7))}
                            onNext={() => choose(addDays(selected, 7))}
                            testID="schedule-week-step"
                        />
                    </YStack>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: bottomSpace, gap: 6, flexGrow: 1 }} refreshControl={refreshControl} testID="schedule-week">
                        {week.map((day) => (
                            <WeekRow
                                key={day}
                                day={day}
                                today={today}
                                work={workOf(day)}
                                // A day in the week opens as the Dates view with that day chosen.
                                onPress={() => {
                                    choose(day);
                                    setView('dates');
                                }}
                                t={t}
                            />
                        ))}
                    </ScrollView>
                </>
            ) : (
                <>
                    <YStack paddingHorizontal={GUTTER} paddingTop={10}>
                        <StepHeader
                            title={monthYear(`${month}-01`)}
                            previous={t('jobs.schedule.previousMonth', { month: monthYear(addMonths(cursor, -1)) })}
                            next={t('jobs.schedule.nextMonth', { month: monthYear(addMonths(cursor, 1)) })}
                            onPrevious={() => setCursor(addMonths(cursor, -1))}
                            onNext={() => setCursor(addMonths(cursor, 1))}
                            testID="schedule-month-step"
                        />
                    </YStack>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomSpace, flexGrow: 1 }} refreshControl={refreshControl} testID="schedule-month">
                        <YStack paddingHorizontal={GUTTER} paddingTop={8}>
                            <MonthGrid days={grid} month={month} selected={selected} today={today} workOf={workOf} onSelect={choose} t={t} />
                        </YStack>
                        <YStack marginTop={8} paddingHorizontal={GUTTER} paddingTop={10} borderTopWidth={1} borderColor="$border">
                            <ListHeading title={dayTitle(selected, today, t)} aside={count(selectedWork)} testID="schedule-day-title" />
                        </YStack>
                        <YStack paddingHorizontal={GUTTER} paddingTop={8}>
                            {dayList(selectedWork, 8)}
                        </YStack>
                    </ScrollView>
                </>
            )}
        </YStack>
    );
}

export default JobsSchedule;
