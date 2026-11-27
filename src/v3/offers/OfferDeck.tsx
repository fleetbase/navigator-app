/**
 * Job offers as a deck of cards over a map.
 *
 * The map fills the screen and is not dimmed: the driver, and every open
 * offer's pickup as a pin with how far away it is. The offer on top of the deck
 * has its pin picked out and its trip drawn (dotted from the driver to the
 * pickup, then the road to the drop-off). The deck floats over the lower part:
 * the top card, the next ones peeking out under it, and Accept and Decline as
 * two large buttons.
 *
 * This is the one offers view. The incoming overlay (`IncomingOfferHost`) lays
 * it over whatever screen is in front, and the Offers screen shows it under its
 * title bar; the only differences are the header chips and the way out.
 *
 * **Answering.** Dragging the top card right past the threshold accepts, left
 * declines, and letting go sooner springs it back. The buttons do the same and
 * are the way for a screen reader. Either way the answer is sent at once: there
 * is no undo, because an accept is a race the server settles and a moment's
 * delay could lose the job. The card leaves as the call is made; if the call
 * fails the card comes back, still answerable, with the reason over it.
 * Accepting and declining are never queued (see `useOffers`).
 *
 * **What the top card is.** It does not change under a thumb: a newer offer
 * joins the back of the deck. It changes when it is answered, when it ends
 * (run out, taken by someone else, taken back), or when the driver taps another
 * offer's pin. An offer that ends while on top says why before the next comes up.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, BackHandler, Easing, PanResponder, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { DriverPuck } from '../ui/DriverPuck';
import { CasedPolyline } from '../ui/CasedPolyline';
import { mapLook } from '../ui/mapLook';
import { describeWaypoint } from '../ui/routeColors';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useResolvedScheme, useSettings } from '../settings';
import { useDeviceLocation, useDuty } from '../shell';
import { useOfferSignals } from '../realtime/offerSignals';
import { useAcceptOffer, useDeclineOffer, secondsLeft } from '../data/useOffers';
import { formatMeters, type DistanceUnit } from '../format';
import { DottedRail, DutyChip, OrgChip } from '../screens/home/parts';
import { useJobTrackers } from '../screens/jobs/trackers';
import type { OrderPoint } from '../screens/jobs/model';
import type { LatLng } from '../data/routeGeo';
import type { OrderRecord } from '../data/orderStore';
import {
    formatCountdown,
    fractionLeft,
    lineLengthM,
    markOfferAnswered,
    metersToPickup,
    offerRoad,
    openOffers,
    splitDistance,
    summariseOffer,
    type OfferSummary,
} from './offerModel';

/** How far the card must be dragged for letting go to answer. */
const THRESHOLD = 110;
/** A quick flick answers from nearer. */
const FLICK_DISTANCE = 48;
const FLICK_SPEED = 0.8;
/** Where the card goes when it leaves: clear of any phone's width. */
const FAR = 640;
const LEAVE_MS = 200;
/** How long "this offer ran out" stays up before the next card comes by itself. */
const ENDED_MS = 4000;
/** How long "It's yours" stays up before the order opens. */
const ACCEPTED_MS = 900;
const CARD_RADIUS = 22;
/** Ink on the success fill (the Accept button, the accepted badge): dark in every scheme, as a marker's letter is always white. */
const ON_SUCCESS = '#06210F';
const WHITE = '#FFFFFF';

type T = (key: string, options?: Record<string, unknown>) => string;
type EndedKind = 'accepted' | 'taken' | 'expired' | 'withdrawn';
type Position = (LatLng & { heading?: number | null }) | null;

export interface OfferDeckProps {
    /** `overlay`: laid over the app, with Home's chips and a way to put it away. `screen`: under the Offers title bar. */
    mode: 'overlay' | 'screen';
    driverId?: string;
    /** The offers query's list. */
    offers: OrderRecord[];
    reload: () => unknown;
    /** The offer to start with on top (the one that raised the overlay). */
    leadId?: string;
    organizationName?: string;
    /** Puts the deck away without answering. Its presence draws the close button and takes Android's back. */
    onPutAway?: () => void;
    /** The last card has gone. */
    onEmpty?: () => void;
    /** The driver took this order: open it. */
    onAccepted: (orderId: string) => void;
    /** Drawn in place of the deck when there is nothing to show (the Offers screen's empty state). */
    emptyState?: React.ReactNode;
}

/** A floating chip's ground: nearly solid, so it reads over any map. */
function useFloatSkin(dark: boolean, alpha = 'EB') {
    const theme = useTheme();
    const page = theme.background?.val as string;
    return dark
        ? { backgroundColor: /^#[0-9a-f]{6}$/i.test(page) ? `${page}${alpha}` : page }
        : {
              backgroundColor: theme.surface?.val as string,
              shadowColor: theme.shadowColor?.val as string,
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
          };
}

/* -- Glyphs, as the mockups draw them. ---------------------------------------- */

const GLYPHS = {
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
    box: ['M4 8l8-4 8 4v8l-8 4-8-4z', 'M4 8l8 4 8-4', 'M12 12v8'],
    cash: ['M3 7h18v10H3z', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
    cross: ['M6 6l12 12', 'M18 6L6 18'],
    tick: ['M5 12.5l4.5 4.5L19 7.5'],
    left: ['M19 12H5', 'M11 6l-6 6 6 6'],
    right: ['M5 12h14', 'M13 6l6 6-6 6'],
    taken: ['M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 19.5c1-3.5 3.5-5 6.5-5s5.5 1.5 6.5 5', 'M15.5 10.5l2 2 4-4.5'],
} as const;

function Glyph({ name, size, color, strokeWidth = 2.6 }: { name: keyof typeof GLYPHS; size: number; color: string; strokeWidth?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            {GLYPHS[name].map((d) => (
                <Path key={d} d={d} />
            ))}
        </Svg>
    );
}

function Bolt({ size, color }: { size: number; color: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
            <Path d="M13 2L4 14h6l-1 8 9-12h-6z" />
        </Svg>
    );
}

/** A place's marker: the console's circle with a white border, P, D or the waypoint's number inside. */
function PlaceMark({ point, size, color }: { point?: OrderPoint; size: number; color: string }) {
    const { label, color: fill } = describeWaypoint(point?.role, point?.waypointNumber, color);
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: size <= 24 ? 2 : 2.5,
                borderColor: WHITE,
                backgroundColor: fill,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000000',
                shadowOpacity: 0.45,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
            }}
        >
            <Body fontSize={size >= 48 ? 18 : size >= 32 ? 13 : size >= 28 ? 12 : 11} lineHeight={size >= 48 ? 22 : 16} fontWeight="800" color={WHITE as never} tabular>
                {label}
            </Body>
        </View>
    );
}

function roleLabel(point: OrderPoint | undefined, t: T): string {
    if (!point) return '';
    if (point.role === 'pickup') return t('jobs.role.pickup');
    if (point.role === 'dropoff') return t('jobs.role.dropoff');
    return point.waypointNumber && point.waypointTotal ? t('jobs.role.waypointOf', { number: point.waypointNumber, total: point.waypointTotal }) : t('jobs.role.waypoint');
}

/* -- The deck. --------------------------------------------------------------- */

