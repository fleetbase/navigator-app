/**
 * The incoming offer: a job offered to this driver rises over whatever screen
 * they are on, with accept and decline on it.
 *
 * Before this existed an offer only lit the Offers button on Jobs. A driver on
 * Home, in a chat or on an order never saw it, and an offer made to them alone
 * ran out unanswered.
 *
 * **What raises it.** The offers query (`useOffers`) is the source: an order is
 * shown only while the server lists it as one this driver can take, so an order
 * that is simply assigned to them, or the console's "ping driver" about one, never
 * appears here. Of the listed offers, one is raised when
 *
 *   - the server just rang about it (`order.ping` on the driver's channel, or
 *     the `order_ping` push while the app is open), or
 *   - it appeared in the list after the app was already running, or
 *   - it carries a countdown, which means it is offered to this driver alone and
 *     is running out, including one already open when the app starts.
 *
 * A job that was already listed for everyone when the app opened is left on the
 * Offers screen until the server rings about it again.
 *
 * **One at a time.** The newest raised offer is shown; the rest are a count and
 * a way to the Offers screen. The offer on screen is not swapped for a newer one
 * while the driver is looking at it, because Accept must never change meaning
 * under a thumb. When the sheet closes the others are left on the Offers screen
 * rather than raised one after another; the next offer the server rings about
 * raises it again.
 *
 * **Answering.** Accept and decline are the same calls the Offers screen makes
 * (`orders/{id}/start`, `orders/{id}/decline`), with the same rule: never
 * queued. "Not now" puts the sheet away and declines nothing; the offer stays on
 * the Offers screen. An offer that runs out or is taken back while it is on
 * screen says so and closes.
 *
 * **Drawn in the tree, not in a `Modal`.** iOS presents one native modal at a
 * time: a second one asked for while a sheet or the item pager is open is
 * dropped without a word, and an offer must not be the thing that is dropped.
 * So this is an ordinary view laid over the app, with the same motion as
 * `SheetModal` (the dimming fades, only the sheet slides). The cost is that a
 * native modal already open stays in front of it until it is closed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { useDeviceLocation, useDuty } from '../shell';
import { useOfferSignals } from '../realtime/offerSignals';
import { useOffers, useAcceptOffer, useDeclineOffer, secondsLeft } from '../data/useOffers';
import { trackingNumberOf } from '../data/accessors';
import { haversineM } from '../data/routeGeo';
import { formatMeters } from '../format';
import { navigateWhenReady, navigationRef, openOrder } from '../navigation/navigationRef';
import { orderPoints, type OrderPoint } from '../screens/jobs/model';
import type { OrderRecord } from '../data/orderStore';

const IN_MS = 240;
const OUT_MS = 180;
/** How far below its resting place the sheet starts, as in `SheetModal`. */
const TRAVEL = 360;
/** How long "this offer ran out" stays up before the sheet closes by itself. */
const ENDED_MS = 4000;

/** Why the offer on screen is over. */
type Ended = 'expired' | 'withdrawn' | 'taken';

type T = (key: string, options?: Record<string, unknown>) => string;