export function OfferDeck({ mode, driverId, offers, reload, leadId, organizationName, onPutAway, onEmpty, onAccepted, emptyState }: OfferDeckProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { units } = useSettings();
    const scheme = useResolvedScheme();
    const dark = scheme !== 'light' && scheme !== 'sunlight';
    const position = useDeviceLocation() as Position;
    const { duty } = useDuty();
    const signals = useOfferSignals();
    const { accept } = useAcceptOffer(driverId);
    const { decline } = useDeclineOffer();
    const overlay = mode === 'overlay';

    const [now, setNow] = useState(() => Date.now());
    const [topId, setTopId] = useState<string | undefined>(leadId);
    const [ended, setEnded] = useState<{ order: OrderRecord; kind: EndedKind } | null>(null);
    const [pending, setPending] = useState<'accept' | 'decline' | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    /** Bumped when an offer is answered here, so the list of open offers is read again. */
    const [revision, setRevision] = useState(0);
    const [reduceMotion, setReduceMotion] = useState(false);
    const [deckHeight, setDeckHeight] = useState(0);
    const [footHeight, setFootHeight] = useState(0);
    const [cardHeight, setCardHeight] = useState(292);

    /** The top card's record as last seen, so it can still be named after it leaves the list. */
    const lastTop = useRef<OrderRecord | null>(null);
    const topSince = useRef(Date.now());
    const emptied = useRef(false);
    const mounted = useRef(true);
    useEffect(
        () => () => {
            mounted.current = false;
        },
        []
    );

    useEffect(() => {
        let live = true;
        AccessibilityInfo.isReduceMotionEnabled()
            .then((on) => live && setReduceMotion(!!on))
            .catch(() => undefined);
        const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduceMotion(!!on));
        return () => {
            live = false;
            motion?.remove?.();
        };
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const open = useMemo(() => openOffers(offers, signals.pings, now, topId), [offers, signals.pings, now, topId, revision]);

    // The countdowns tick while any offer has one.
    const timed = open.some((order) => secondsLeft(order) !== null);
    useEffect(() => {
        if (!timed) return undefined;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [timed]);

    const topRecord = open.find((order) => order.id === topId);
    // For the render between the top card leaving the list and the deck deciding what that means.
    const snapshot = !topRecord && topId && lastTop.current?.id === topId ? lastTop.current : undefined;
    const shownTop = ended ? ended.order : (topRecord ?? snapshot ?? open[0]);
    const deck = useMemo(() => (shownTop ? [shownTop, ...open.filter((order) => order.id !== shownTop.id)] : []), [shownTop, open]);
    const summaries = useMemo(() => new Map(deck.map((order) => [order.id, summariseOffer(order)])), [deck]);
    const total = deck.length;
    const next = ended ? deck.find((order) => order.id !== ended.order.id) : deck[1];

    // Keeps a card on top: the one chosen while it is listed, else the next; says why when the chosen one went away.
    useEffect(() => {
        if (ended || pending) return;
        if (topRecord) {
            lastTop.current = topRecord;
            emptied.current = false;
            return;
        }
        const lost = topId && lastTop.current?.id === topId ? lastTop.current : null;
        if (lost) {
            // It was on top and the list no longer has it: taken back, or taken by someone else.
            const closed = signals.closed[lost.id];
            setEnded({ order: lost, kind: closed && closed.at >= topSince.current ? closed.status : 'withdrawn' });
            return;
        }
        const first = open[0];
        if (first) {
            lastTop.current = first;
            topSince.current = Date.now();
            emptied.current = false;
            setTopId(first.id);
            return;
        }
        if (topId !== undefined) setTopId(undefined);
        if (!emptied.current) {
            emptied.current = true;
            onEmpty?.();
        }
    }, [open, topRecord, topId, ended, pending, signals, onEmpty]);

    // The top card's time ran out here, or the server said its offer closed.
    useEffect(() => {
        if (!topRecord || ended || pending) return;
        const closed = signals.closed[topRecord.id];
        if (closed && closed.at >= topSince.current) {
            setEnded({ order: topRecord, kind: closed.status });
            return;
        }
        if (secondsLeft(topRecord, now) === 0) {
            setEnded({ order: topRecord, kind: 'expired' });
            void reload();
        }
    }, [topRecord, ended, pending, signals, now, reload]);

    /* -- The top card's position: it follows the finger, and leaves when answered. -- */

    const shownId = shownTop?.id;
    // A new value per card, so the next card starts at rest rather than where the last one left.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const x = useMemo(() => new Animated.Value(0), [shownId]);
    const motion = useRef({ x, reduce: reduceMotion });
    motion.current = { x, reduce: reduceMotion };

    const leave = useCallback((direction: 1 | -1) => {
        const { x: value, reduce } = motion.current;
        if (reduce) {
            value.setValue(direction * FAR);
            return;
        }
        Animated.timing(value, { toValue: direction * FAR, duration: LEAVE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    }, []);

    const comeBack = useCallback(() => {
        const { x: value, reduce } = motion.current;
        if (reduce) {
            value.setValue(0);
            return;
        }
        Animated.spring(value, { toValue: 0, bounciness: 6, speed: 16, useNativeDriver: true }).start();
    }, []);

    /** The card on top is done with, whatever happened to it: the next one comes up. */
    const finish = useCallback((orderId: string) => {
        markOfferAnswered(orderId);
        lastTop.current = null;
        setEnded(null);
        setProblem(null);
        setTopId(undefined);
        setRevision((n) => n + 1);
    }, []);

    const take = useCallback(async () => {
        const order = shownTop;
        if (!order || pending || ended) return;
        setPending('accept');
        setProblem(null);
        leave(1);
        const outcome = await accept(order.id);
        if (!mounted.current) return;
        setPending(null);
        if (outcome === 'accepted') {
            setEnded({ order, kind: 'accepted' });
            void reload();
            return;
        }
        if (outcome === 'taken') {
            setEnded({ order, kind: 'taken' });
            void reload();
            return;
        }
        // Nothing is assumed: the card comes back, still answerable.
        setProblem(t('offers.overlay.acceptFailed'));
        comeBack();
    }, [shownTop, pending, ended, leave, accept, reload, t, comeBack]);

    const refuse = useCallback(async () => {
        const order = shownTop;
        if (!order || pending || ended) return;
        setPending('decline');
        setProblem(null);
        leave(-1);
        const ok = await decline(order.id);
        if (!mounted.current) return;
        setPending(null);
        if (ok) {
            finish(order.id);
            void reload();
            return;
        }
        setProblem(t('offers.overlay.declineFailed'));
        comeBack();
    }, [shownTop, pending, ended, leave, decline, finish, reload, t, comeBack]);

    // Read by the gesture, which is built once per card: always the latest.
    const live = useRef({ disabled: false, take, refuse, comeBack });
    live.current = { disabled: !!pending || !!ended, take, refuse, comeBack };

    const responder = useMemo(
        () =>
            PanResponder.create({
                // Only a sideways drag is the card's; a tap or an upward drag is left alone.
                onMoveShouldSetPanResponder: (_event, gesture) => !live.current.disabled && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
                onPanResponderTerminationRequest: () => false,
                onPanResponderGrant: () => {
                    x.stopAnimation();
                },
                onPanResponderMove: (_event, gesture) => {
                    x.setValue(gesture.dx);
                },
                onPanResponderRelease: (_event, gesture) => {
                    const far = Math.abs(gesture.dx) >= THRESHOLD || (Math.abs(gesture.vx) >= FLICK_SPEED && Math.abs(gesture.dx) >= FLICK_DISTANCE);
                    if (!far || live.current.disabled) {
                        live.current.comeBack();
                        return;
                    }
                    // The swipe is the answer, exactly as the button is: sent now, with no undo.
                    if (gesture.dx > 0) void live.current.take();
                    else void live.current.refuse();
                },
                onPanResponderTerminate: () => live.current.comeBack(),
            }),
        [x]
    );

    /* -- An offer that ended on top: says why, then moves on. --------------------- */

    const endedId = ended?.order.id;
    const endedKind = ended?.kind;
    useEffect(() => {
        if (!endedId || !endedKind) return undefined;
        const title =
            endedKind === 'accepted' ? t('offers.deck.accepted') : endedKind === 'taken' ? t('offers.deck.takenTitle') : endedKind === 'expired' ? t('offers.deck.expiredTitle') : t('offers.overlay.withdrawn');
        AccessibilityInfo.announceForAccessibility(title);
        const timer = setTimeout(
            () => {
                if (endedKind === 'accepted') onAccepted(endedId);
                finish(endedId);
            },
            endedKind === 'accepted' ? ACCEPTED_MS : ENDED_MS
        );
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [endedId, endedKind]);

    // Android's back button puts the deck away. It never declines.
    useEffect(() => {
        if (!onPutAway) return undefined;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (!pending) onPutAway();
            return true;
        });
        return () => subscription.remove();
    }, [onPutAway, pending]);

    /* -- The trip of the card on top: asked for that one only, and kept. ------------ */

    const tripRequests = useMemo(() => (shownId ? [{ id: shownId, version: 'offer' }] : []), [shownId]);
    const trackers = useJobTrackers(tripRequests);
    const topSummary = shownId ? summaries.get(shownId) : undefined;
    const road = useMemo(() => (shownId && topSummary ? offerRoad(trackers.get(shownId), topSummary) : []), [trackers, shownId, topSummary]);
    // Only a road has a length worth stating; a straight line between the places is not how far the trip is.
    const tripM = road.length > 1 ? lineLengthM(road) : undefined;

    const bringToTop = useCallback(
        (orderId: string) => {
            if (pending || ended || orderId === shownId) return;
            const record = open.find((order) => order.id === orderId);
            if (!record) return;
            lastTop.current = record;
            topSince.current = Date.now();
            setProblem(null);
            setTopId(orderId);
        },
        [pending, ended, shownId, open]
    );

    const floatSkin = useFloatSkin(dark);
    const warning = theme.warningText?.val as string;
    const success = theme.success?.val as string;
    const danger = theme.dangerText?.val as string;
    const ground = theme.background?.val as string;
    const bottomInset = Math.max(insets.bottom, space[4]) + 10;
    const topRoom = overlay ? insets.top + 44 + 6 + 26 + space[2] : space[3] + 26 + space[2];

    if (!shownTop) {
        // Nothing to show. The overlay is closed by `onEmpty`; the Offers screen draws its empty state.
        return emptyState ? <>{emptyState}</> : null;
    }

    const single = total === 1;
    const busy = !!pending;
    const ids = testIds(mode, shownTop.id);

    const lift = x.interpolate({ inputRange: [-THRESHOLD, 0, THRESHOLD], outputRange: [1, 0, 1], extrapolate: 'clamp' });
    const tilt = x.interpolate({ inputRange: [-200, 0, 200], outputRange: ['-13.5deg', '0deg', '13.5deg'], extrapolate: 'clamp' });
    const acceptShow = x.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
    const declineShow = x.interpolate({ inputRange: [-40, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    const restShow = x.interpolate({ inputRange: [-40, 0, 40], outputRange: [0, 1, 0], extrapolate: 'clamp' });

    const cardGround = dark ? (/^#[0-9a-f]{6}$/i.test(ground) ? `${ground}F7` : ground) : (theme.surface?.val as string);
    const plateGround = (dark ? theme.surface?.val : theme.background?.val) as string;
    const cardShadow = { shadowColor: theme.shadowColor?.val as string, shadowOpacity: dark ? 0.55 : 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 12 }, elevation: 8 };

    return (
        <View style={StyleSheet.absoluteFill} testID={ids.root}>
            <OfferMap
                deck={deck}
                summaries={summaries}
                topId={shownTop.id}
                ended={ended?.kind}
                road={road}
                position={position}
                offline={duty === 'off'}
                dark={dark}
                units={units}
                now={now}
                single={single}
                padTop={topRoom}
                padBottom={deckHeight}
                onPick={bringToTop}
                t={t}
            />

            {/* Home's chips over the map, with the count of open offers under the status. */}
            <XStack
                position="absolute"
                top={overlay ? insets.top : space[3]}
                left={space[3] - 2}
                right={space[3] - 2}
                alignItems="flex-start"
                justifyContent="space-between"
                gap={space[2]}
                pointerEvents="none"
            >
                {overlay ? (
                    // Shown as on Home so the screen is recognisably the same place; they open nothing from here.
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexShrink: 1 }}>
                        <OrgChip name={organizationName ?? ''} dark={dark} />
                    </View>
                ) : (
                    <YStack />
                )}
                <YStack alignItems="flex-end" gap={6} flexShrink={0}>
                    {overlay ? (
                        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                            <DutyChip duty={duty} t={t as never} dark={dark} />
                        </View>
                    ) : null}
                    <XStack height={26} alignItems="center" gap={5} paddingHorizontal={10} borderRadius={13} borderWidth={1} borderColor="$warningBorder" accessibilityRole="text" testID={ids.count} {...floatSkin}>
                        <Bolt size={11} color={warning} />
                        <Body fontSize={12} lineHeight={16} fontWeight="800" tone="warning" tabular numberOfLines={1}>
                            {t('offers.deck.open', { count: ended ? Math.max(0, total - 1) : total })}
                        </Body>
                    </XStack>
                </YStack>
            </XStack>

            <View style={styles.deck} pointerEvents="box-none" onLayout={(event) => setDeckHeight(Math.round(event.nativeEvent.layout.height))}>
                {/* A scrim only under the deck, so the hint and the buttons read; the map above is untouched. */}
                {footHeight > 0 && !ended ? (
                    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: footHeight + 72 }} pointerEvents="none">
                        <Svg width="100%" height="100%">
                            <Defs>
                                <LinearGradient id="offerDeckScrim" x1="0" y1="0" x2="0" y2="1">
                                    <Stop offset="0" stopColor={ground} stopOpacity={0} />
                                    <Stop offset="0.46" stopColor={ground} stopOpacity={0.92} />
                                    <Stop offset="1" stopColor={ground} stopOpacity={0.92} />
                                </LinearGradient>
                            </Defs>
                            <Rect x="0" y="0" width="100%" height="100%" fill="url(#offerDeckScrim)" />
                        </Svg>
                    </View>
                ) : null}

                {/* The way out without answering: the offers stay on the Offers screen. */}
                {onPutAway ? (
                    <XStack justifyContent="flex-end" paddingHorizontal={space[4]} paddingBottom={10} pointerEvents="box-none">
                        <YStack
                            width={48}
                            height={48}
                            borderRadius={24}
                            alignItems="center"
                            justifyContent="center"
                            borderWidth={1}
                            borderColor="$border"
                            opacity={busy ? 0.38 : 1}
                            disabled={busy}
                            onPress={busy ? undefined : onPutAway}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="button"
                            accessibilityLabel={t('offers.overlay.notNow')}
                            accessibilityState={{ disabled: busy }}
                            testID={ids.putAway}
                            {...floatSkin}
                        >
                            <Glyph name="cross" size={20} color={theme.textPrimary?.val as string} strokeWidth={2.8} />
                        </YStack>
                    </XStack>
                ) : null}

                {problem && !ended ? (
                    <YStack paddingHorizontal={space[4]} paddingBottom={space[2]}>
                        <YStack borderRadius={14} overflow="hidden" backgroundColor="$background">
                            <Banner tone="danger" message={problem} testID={ids.problem} />
                        </YStack>
                    </YStack>
                ) : null}

                {ended ? (
                    <YStack paddingHorizontal={space[4]} paddingBottom={bottomInset}>
                        <EndedCard
                            kind={ended.kind}
                            summary={summaries.get(ended.order.id) ?? summariseOffer(ended.order)}
                            hasNext={!!next}
                            onNext={() => finish(ended.order.id)}
                            cardGround={cardGround}
                            cardShadow={cardShadow}
                            reduceMotion={reduceMotion}
                            ids={ids}
                            t={t}
                        />
                    </YStack>
                ) : (
                    <>
                        <View style={{ marginHorizontal: space[4], marginBottom: single ? 10 : 22 }}>
                            {/* The cards after the next: an edge, nothing more. */}
                            {total > 2 ? (
                                <Animated.View
                                    pointerEvents="none"
                                    style={[
                                        styles.plate,
                                        {
                                            backgroundColor: plateGround,
                                            borderColor: theme.border?.val as string,
                                            opacity: 0.9,
                                            transform: [
                                                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [cardHeight * 0.067 + 16, cardHeight * 0.0335 + 8] }) },
                                                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [0.866, 0.933] }) },
                                            ],
                                        },
                                    ]}
                                />
                            ) : null}
                            {/* The next card: an edge at rest, shown as the top card is pulled away. */}
                            {next ? (
                                <Animated.View
                                    pointerEvents="none"
                                    accessibilityElementsHidden
                                    importantForAccessibility="no-hide-descendants"
                                    style={[
                                        styles.plate,
                                        {
                                            backgroundColor: plateGround,
                                            borderColor: theme.border?.val as string,
                                            ...cardShadow,
                                            shadowOpacity: dark ? 0.45 : 0.12,
                                            shadowRadius: 10,
                                            shadowOffset: { width: 0, height: 8 },
                                            transform: [
                                                { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [cardHeight * 0.0335 + 8, cardHeight * 0.015] }) },
                                                { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [0.933, 0.97] }) },
                                            ],
                                        },
                                    ]}
                                >
                                    <Animated.View style={{ opacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }) }}>
                                        <OfferCard
                                            order={next}
                                            summary={summaries.get(next.id) ?? summariseOffer(next)}
                                            heading={t('offers.deck.next', { number: 2, total })}
                                            quiet
                                            dots={{ total, active: 1 }}
                                            position={position}
                                            units={units}
                                            now={now}
                                            t={t}
                                        />
                                    </Animated.View>
                                </Animated.View>
                            ) : null}

                            <Animated.View
                                {...responder.panHandlers}
                                onLayout={(event) => setCardHeight(Math.round(event.nativeEvent.layout.height))}
                                style={{
                                    borderRadius: CARD_RADIUS,
                                    borderWidth: 1,
                                    borderColor: theme.border?.val as string,
                                    backgroundColor: cardGround,
                                    ...cardShadow,
                                    // It tilts about its bottom edge, as a card held at the bottom does. Reduced motion: it only slides.
                                    transformOrigin: '50% 100%',
                                    transform: reduceMotion ? [{ translateX: x }] : [{ translateX: x }, { rotate: tilt }],
                                }}
                                testID={ids.card}
                            >
                                <OfferCard
                                    order={shownTop}
                                    summary={summaries.get(shownTop.id) ?? summariseOffer(shownTop)}
                                    heading={single ? t('offers.overlay.title') : t('offers.deck.count', { number: 1, total })}
                                    single={single}
                                    dots={single ? undefined : { total, active: 0 }}
                                    headingOpacity={restShow}
                                    tripM={tripM}
                                    position={position}
                                    units={units}
                                    now={now}
                                    ids={ids}
                                    accessible
                                    t={t}
                                />
                                {/* While it is dragged: the border takes the answer's colour and the answer is written on the card, with its mark. */}
                                <Animated.View pointerEvents="none" style={[styles.edge, { borderColor: success, opacity: acceptShow }]} />
                                <Animated.View pointerEvents="none" style={[styles.edge, { borderColor: danger, opacity: declineShow }]} />
                                <Animated.View pointerEvents="none" style={[styles.stamp, { left: 12, borderColor: success, backgroundColor: ground, opacity: acceptShow, transform: [{ rotate: '-10deg' }] }]}>
                                    <Glyph name="tick" size={24} color={success} strokeWidth={3.4} />
                                    <Body fontSize={24} lineHeight={30} fontWeight="800" letterSpacing={1.4} textTransform="uppercase" color={success as never}>
                                        {t('offers.accept')}
                                    </Body>
                                </Animated.View>
                                <Animated.View pointerEvents="none" style={[styles.stamp, { right: 12, borderColor: danger, backgroundColor: ground, opacity: declineShow, transform: [{ rotate: '10deg' }] }]}>
                                    <Glyph name="cross" size={22} color={danger} strokeWidth={3.2} />
                                    <Body fontSize={24} lineHeight={30} fontWeight="800" letterSpacing={1.4} textTransform="uppercase" color={danger as never}>
                                        {t('offers.decline')}
                                    </Body>
                                </Animated.View>
                            </Animated.View>
                        </View>

                        <View onLayout={(event) => setFootHeight(Math.round(event.nativeEvent.layout.height))} style={{ paddingHorizontal: space[4], paddingBottom: bottomInset }}>
                            {single ? null : (
                                <XStack alignItems="center" justifyContent="center" gap={space[2]} marginBottom={6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                                    <Glyph name="left" size={15} color={theme.textSecondary?.val as string} />
                                    <Body fontSize={13} lineHeight={18} fontWeight="700" tone="secondary" numberOfLines={1}>
                                        {t('offers.deck.swipeHint')}
                                    </Body>
                                    <Glyph name="right" size={15} color={theme.textSecondary?.val as string} />
                                </XStack>
                            )}
                            {/* The same two answers as buttons, always there, each on the side its swipe goes to. */}
                            <XStack gap={10}>
                                <XStack
                                    flex={1}
                                    height={60}
                                    alignItems="center"
                                    justifyContent="center"
                                    gap={10}
                                    borderRadius={18}
                                    borderWidth={1.5}
                                    borderColor="$dangerBorder"
                                    backgroundColor="$background"
                                    overflow="hidden"
                                    opacity={busy && pending !== 'decline' ? 0.38 : 1}
                                    disabled={busy}
                                    onPress={busy ? undefined : () => void refuse()}
                                    pressStyle={{ opacity: 0.7 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('offers.decline')}
                                    accessibilityState={{ disabled: busy, busy: pending === 'decline' }}
                                    testID={ids.decline}
                                >
                                    {/* The tint sits on a solid ground, so the button reads over the map. */}
                                    <YStack position="absolute" top={0} right={0} bottom={0} left={0} backgroundColor="$dangerFill" pointerEvents="none" />
                                    {pending === 'decline' ? <ActivityIndicator color={danger} /> : <Glyph name="cross" size={19} color={danger} strokeWidth={3} />}
                                    <Body fontSize={18} lineHeight={24} fontWeight="800" tone="danger" numberOfLines={1}>
                                        {t('offers.decline')}
                                    </Body>
                                </XStack>
                                <XStack
                                    flex={1.35}
                                    height={60}
                                    alignItems="center"
                                    justifyContent="center"
                                    gap={10}
                                    borderRadius={18}
                                    backgroundColor="$success"
                                    opacity={busy && pending !== 'accept' ? 0.38 : 1}
                                    disabled={busy}
                                    onPress={busy ? undefined : () => void take()}
                                    pressStyle={{ opacity: 0.8 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('offers.accept')}
                                    accessibilityState={{ disabled: busy, busy: pending === 'accept' }}
                                    testID={ids.accept}
                                >
                                    {pending === 'accept' ? <ActivityIndicator color={ON_SUCCESS} /> : <Glyph name="tick" size={22} color={ON_SUCCESS} strokeWidth={3.4} />}
                                    <Body fontSize={20} lineHeight={26} fontWeight="800" color={ON_SUCCESS as never} numberOfLines={1}>
                                        {t('offers.accept')}
                                    </Body>
                                </XStack>
                            </XStack>
                        </View>
                    </>
                )}
            </View>
        </View>
    );
}