export function formatCountdown(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The Offers screen, from anywhere, with the Jobs list beneath it. */
function openOffersList(): void {
    navigateWhenReady(() => navigationRef.navigate('Orders', { screen: 'Offers', initial: false }));
}

/**
 * Which listed offer to raise, and bookkeeping for the ones already answered.
 *
 * Kept in refs because none of it is drawn: it only decides what `shown` becomes.
 */
function useRaisedOffer(offers: OrderRecord[] | null, listening: boolean) {
    const signals = useOfferSignals();
    /** Offer id → when it was raised (a ping's time, or when it was first seen). */
    const raised = useRef(new Map<string, number>());
    /**
     * Offers the driver has put away or answered, and when. Not raised again
     * while still listed, unless the server rings about one after that: "not
     * now" is not "no", and a job dispatch offers again should be seen again.
     */
    const answered = useRef(new Map<string, number>());
    /** Offers already listed when the app started, not yet rung about. */
    const listedAtStart = useRef(new Set<string>());
    const started = useRef(false);
    const [candidate, setCandidate] = useState<OrderRecord | null>(null);
    const [othersOpen, setOthersOpen] = useState(0);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        if (!listening) {
            // Offline or signed out: coming back online starts over, like opening the app.
            raised.current.clear();
            answered.current.clear();
            listedAtStart.current.clear();
            started.current = false;
            setCandidate(null);
            setOthersOpen(0);
            return;
        }
        if (!offers) return;
        const now = Date.now();
        const open = offers.filter((order) => secondsLeft(order, now) !== 0);
        const ids = new Set(open.map((order) => order.id));

        // An offer that left the list is forgotten, so the same job offered again later rises again.
        for (const id of Array.from(raised.current.keys())) if (!ids.has(id)) raised.current.delete(id);
        for (const id of Array.from(answered.current.keys())) if (!ids.has(id)) answered.current.delete(id);
        for (const id of Array.from(listedAtStart.current)) if (!ids.has(id)) listedAtStart.current.delete(id);

        for (const order of open) {
            const pingedAt = signals.pings[order.id];
            if (raised.current.has(order.id)) {
                // Rung again: it is the newest once more, though one already put away stays put away.
                if (pingedAt) raised.current.set(order.id, Math.max(pingedAt, raised.current.get(order.id) ?? 0));
                continue;
            }
            const timed = secondsLeft(order, now) !== null;
            if (pingedAt) raised.current.set(order.id, pingedAt);
            else if (timed) raised.current.set(order.id, now);
            else if (!started.current) listedAtStart.current.add(order.id);
            else if (!listedAtStart.current.has(order.id)) raised.current.set(order.id, now);
        }
        started.current = true;

        let newest: OrderRecord | null = null;
        let newestAt = -1;
        for (const order of open) {
            const at = raised.current.get(order.id);
            if (at === undefined) continue;
            const answeredAt = answered.current.get(order.id);
            if (answeredAt !== undefined && at <= answeredAt) continue;
            if (at > newestAt) {
                newest = order;
                newestAt = at;
            }
        }
        setCandidate(newest);
        setOthersOpen(open.length);
    }, [offers, listening, signals, revision]);

    /**
     * The sheet closed, whatever the answer. Every offer raised so far is put
     * away with it: the others were on the sheet as a count with a way to the
     * Offers screen, and raising them one after another as each is dismissed
     * would be a stack of sheets by another name. Only an offer the server rings
     * about after this raises the sheet again.
     */
    const putAway = useCallback(() => {
        const at = Date.now();
        for (const id of raised.current.keys()) answered.current.set(id, at);
        setCandidate(null);
        setRevision((n) => n + 1);
    }, []);

    return { candidate, openCount: othersOpen, putAway, signals };
}

/**
 * Mount once, above the tabs. Draws nothing until an offer is raised.
 */
export function IncomingOfferHost({ driverId }: { driverId?: string }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { units } = useSettings();
    const position = useDeviceLocation();
    const { duty } = useDuty();
    // Offers are only asked for while the driver is online, as on Jobs.
    const listening = duty !== 'off' && !!driverId;
    const { offers, reload } = useOffers(listening ? driverId : undefined);
    const { accept, isAccepting } = useAcceptOffer(driverId);
    const { decline, isDeclining } = useDeclineOffer();
    const { candidate, openCount, putAway, signals } = useRaisedOffer(offers, listening);

    /** The offer on screen. Kept after the sheet closes so its contents do not vanish mid-slide. */
    const [shown, setShown] = useState<OrderRecord | null>(null);
    const [visible, setVisible] = useState(false);
    const [shownAt, setShownAt] = useState(0);
    const [ended, setEnded] = useState<Ended | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const busy = isAccepting || isDeclining;

    // Raise the candidate when nothing is on screen. Never swap the one the driver is reading.
    useEffect(() => {
        if (visible || !candidate) return;
        setShown(candidate);
        setShownAt(Date.now());
        setEnded(null);
        setProblem(null);
        setNow(Date.now());
        setVisible(true);
        Keyboard.dismiss();
        AccessibilityInfo.announceForAccessibility(t('offers.overlay.title'));
    }, [candidate, visible, t]);

    const close = useCallback(() => {
        putAway();
        setVisible(false);
    }, [putAway]);

    // The countdown, while there is one to show.
    const timed = !!shown && secondsLeft(shown) !== null;
    useEffect(() => {
        if (!visible || !timed || ended) return undefined;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [visible, timed, ended]);
    const left = shown ? secondsLeft(shown, now) : null;

    // Over: the time ran out here, the server said it closed, or the list no longer has it.
    useEffect(() => {
        if (!visible || !shown || ended || busy) return;
        const closed = signals.closed[shown.id];
        if (closed && closed.at >= shownAt) {
            setEnded(closed.status);
            return;
        }
        if (left === 0) {
            setEnded('expired');
            void reload();
            return;
        }
        if (offers && !offers.some((order) => order.id === shown.id)) setEnded('withdrawn');
    }, [visible, shown, ended, busy, signals, shownAt, left, offers, reload]);

    // Says why for a moment, then closes by itself.
    useEffect(() => {
        if (!visible || !ended) return undefined;
        const timer = setTimeout(close, ENDED_MS);
        return () => clearTimeout(timer);
    }, [visible, ended, close]);

    const take = useCallback(async () => {
        if (!shown) return;
        setProblem(null);
        const outcome = await accept(shown.id);
        if (outcome === 'accepted') {
            putAway();
            setVisible(false);
            openOrder(shown.id);
            void reload();
            return;
        }
        if (outcome === 'taken') {
            setEnded('taken');
            void reload();
            return;
        }
        // Nothing is assumed: the offer stays up, still answerable.
        setProblem(t('offers.overlay.acceptFailed'));
    }, [shown, accept, putAway, reload, t]);

    const refuse = useCallback(async () => {
        if (!shown) return;
        setProblem(null);
        if (await decline(shown.id)) {
            putAway();
            setVisible(false);
            void reload();
            return;
        }
        setProblem(t('offers.overlay.declineFailed'));
    }, [shown, decline, putAway, reload, t]);

    const seeAll = useCallback(() => {
        close();
        openOffersList();
    }, [close]);

    // Android's back button puts the sheet away, as it would a modal.
    useEffect(() => {
        if (!visible) return undefined;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!busy) close();
            return true;
        });
        return () => subscription.remove();
    }, [visible, busy, close]);

    // Other offers still open, beside the one on screen.
    const others = Math.max(0, openCount - (shown && offers?.some((order) => order.id === shown.id) ? 1 : 0));

    return (
        <RisingSheet visible={visible} onDismiss={busy ? undefined : close} dismissLabel={t('offers.overlay.notNow')} bottomInset={Math.max(insets.bottom, space[4])}>
            {shown ? (
                <OfferSheet
                    order={shown}
                    left={left}
                    ended={ended}
                    problem={problem}
                    others={others}
                    position={position}
                    units={units}
                    isAccepting={isAccepting}
                    isDeclining={isDeclining}
                    onAccept={() => void take()}
                    onDecline={() => void refuse()}
                    onNotNow={close}
                    onSeeAll={seeAll}
                    t={t}
                />
            ) : null}
        </RisingSheet>
    );
}