/** The ids the old sheet and the old list gave these elements, kept for whichever of the two the deck stands in for. */
function testIds(mode: 'overlay' | 'screen', orderId: string) {
    const overlay = mode === 'overlay';
    return {
        root: overlay ? 'incoming-offer-deck' : 'offers-screen',
        card: overlay ? `incoming-offer-${orderId}` : `offer-${orderId}`,
        accept: overlay ? 'incoming-offer-accept' : `offer-accept-${orderId}`,
        decline: overlay ? 'incoming-offer-decline' : `offer-decline-${orderId}`,
        countdown: overlay ? 'incoming-offer-countdown' : `offer-countdown-${orderId}`,
        distance: overlay ? 'incoming-offer-distance' : `offer-distance-${orderId}`,
        first: overlay ? 'incoming-offer-first' : `offer-first-${orderId}`,
        last: overlay ? 'incoming-offer-last' : `offer-last-${orderId}`,
        count: overlay ? 'incoming-offer-others' : 'offers-open-count',
        putAway: 'incoming-offer-not-now',
        problem: overlay ? 'incoming-offer-problem' : 'offer-problem',
        ended: overlay ? 'incoming-offer-ended' : 'offer-ended',
        taken: overlay ? 'incoming-offer-taken' : 'offer-taken',
        close: overlay ? 'incoming-offer-close' : 'offer-next',
    };
}