/**
 * `SheetModal`'s motion without the native modal: the dimming fades in place and
 * only the sheet slides. Stays mounted until the closing animation has finished.
 */
function RisingSheet({
    visible,
    onDismiss,
    dismissLabel,
    bottomInset,
    children,
}: {
    visible: boolean;
    onDismiss?: () => void;
    dismissLabel: string;
    bottomInset: number;
    children: React.ReactNode;
}) {
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let cancelled = false;
        if (visible) setMounted(true);
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    progress.setValue(visible ? 1 : 0);
                    if (!visible) setMounted(false);
                    return;
                }
                Animated.timing(progress, {
                    toValue: visible ? 1 : 0,
                    duration: visible ? IN_MS : OUT_MS,
                    easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (finished && !visible && !cancelled) setMounted(false);
                });
            });
        return () => {
            cancelled = true;
        };
    }, [visible, progress]);

    if (!mounted) return null;

    return (
        <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'} accessibilityViewIsModal testID="incoming-offer">
            {/* The dimming: fades, never moves. */}
            <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]} pointerEvents="none" />
            <Pressable style={styles.dismiss} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={dismissLabel} testID="incoming-offer-dismiss" />
            {/* The sheet: the only thing that slides. */}
            <Animated.View
                style={{
                    paddingHorizontal: space[3],
                    paddingBottom: bottomInset,
                    opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, 0] }) }],
                }}
            >
                {children}
            </Animated.View>
        </View>
    );
}

/** First and last points in full, the ones between as a count. */
function summarise(points: OrderPoint[]): { first?: OrderPoint; last?: OrderPoint; between: number } {
    if (!points.length) return { between: 0 };
    if (points.length === 1) return { first: points[0], between: 0 };
    return { first: points[0], last: points[points.length - 1], between: points.length - 2 };
}

function roleLabel(point: OrderPoint, t: T): string {
    if (point.role === 'pickup') return t('jobs.role.pickup');
    if (point.role === 'dropoff') return t('jobs.role.dropoff');
    return point.waypointNumber && point.waypointTotal ? t('jobs.role.waypointOf', { number: point.waypointNumber, total: point.waypointTotal }) : t('jobs.role.waypoint');
}

function PointLines({ point, t, testID }: { point: OrderPoint; t: T; testID: string }) {
    // The name when the place has one, the address under it; the address alone when it does not.
    const title = point.name ?? point.address;
    const under = point.name && point.address && point.address.toLowerCase() !== point.name.toLowerCase() ? point.address : undefined;
    return (
        <YStack gap={2} testID={testID}>
            <Caption>{roleLabel(point, t)}</Caption>
            {title ? (
                <Body fontWeight="700" numberOfLines={2}>
                    {title}
                </Body>
            ) : null}
            {under ? <Secondary numberOfLines={2}>{under}</Secondary> : null}
        </YStack>
    );
}