type TestIds = ReturnType<typeof testIds>;

/* -- A card. ----------------------------------------------------------------- */

/** The time left as a ring that empties, with the time written inside it. */
function CountdownRing({ left, fraction, testID }: { left: number; fraction: number; testID?: string }) {
    const theme = useTheme();
    const around = 2 * Math.PI * 21;
    return (
        <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={52} height={52} viewBox="0 0 52 52" style={StyleSheet.absoluteFill}>
                <Circle cx={26} cy={26} r={21} fill="none" stroke={theme.border?.val as string} strokeWidth={5} />
                <Circle
                    cx={26}
                    cy={26}
                    r={21}
                    fill="none"
                    stroke={theme.warningText?.val as string}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={`${around}`}
                    strokeDashoffset={around * (1 - fraction)}
                    transform="rotate(-90 26 26)"
                />
            </Svg>
            <Body fontSize={15} lineHeight={20} fontWeight="800" tabular numberOfLines={1} testID={testID}>
                {formatCountdown(left)}
            </Body>
        </View>
    );
}

function Tile({ value, unit, label, compact, testID }: { value: string; unit?: string; label: string; compact?: boolean; testID?: string }) {
    return (
        <YStack flex={1} minWidth={0} paddingVertical={8} paddingHorizontal={compact ? 6 : 10} borderRadius={14} backgroundColor="$surfaceRaised" testID={testID}>
            <XStack alignItems="baseline">
                <Body fontSize={compact ? 20 : 24} lineHeight={compact ? 24 : 28} fontWeight="800" letterSpacing={-0.4} tabular numberOfLines={1}>
                    {value}
                </Body>
                {unit ? (
                    <Body fontSize={compact ? 13 : 14} lineHeight={compact ? 24 : 28} fontWeight="800" marginLeft={compact ? 2 : 3} tabular numberOfLines={1}>
                        {unit}
                    </Body>
                ) : null}
            </XStack>
            <Body fontSize={13} lineHeight={17} fontWeight="700" tone="secondary" numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}

function Chip({ icon, label, tone }: { icon: 'box' | 'cash'; label: string; tone?: 'warning' }) {
    const theme = useTheme();
    const ink = (tone === 'warning' ? theme.warningText?.val : theme.textSecondary?.val) as string;
    return (
        <XStack
            height={28}
            alignItems="center"
            gap={6}
            paddingHorizontal={10}
            borderRadius={14}
            flexShrink={1}
            backgroundColor={tone === 'warning' ? '$warningFill' : '$surfaceRaised'}
            borderWidth={tone === 'warning' ? 1 : 0}
            borderColor="$warningBorder"
        >
            <Glyph name={icon} size={14} color={ink} strokeWidth={2.4} />
            <Body fontSize={13} lineHeight={17} fontWeight="700" tabular numberOfLines={1} flexShrink={1}>
                {label}
            </Body>
        </XStack>
    );
}

function OfferCard({
    order,
    summary,
    heading,
    single,
    quiet,
    dots,
    headingOpacity,
    tripM,
    position,
    units,
    now,
    ids,
    accessible,
    t,
}: {
    order: OrderRecord;
    summary: OfferSummary;
    /** "Offer 1 of 3", or "New job offer" when it is the only one. */
    heading: string;
    /** The only offer: one compact card, no count. */
    single?: boolean;
    /** The card behind the top one: its heading is plain, not the offer's amber. */
    quiet?: boolean;
    dots?: { total: number; active: number };
    /** Fades the heading while the card is dragged and the answer is written in its place. */
    headingOpacity?: Animated.AnimatedInterpolation<number>;
    /** The trip's length by road, when the road is known. */
    tripM?: number;
    position: Position;
    units: DistanceUnit;
    now: number;
    ids?: TestIds;
    accessible?: boolean;
    t: T;
}) {
    const theme = useTheme();
    const warning = theme.warningText?.val as string;
    const left = secondsLeft(order, now);
    const meters = metersToPickup(position, summary);
    const toPickup = meters !== undefined ? splitDistance(meters, units) : undefined;
    const trip = tripM !== undefined ? splitDistance(tripM, units) : undefined;
    const { first, last, firstTitle, lastTitle, waypointCount, itemCount, cash } = summary;

    // Everything on the card, in one sentence, for a screen reader.
    const spoken = [
        heading,
        first ? `${roleLabel(first, t)} ${firstTitle ?? ''}`.trim() : null,
        meters !== undefined ? t('offers.deck.fromYou', { distance: formatMeters(meters, units) }) : null,
        last ? `${roleLabel(last, t)} ${lastTitle ?? ''}`.trim() : null,
        tripM !== undefined ? t('offers.deck.tripLength', { distance: formatMeters(tripM, units) }) : null,
        t('offers.deck.waypointCount', { count: waypointCount }),
        itemCount ? t('offers.deck.itemCount', { count: itemCount }) : null,
        cash ? t('offers.deck.collect', { amount: cash }) : null,
        left !== null ? t('offers.deck.timeToDecide', { time: formatCountdown(left) }) : null,
    ]
        .filter(Boolean)
        .join('. ');

    const tiles = (
        <XStack gap={single ? 6 : 8}>
            {toPickup ? <Tile value={toPickup.value} unit={toPickup.unit} label={t('offers.deck.toPickup')} compact={single} testID={ids?.distance} /> : null}
            {trip ? <Tile value={trip.value} unit={trip.unit} label={t('offers.deck.trip')} compact={single} /> : null}
            <Tile value={String(waypointCount)} label={t('offers.deck.waypoints', { count: waypointCount })} compact={single} />
            {single && itemCount ? <Tile value={String(itemCount)} label={t('offers.deck.items', { count: itemCount })} compact /> : null}
        </XStack>
    );

    // "First driver to accept gets it" is only true of a job offered to everyone: one with a timer is this driver's alone.
    const openToAll = left === null;
    const showItemsChip = !single && itemCount > 0;
    const footer =
        showItemsChip || cash || openToAll ? (
            <XStack alignItems="center" justifyContent={cash ? 'flex-start' : 'space-between'} gap={cash ? 6 : 8}>
                {showItemsChip ? <Chip icon="box" label={t('offers.deck.itemCount', { count: itemCount })} /> : null}
                {cash ? <Chip icon="cash" tone="warning" label={t('offers.deck.collect', { amount: cash })} /> : null}
                {openToAll && !cash ? (
                    <Body fontSize={13} lineHeight={17} tone="secondary" numberOfLines={1} flexShrink={1}>
                        {t('offers.deck.firstWins')}
                    </Body>
                ) : null}
            </XStack>
        ) : null;

    const headingLine = (
        <XStack alignItems="center" gap={6}>
            {quiet ? null : <Bolt size={13} color={warning} />}
            <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} textTransform="uppercase" tone={quiet ? 'secondary' : 'warning'} tabular numberOfLines={1}>
                {heading}
            </Body>
        </XStack>
    );

    if (single) {
        return (
            <YStack padding={12} gap={10} accessible={accessible} accessibilityLabel={accessible ? spoken : undefined}>
                <XStack alignItems="center" justifyContent="space-between" gap={12}>
                    <Animated.View style={{ flexShrink: 1, opacity: headingOpacity ?? 1 }}>{headingLine}</Animated.View>
                    {left !== null ? (
                        <XStack alignItems="center" gap={6} flexShrink={0}>
                            <Glyph name="clock" size={15} color={warning} />
                            <Body fontSize={15} lineHeight={20} fontWeight="800" tone="warning" tabular numberOfLines={1} testID={ids?.countdown}>
                                {t('offers.deck.timeToDecide', { time: formatCountdown(left) })}
                            </Body>
                        </XStack>
                    ) : null}
                </XStack>
                <YStack gap={4}>
                    {first ? (
                        <XStack alignItems="center" gap={8} minHeight={24} testID={ids?.first}>
                            <PlaceMark point={first} size={24} color={theme.primary?.val as string} />
                            <Body flex={1} fontSize={18} lineHeight={24} fontWeight="800" letterSpacing={-0.2} numberOfLines={1}>
                                {firstTitle ?? roleLabel(first, t)}
                            </Body>
                        </XStack>
                    ) : null}
                    {last ? (
                        <XStack alignItems="center" gap={8} minHeight={24} testID={ids?.last}>
                            <PlaceMark point={last} size={24} color={theme.primary?.val as string} />
                            <Body flex={1} fontSize={18} lineHeight={24} fontWeight="800" letterSpacing={-0.2} numberOfLines={1}>
                                {lastTitle ?? roleLabel(last, t)}
                            </Body>
                        </XStack>
                    ) : null}
                </YStack>
                {tiles}
                {footer}
            </YStack>
        );
    }

    return (
        <YStack paddingVertical={13} paddingHorizontal={14} gap={10} accessible={accessible} accessibilityLabel={accessible ? spoken : undefined}>
            <XStack alignItems="center" justifyContent="space-between" gap={10} height={52}>
                <Animated.View style={{ flexShrink: 1, gap: 7, opacity: headingOpacity ?? 1 }}>
                    {headingLine}
                    {dots ? (
                        <XStack alignItems="center" gap={6}>
                            {Array.from({ length: Math.min(dots.total, 8) }, (_, index) => (
                                <YStack
                                    key={index}
                                    width={index === dots.active ? 24 : 6}
                                    height={6}
                                    borderRadius={3}
                                    backgroundColor={index === dots.active ? (quiet ? '$textSecondary' : '$textPrimary') : '$textMuted'}
                                />
                            ))}
                        </XStack>
                    ) : null}
                </Animated.View>
                {left !== null ? (
                    <XStack alignItems="center" gap={8} flexShrink={0}>
                        <Body fontSize={13} lineHeight={17} fontWeight="700" tone="warning" numberOfLines={1}>
                            {t('offers.deck.leftToDecide')}
                        </Body>
                        <CountdownRing left={left} fraction={fractionLeft(order, left)} testID={ids?.countdown} />
                    </XStack>
                ) : null}
            </XStack>

            <YStack>
                {first ? (
                    <XStack gap={12} testID={ids?.first}>
                        <YStack width={32} alignItems="center">
                            <PlaceMark point={first} size={32} color={theme.primary?.val as string} />
                            {last ? <DottedRail /> : null}
                        </YStack>
                        <YStack flex={1} minWidth={0} paddingBottom={last ? 8 : 0}>
                            <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} textTransform="uppercase" tone={first.role === 'pickup' ? 'success' : 'secondary'} numberOfLines={1}>
                                {roleLabel(first, t)}
                            </Body>
                            <Body fontSize={20} lineHeight={26} fontWeight="800" letterSpacing={-0.2} numberOfLines={1}>
                                {firstTitle ?? '—'}
                            </Body>
                        </YStack>
                    </XStack>
                ) : null}
                {last ? (
                    <XStack gap={12} testID={ids?.last}>
                        <YStack width={32} alignItems="center">
                            <PlaceMark point={last} size={28} color={theme.primary?.val as string} />
                        </YStack>
                        <YStack flex={1} minWidth={0}>
                            <Body fontSize={12} lineHeight={16} fontWeight="800" letterSpacing={0.7} textTransform="uppercase" tone="secondary" numberOfLines={1}>
                                {roleLabel(last, t)}
                            </Body>
                            <Body fontSize={20} lineHeight={26} fontWeight="800" letterSpacing={-0.2} numberOfLines={1}>
                                {lastTitle ?? '—'}
                            </Body>
                        </YStack>
                    </XStack>
                ) : null}
            </YStack>

            {tiles}
            {footer}
        </YStack>
    );
}