function OfferSheet({
    order,
    left,
    ended,
    problem,
    others,
    position,
    units,
    isAccepting,
    isDeclining,
    onAccept,
    onDecline,
    onNotNow,
    onSeeAll,
    t,
}: {
    order: OrderRecord;
    /** Seconds until the offer runs out; null when it has no time limit. */
    left: number | null;
    ended: Ended | null;
    problem: string | null;
    others: number;
    position: { latitude: number; longitude: number } | null;
    units: 'metric' | 'imperial';
    isAccepting: boolean;
    isDeclining: boolean;
    onAccept: () => void;
    onDecline: () => void;
    onNotNow: () => void;
    onSeeAll: () => void;
    t: T;
}) {
    const points = useMemo(() => orderPoints(order), [order]);
    const { first, last, between } = summarise(points);
    // In a straight line from the phone to where the job starts. Absent when either end is unknown.
    const meters = position && first?.point ? haversineM(position, first.point) : undefined;
    const tracking = trackingNumberOf(order) ?? order.id;
    const endedLine = ended === 'expired' ? t('offers.overlay.expired') : ended === 'taken' ? t('offers.taken') : ended ? t('offers.overlay.withdrawn') : null;

    return (
        <Surface level="sheet" hero padding={space[4]} gap={space[3]} testID={`incoming-offer-${order.id}`}>
            <YStack gap={space[1]}>
                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                    <Caption>{t('offers.available')}</Caption>
                    {left !== null && !ended ? (
                        // The words carry it; the tint only adds to them.
                        <YStack paddingHorizontal={space[2]} paddingVertical={2} borderRadius={radius.compact} borderWidth={1} borderColor="$warningBorder" backgroundColor="$warningFill">
                            <Body fontWeight="800" tabular tone="warning" numberOfLines={1} testID="incoming-offer-countdown">
                                {t('offers.timeLeft', { time: formatCountdown(left) })}
                            </Body>
                        </YStack>
                    ) : null}
                </XStack>
                <Heading>{t('offers.overlay.title')}</Heading>
                {meters !== undefined ? (
                    <Secondary tabular testID="incoming-offer-distance">
                        {t('offers.overlay.fromYou', { distance: formatMeters(meters, units) })}
                    </Secondary>
                ) : null}
            </YStack>

            {endedLine ? <Banner tone="neutral" message={endedLine} testID="incoming-offer-ended" /> : null}
            {problem && !ended ? <Banner tone="danger" message={problem} testID="incoming-offer-problem" /> : null}

            <YStack gap={space[3]} opacity={ended ? 0.6 : 1}>
                {first ? <PointLines point={first} t={t} testID="incoming-offer-first" /> : null}
                {between > 0 ? (
                    <Secondary fontWeight="700" testID="incoming-offer-between">
                        {t('jobs.orders.moreWaypoints', { count: between })}
                    </Secondary>
                ) : null}
                {last ? <PointLines point={last} t={t} testID="incoming-offer-last" /> : null}
                <Identifier value={tracking} boxed={false} />
            </YStack>

            <Divider />

            {ended ? (
                <Button variant="secondary" onPress={onNotNow} testID="incoming-offer-close">
                    {t('common.close')}
                </Button>
            ) : (
                <YStack gap={space[2]}>
                    <XStack gap={space[2]}>
                        <Button flex={1} variant="secondary" loading={isDeclining} disabled={isAccepting} onPress={onDecline} testID="incoming-offer-decline">
                            {t('offers.decline')}
                        </Button>
                        <Button flex={1} loading={isAccepting} disabled={isDeclining} onPress={onAccept} testID="incoming-offer-accept">
                            {t('offers.accept')}
                        </Button>
                    </XStack>
                    {/* The dimmed area is at the top of the screen; one-handed, the sheet needs its own way out. */}
                    <Button variant="ghost" disabled={isAccepting || isDeclining} onPress={onNotNow} testID="incoming-offer-not-now">
                        {t('offers.overlay.notNow')}
                    </Button>
                </YStack>
            )}

            {others > 0 ? (
                <XStack alignItems="center" justifyContent="space-between" gap={space[2]}>
                    <Secondary flex={1} testID="incoming-offer-others">
                        {t('offers.overlay.others', { count: others })}
                    </Secondary>
                    <Button variant="ghost" height={40} paddingHorizontal={space[3]} disabled={isAccepting || isDeclining} onPress={onSeeAll} testID="incoming-offer-see-all">
                        {t('offers.overlay.seeAll')}
                    </Button>
                </XStack>
            ) : null}
        </Surface>
    );
}

const styles = StyleSheet.create({
    // Above the tabs, the toasts and the portals; `elevation` is what puts it in front on Android.
    root: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 1000, elevation: 1000 },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
    dismiss: { flex: 1 },
});

export default IncomingOfferHost;