/* -- An offer that is over: accepted, taken by someone else, run out. --------------- */

function EndedCard({
    kind,
    summary,
    hasNext,
    onNext,
    cardGround,
    cardShadow,
    reduceMotion,
    ids,
    t,
}: {
    kind: EndedKind;
    summary: OfferSummary;
    hasNext: boolean;
    onNext: () => void;
    cardGround: string;
    cardShadow: object;
    reduceMotion: boolean;
    ids: TestIds;
    t: T;
}) {
    const theme = useTheme();
    const success = theme.success?.val as string;
    const warning = theme.warningText?.val as string;
    const fill = useRef(new Animated.Value(reduceMotion ? 1 : 0.1)).current;
    const accepted = kind === 'accepted';

    useEffect(() => {
        if (!accepted || reduceMotion) return;
        // The bar fills while the order is on its way to opening. Width cannot be driven natively; it is one short bar.
        Animated.timing(fill, { toValue: 1, duration: ACCEPTED_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, [accepted, reduceMotion, fill]);

    const trip = [summary.firstTitle, summary.lastTitle].filter(Boolean).join(' → ');
    const title = accepted ? t('offers.deck.accepted') : kind === 'taken' ? t('offers.deck.takenTitle') : kind === 'expired' ? t('offers.deck.expiredTitle') : t('offers.overlay.withdrawn');
    const under = kind === 'expired' ? t('offers.deck.expiredBody') : trip;

    return (
        <View
            accessibilityRole="alert"
            style={{
                borderRadius: CARD_RADIUS,
                borderWidth: accepted ? 2 : 1,
                borderColor: (accepted ? success : kind === 'expired' ? theme.warningBorder?.val : theme.border?.val) as string,
                backgroundColor: cardGround,
                overflow: 'hidden',
                ...cardShadow,
            }}
            testID={kind === 'taken' ? ids.taken : ids.ended}
        >
            <XStack alignItems="center" gap={12} padding={accepted ? 12 : 14}>
                {accepted ? (
                    <YStack width={48} height={48} borderRadius={24} alignItems="center" justifyContent="center" backgroundColor="$success">
                        <Glyph name="tick" size={26} color={ON_SUCCESS} strokeWidth={3.2} />
                    </YStack>
                ) : kind === 'expired' ? (
                    <Svg width={48} height={48} viewBox="0 0 48 48">
                        <Circle cx={24} cy={24} r={20} fill="none" stroke={theme.warningBorder?.val as string} strokeWidth={5} />
                        <Path d="M24 14v10l6 4" fill="none" stroke={warning} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                ) : (
                    <YStack width={48} height={48} borderRadius={24} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border">
                        <Glyph name="taken" size={24} color={theme.textSecondary?.val as string} strokeWidth={2.2} />
                    </YStack>
                )}
                <YStack flex={1} minWidth={0}>
                    <Body
                        fontSize={accepted ? 22 : 18}
                        lineHeight={accepted ? 28 : 23}
                        fontWeight="800"
                        letterSpacing={-0.2}
                        tone={accepted ? 'success' : kind === 'expired' ? 'warning' : 'primary'}
                        numberOfLines={2}
                    >
                        {title}
                    </Body>
                    {accepted && trip ? (
                        <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                            {trip}
                        </Body>
                    ) : null}
                    {accepted ? (
                        <Body fontSize={13} lineHeight={17} tone="secondary" numberOfLines={1}>
                            {t('offers.deck.opening')}
                        </Body>
                    ) : under ? (
                        <Body fontSize={13} lineHeight={17} tone="secondary" numberOfLines={1}>
                            {under}
                        </Body>
                    ) : null}
                </YStack>
                {accepted ? null : (
                    <XStack
                        height={48}
                        alignItems="center"
                        justifyContent="center"
                        gap={6}
                        paddingHorizontal={14}
                        borderRadius={14}
                        backgroundColor="$surfaceRaised"
                        borderWidth={1}
                        borderColor="$primaryBorder"
                        flexShrink={0}
                        onPress={onNext}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        testID={ids.close}
                    >
                        <Body fontSize={15} lineHeight={20} fontWeight="700" numberOfLines={1}>
                            {hasNext ? t('offers.deck.nextOffer') : t('common.close')}
                        </Body>
                        {hasNext ? <Glyph name="right" size={14} color={theme.textPrimary?.val as string} strokeWidth={2.8} /> : null}
                    </XStack>
                )}
            </XStack>
            {accepted ? (
                <YStack height={5} backgroundColor="$successFill">
                    <Animated.View style={{ height: 5, backgroundColor: success, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
                </YStack>
            ) : null}
        </View>
    );
}

/* -- The map behind. ----------------------------------------------------------- */

/** A pin's tag: how far the pickup is and, when the offer has one, its countdown. */
function PinTag({ children, edge, ink }: { children: React.ReactNode; edge?: string; ink?: string }) {
    const theme = useTheme();
    const scheme = useResolvedScheme();
    const skin = useFloatSkin(scheme !== 'light' && scheme !== 'sunlight');
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                height: 26,
                paddingHorizontal: 9,
                borderRadius: 13,
                borderWidth: 1,
                borderColor: edge ?? (theme.border?.val as string),
                backgroundColor: skin.backgroundColor,
            }}
        >
            {typeof children === 'string' ? (
                <Body fontSize={12} lineHeight={16} fontWeight="800" tabular numberOfLines={1} color={(ink ?? (theme.textPrimary?.val as string)) as never}>
                    {children}
                </Body>
            ) : (
                children
            )}
        </View>
    );
}

const PIN_WIDTH = 150;

function OfferMap({
    deck,
    summaries,
    topId,
    ended,
    road,
    position,
    offline,
    dark,
    units,
    now,
    single,
    padTop,
    padBottom,
    onPick,
    t,
}: {
    deck: OrderRecord[];
    summaries: Map<string, OfferSummary>;
    topId: string;
    ended?: EndedKind;
    /** The top offer's road, first place to last. Empty draws the dashed straight line. */
    road: LatLng[];
    position: Position;
    offline?: boolean;
    dark: boolean;
    units: DistanceUnit;
    now: number;
    single: boolean;
    /** The part of the map covered at the top (the chips) and at the bottom (the deck). */
    padTop: number;
    padBottom: number;
    onPick: (orderId: string) => void;
    t: T;
}) {
    const theme = useTheme();
    const ref = useRef<MapView>(null);
    const [ready, setReady] = useState(false);
    const fitted = useRef(false);
    const primary = theme.primary?.val as string;
    const warning = theme.warningText?.val as string;
    const success = theme.success?.val as string;
    const secondary = theme.textSecondary?.val as string;

    const top = summaries.get(topId);
    const tripPoints = useMemo(() => (top?.points ?? []).flatMap((point) => (point.point ? [point.point] : [])), [top]);
    const over = ended && ended !== 'accepted';

    /*
     * The view is the driver, the top offer's pickup and its drop-off, in the part the deck
     * leaves clear (the map's own padding). Without a driver position it is the offer's places.
     * It is fitted again when another offer comes to the top, not on every position tick.
     */
    const fitKey = `${topId}:${tripPoints.length}:${road.length}:${position ? 1 : 0}`;
    useEffect(() => {
        if (!ready) return;
        const coordinates = [...(position ? [{ latitude: position.latitude, longitude: position.longitude }] : []), ...tripPoints, ...road];
        if (!coordinates.length) return;
        if (coordinates.length === 1) {
            ref.current?.animateToRegion({ ...coordinates[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, fitted.current ? 300 : 0);
            fitted.current = true;
            return;
        }
        // The room for the chips and the deck is the map's own padding, so this is only breathing space for the pins and their tags.
        ref.current?.fitToCoordinates(coordinates, { edgePadding: { top: 48, right: 64, bottom: 56, left: 64 }, animated: fitted.current });
        fitted.current = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey, padBottom, padTop, ready]);

    const centre = tripPoints[0] ?? position ?? deck.map((order) => summaries.get(order.id)?.first?.point).find(Boolean);
    // Nothing to centre on: hold the map's place rather than show the whole world.
    if (!centre) return <YStack position="absolute" top={0} right={0} bottom={0} left={0} backgroundColor="$mapBackground" testID="offers-map-empty" />;

    const first = top?.first?.point;

    return (
        <YStack position="absolute" top={0} right={0} bottom={0} left={0} backgroundColor="$mapBackground">
            <MapView
                ref={ref}
                style={{ flex: 1 }}
                onMapReady={() => setReady(true)}
                mapPadding={{ top: padTop, right: 0, bottom: padBottom, left: 0 }}
                initialRegion={{ latitude: centre.latitude, longitude: centre.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
                {...mapLook(dark)}
                showsMyLocationButton={false}
                showsCompass={false}
                toolbarEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                testID="offers-map"
            >
                {/* From the driver to the pickup: dotted, because it is not a road anyone has worked out. */}
                {position && first && !over ? (
                    <Polyline coordinates={[{ latitude: position.latitude, longitude: position.longitude }, first]} strokeColor={secondary} strokeWidth={4} lineDashPattern={[1, 8]} lineCap="round" />
                ) : null}
                {/* The trip: the road when the tracker has one, else a dashed straight line that does not pretend to be it. */}
                {over ? null : road.length > 1 ? (
                    <CasedPolyline coordinates={road} color={ended === 'accepted' ? success : primary} zIndex={1} />
                ) : tripPoints.length > 1 ? (
                    <Polyline coordinates={tripPoints} strokeColor={ended === 'accepted' ? success : primary} strokeWidth={4} lineDashPattern={[8, 6]} />
                ) : null}

                {position ? (
                    <Marker coordinate={{ latitude: position.latitude, longitude: position.longitude }} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={5} tracksViewChanges testID="offers-driver">
                        <DriverPuck color={primary} heading={position.heading} muted={offline} />
                    </Marker>
                ) : null}

                {/* The top offer's places after the pickup: its waypoints by number, and the drop-off with its name. */}
                {over
                    ? null
                    : (top?.points ?? []).slice(1).map((point, index, rest) => {
                          if (!point.point) return null;
                          const isLast = index === rest.length - 1;
                          const name = isLast ? top?.lastTitle : undefined;
                          return (
                              <Marker
                                  key={`${topId}:place:${index}:${name ? 'n' : ''}`}
                                  coordinate={point.point}
                                  anchor={{ x: 0.5, y: name ? 16 / 58 : 0.5 }}
                                  tracksViewChanges={false}
                                  zIndex={3}
                                  testID={`offers-place-${index}`}
                              >
                                  <View style={{ width: name ? 170 : 32, alignItems: 'center' }} pointerEvents="none">
                                      <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                                          <PlaceMark point={point} size={28} color={primary} />
                                      </View>
                                      {name ? (
                                          <View style={{ marginTop: 4, height: 22, maxWidth: 170, paddingHorizontal: 9, borderRadius: 11, borderWidth: 1, borderColor: theme.border?.val as string, backgroundColor: (dark ? theme.background?.val : theme.surface?.val) as string, justifyContent: 'center' }}>
                                              <Body fontSize={11} lineHeight={14} fontWeight="700" tone="secondary" numberOfLines={1}>
                                                  {name}
                                              </Body>
                                          </View>
                                      ) : null}
                                  </View>
                              </Marker>
                          );
                      })}

                {/* Every open offer's pickup. The top one is larger, with a halo; the others bring their card to the top when tapped. */}
                {deck.map((order, index) => {
                    const summary = summaries.get(order.id);
                    const point = summary?.first?.point;
                    if (!summary || !point) return null;
                    const isTop = order.id === topId;
                    const meters = metersToPickup(position, summary);
                    const left = secondsLeft(order, now);
                    const distance = meters !== undefined ? formatMeters(meters, units) : undefined;
                    const state = isTop ? (ended ?? 'top') : 'quiet';
                    const faded = isTop && over;
                    const mark = isTop && !faded ? (single || ended === 'accepted' ? 36 : 48) : 32;
                    const halo = isTop && !faded ? mark + 12 : 0;
                    const frame = Math.max(48, halo);
                    const hasTag = faded || ended === 'accepted' ? isTop : !!distance || left !== null;
                    const tagGap = isTop && !faded ? 2 : -6;
                    const height = frame + (hasTag ? tagGap + 26 : 0);
                    const place = [roleLabel(summary.first, t), summary.firstTitle, distance ? t('offers.deck.fromYou', { distance }) : null, left !== null ? t('offers.deck.timeToDecide', { time: formatCountdown(left) }) : t('offers.deck.noTimeLimit')]
                        .filter(Boolean)
                        .join(', ');
                    return (
                        <Marker
                            // Drawn once unless its countdown is ticking, and the web map fixes a marker's anchor for its lifetime: a change of state is a new marker.
                            key={`${order.id}:${state}:${single ? 's' : 'd'}:${hasTag ? 't' : ''}`}
                            coordinate={point}
                            anchor={{ x: 0.5, y: frame / 2 / height }}
                            tracksViewChanges={left !== null && !faded}
                            zIndex={isTop ? 4 : 2}
                            onPress={isTop ? undefined : () => onPick(order.id)}
                            accessibilityLabel={t(isTop ? 'offers.deck.pinTop' : 'offers.deck.pin', { number: index + 1, place })}
                            testID={`offers-pin-${order.id}`}
                        >
                            <View style={{ width: PIN_WIDTH, alignItems: 'center', opacity: faded ? 0.45 : 1 }}>
                                <View style={{ width: frame, height: frame, alignItems: 'center', justifyContent: 'center' }}>
                                    {halo ? <View style={{ position: 'absolute', width: halo, height: halo, borderRadius: halo / 2, backgroundColor: 'rgba(34,197,94,0.3)' }} /> : null}
                                    <PlaceMark point={summary.first} size={faded ? 28 : mark} color={primary} />
                                </View>
                                {hasTag ? (
                                    <View style={{ marginTop: tagGap }}>
                                        {ended === 'accepted' && isTop ? (
                                            <PinTag edge={success}>
                                                <Glyph name="tick" size={12} color={success} strokeWidth={3.4} />
                                                <Body fontSize={12} lineHeight={16} fontWeight="800" tabular numberOfLines={1} color={success as never}>
                                                    {[t('offers.deck.tagYours'), distance].filter(Boolean).join(' · ')}
                                                </Body>
                                            </PinTag>
                                        ) : faded && ended === 'expired' ? (
                                            <PinTag edge={theme.warningBorder?.val as string}>
                                                <Glyph name="clock" size={12} color={warning} strokeWidth={2.8} />
                                                <Body fontSize={12} lineHeight={16} fontWeight="800" tabular numberOfLines={1} color={warning as never}>
                                                    {formatCountdown(0)}
                                                </Body>
                                            </PinTag>
                                        ) : faded ? (
                                            <PinTag>
                                                <Glyph name="taken" size={13} color={secondary} strokeWidth={2.6} />
                                                <Body fontSize={12} lineHeight={16} fontWeight="800" numberOfLines={1} tone="secondary">
                                                    {t('offers.deck.tagTaken')}
                                                </Body>
                                            </PinTag>
                                        ) : (
                                            <PinTag edge={isTop ? primary : undefined}>
                                                {distance ? (
                                                    <Body fontSize={12} lineHeight={16} fontWeight="800" tabular numberOfLines={1}>
                                                        {distance}
                                                    </Body>
                                                ) : null}
                                                {left !== null ? (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                        <Glyph name="clock" size={12} color={isTop ? warning : secondary} strokeWidth={2.8} />
                                                        <Body fontSize={12} lineHeight={16} fontWeight="800" tabular numberOfLines={1} color={(isTop ? warning : secondary) as never}>
                                                            {formatCountdown(left)}
                                                        </Body>
                                                    </View>
                                                ) : null}
                                            </PinTag>
                                        )}
                                    </View>
                                ) : null}
                            </View>
                        </Marker>
                    );
                })}
            </MapView>
        </YStack>
    );
}

const styles = StyleSheet.create({
    deck: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    plate: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: CARD_RADIUS, borderWidth: 1, overflow: 'hidden' },
    edge: { position: 'absolute', top: -1, right: -1, bottom: -1, left: -1, borderRadius: CARD_RADIUS, borderWidth: 2 },
    stamp: { position: 'absolute', top: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 3 },
});

export default OfferDeck;
