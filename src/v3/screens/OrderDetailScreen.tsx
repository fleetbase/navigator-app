/**
 * Order — design round 3 (OrderCombined.dc.html, OrderCombinedScroll.dc.html).
 *
 * One screen, three layers:
 *
 *   - the **map** is the whole background: the road route, the console's
 *     markers, the driver;
 *   - two round **buttons** float over its top: back on the left, and on the
 *     right a small stack of shortcuts for the order (the order's chat with
 *     dispatch, with its unread count, is the first);
 *   - a **sheet** over the bottom carries everything else. It rests leaving the
 *     top of the map showing and pulls up to just under the buttons; it cannot
 *     be dismissed. Its header (QR code, tracking number, status) and the
 *     section index under it stay put; the sections scroll: now (with the
 *     order's notes), trip, cash, items, people, proof, documents, comments,
 *     activity, reference, report an issue. The order's whole history opens in
 *     a sheet over the screen, from the activity section or the status.
 *
 * The step that moves the order on is anchored at the foot of the screen, with
 * whatever stands between the driver and that step said right above it. The
 * button names the step ("Next step / Driver en route"); pressing it turns the
 * foot of the screen into a question with a slide to confirm, and only a slide
 * carried to the end moves the order on.
 *
 * Dispatch is not a driver's step unless the organisation says so (FleetOps →
 * Settings → Navigator App). An order that has not been dispatched reads
 * "Waiting for dispatch" and offers no step.
 *
 * The steps come from `order-configs` and vary per organisation, so nothing
 * here assumes a fixed flow. The advance is a mutation, so it goes through the
 * adapter and queues when offline — a driver marking "arrived" in a basement
 * keeps the progress and the app says so rather than failing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Svg, { Path } from 'react-native-svg';
import { YStack, XStack, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Secondary } from '../ui/Text';
import { Button } from '../ui/Button';
import { Banner, ErrorState, Skeleton } from '../ui/Banner';
import { ProofRequiredHint, nextActivity, sequenceFlow, unresolvedLogic, type FlowActivity } from '../ui/ActivityStepper';
import { space } from '../theme/tokens';
import { describeStatus } from '../theme/status';
import { useTranslation } from '../i18n/useTranslation';
import {
    useOrderRecord,
    useOrderConfig,
    useOrderRemoval,
    useTracker,
    useNextActivity,
    useChatChannels,
    useOrderDispatchChannel,
    useOrderTimeline,
    currentDestination,
    orderStops,
    stopLabel,
    orderStore,
    displayIdOf,
    entityIdOf,
    entityTrackingNumberOf,
    orderConfigIdOf,
    payloadOf,
    isFinishedStatus,
    cashOnDeliveryOf,
    customerContactOf,
    dropoffContactOf,
    deliveryInstructionsOf,
    orderNotesOf,
    orderPlaceNotesOf,
    placeLines,
    scheduleWindowOf,
    isBookingOrder,
    orderThreadsOf,
    proofFor,
    takeAutoAdvance,
    clearProof,
    type ChatChannelRecord,
    type RemovalReason,
    type TrackerRecord,
    decodePolyline,
    coordsOfPoint,
} from '../data';
import { proofMethodOf } from '../data/useProofCapture';
import { useNavigatorSettings } from '../data/useNavigatorSettings';
import { useFleetbase, isQueuedAck } from '../api';
import { useSettings, useResolvedScheme } from '../settings';
import { useDeviceLocation } from '../shell';
import { OrderMap, type OrderMapStop } from '../ui/OrderMap';
import { markerKindOf } from '../ui/RouteMap';
import { colorForId } from '../ui/routeColors';
import { formatClock, formatDuration, formatMeters } from '../format';
import { fromGeoPoint, type Destination } from '../navigate/handoff';
import { useLiveRefresh, useOrderChannel, useOrderChange, dismissOrderChange, changesDropoff } from '../realtime';
import { BringChecklist, CashSection, ChangeBanner, ContactSection, DropoffContactSection, ItemRow, scheduleLabel, totalWeightLabel } from './orderDetail/OrderSections';
import { SlideToConfirm } from './orderDetail/SlideToConfirm';
import { CapturedProofs, ActivitySection, ActivitySheet, Comments, Facilitator, Files, OrderReference, orderCodesOf, type ActivityStep } from './orderDetail/OrderDetails';
import { MapButton, NowCard, ProofSection, QrSheet, ReportIssueButton, SectionPills, SheetHeader, TripSection, type NowNote, type ProofRow, type TripExtra } from './orderDetail/OrderSheetParts';
import { ItemPagerModal } from './item/ItemPagerModal';
import { Card, GUTTER, Section } from './jobs/parts';
import { HomeIcon, NoteCard } from './home/parts';
import { isOrderStarted, orderPoints, orderTypeLabel } from './jobs/model';

/** The sections the index can jump to, in the order they appear. */
type SectionKey = 'now' | 'trip' | 'items' | 'people' | 'files' | 'activity' | 'info';
const SECTION_ORDER: SectionKey[] = ['now', 'trip', 'items', 'people', 'files', 'activity', 'info'];

/** The step action at the foot of the screen. */
const ACTION_HEIGHT = 60;
const ACTION_RADIUS = 16;
/** The round buttons over the map, and the room kept between them and the sheet at its highest. */
const MAP_BUTTON = 44;
const MAP_BUTTON_GAP = 16;
/** How much of the screen the map keeps when the sheet is at rest. */
const MAP_SHARE = 0.3;
/** Space between the sheet's cards. */
const SHEET_GAP = 14;

/** What the advance posts: the server's activity object when it gave one, else the code. */
type Advanceable = FlowActivity & { _resolved_status?: string | null };

export function OrderDetailScreen({
    orderId,
    reloadToken = 0,
    onBack,
    onNavigate,
    onCaptureProof,
    onChangeDestination,
    onRemoved,
    onOpenChannel,
    onMessageDispatch,
    onReportIssue,
    onConfirmingChange,
    openUrl = (url: string) => Linking.openURL(url),
}: {
    orderId: string;
    /** Bumped on screen focus: the order, tracker and next step are asked again. */
    reloadToken?: number;
    /** Leaves the screen: the round button over the map's top left. */
    onBack?: () => void;
    /**
     * No longer called: an item opens in the item pager over the order (see
     * item/ItemPagerModal) rather than on a screen of its own. Kept so a host
     * that still passes it type-checks.
     */
    onOpenEntity?: (entity: { id: string; name?: string; entity: Record<string, unknown> }) => void;
    /**
     * No longer called: the activity history opens in a sheet over the order
     * (see ActivitySheet) rather than on a screen of its own. Kept so a host
     * that still passes it type-checks.
     */
    onOpenTimeline?: () => void;
    /** Opens the navigation hand-off for the current destination (R2 D6). */
    onNavigate?: (destination: Destination) => void;
    /** Opens the stop picker, when the order has more than one stop. */
    onChangeDestination?: () => void;
    /** Opens proof capture for an activity whose config demands it. */
    onCaptureProof?: (request: { orderId: string; activityCode: string; activityLabel: string; podMethod?: string | null; expected?: string[] }) => void;
    /** The order was taken off this driver; the host leaves the screen. */
    onRemoved?: (reason: RemovalReason) => void;
    /** Opens an order-linked chat thread: the order's chat with dispatch, or the customer's. */
    onOpenChannel?: (channel: ChatChannelRecord) => void;
    /** Starts a conversation with dispatch when the server cannot give the order a chat of its own (an older server). */
    onMessageDispatch?: () => void;
    /** Opens the issue form about this order; `label` is its tracking number. */
    onReportIssue?: (order: { id: string; label: string }) => void;
    /** Told when the foot of the screen starts and stops asking for a slide to confirm, so the host can keep a swipe back from taking the slide. */
    onConfirmingChange?: (confirming: boolean) => void;
    /** Injected in tests; defaults to Linking. */
    openUrl?: (url: string) => Promise<unknown>;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { adapter } = useFleetbase();
    const insets = useSafeAreaInsets();
    const theme = useTheme();

    /*
     * Fetched, not just read from the store: an order edited while the driver
     * has it open (a new drop-off, an item gone) must be what they see. It is
     * refetched on every order event and on focus.
     */
    const { order } = useOrderRecord(orderId, reloadToken);
    useOrderChannel(orderId);
    const revision = useLiveRefresh();
    const removal = useOrderRemoval(orderId);
    const change = useOrderChange(orderId);

    const configId = orderConfigIdOf(order);
    const { config, flow, isLoading: configLoading, failed: configFailed } = useOrderConfig(configId);
    /*
     * The tracker is still wanted for the ETA and the distance, which are its
     * own computation. The *destination* is not: `payload.current_waypoint` is
     * a place id that the server writes when `set-destination` is called, so it
     * is the authoritative answer to "where now" rather than something to infer
     * from a tracker that may not have loaded. Reloaded with the order.
     */
    const { tracker: live } = useTracker(orderId, reloadToken + revision);
    const { activities: serverNext, source } = useNextActivity(orderId, order?.status, reloadToken + revision);

    const [isAdvancing, setIsAdvancing] = useState(false);
    const [queued, setQueued] = useState(false);
    const [advanceError, setAdvanceError] = useState<string | null>(null);
    const [cashCollected, setCashCollected] = useState(false);
    // Whether the organisation lets a driver dispatch an order themselves. Off unless it said so.
    const { allowDriverDispatch } = useNavigatorSettings();
    /*
     * The step the foot of the screen is asking about. Pressing a step does
     * not move the order: it sets this, the footer becomes "Update this order
     * to …?" with a slide to confirm, and the completed slide is what advances.
     */
    const [confirming, setConfirming] = useState<Advanceable | null>(null);
    // The question was about the order as it stood: once the order moves on, it is withdrawn.
    useEffect(() => {
        setConfirming(null);
    }, [orderId, order?.status]);
    const isConfirming = !!confirming;
    useEffect(() => {
        onConfirmingChange?.(isConfirming);
        return () => {
            if (isConfirming) onConfirmingChange?.(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConfirming]);

    // Leave once — the host pops back to the list, which says why.
    const leftFor = useRef<RemovalReason | null>(null);
    useEffect(() => {
        if (removal && leftFor.current !== removal) {
            leftFor.current = removal;
            onRemoved?.(removal);
        }
    }, [removal, onRemoved]);

    /** Registry wording wins over the config's own label. */
    const labelFor = useCallback(
        (activity: Advanceable) => {
            const d = describeStatus(activity.code);
            return t(d.labelKey, { defaultValue: activity._resolved_status ?? activity.status ?? d.defaultLabel });
        },
        [t]
    );

    /*
     * The server's answer when it gave one — it has evaluated the `logic` the
     * app cannot, so a branch is a choice of buttons rather than "ask
     * dispatch". Otherwise the client-side sequencer, as before.
     */
    const offered = useMemo<Advanceable[]>(() => {
        if (source === 'server' && serverNext) return serverNext;
        const local = nextActivity(flow, order?.status);
        return local ? [local] : [];
    }, [source, serverNext, flow, order?.status]);
    // The config's `complete` flag, not a list of names: a booking flow may end anywhere.
    const finished = useMemo(() => isFinishedStatus(order?.status, flow), [flow, order?.status]);
    /*
     * Dispatch. An order that has not been dispatched has "dispatched" as the
     * next step of its flow, and that step is the console's to take, not the
     * driver's, unless the organisation turned on "drivers can dispatch". So:
     *
     *   - the order counts as waiting for dispatch when nothing says it was
     *     dispatched or started, and its next step (the server's offer, or the
     *     flow's own) is the dispatch step;
     *   - the driver may take that step only when the setting is on *and* the
     *     server offered it (a server that withholds it has the last word).
     *
     * While it waits there is no step to offer: no button, no choices.
     */
    const flowNext = useMemo(() => nextActivity(flow, order?.status), [flow, order?.status]);
    const dispatchOffered = offered.some((activity) => activity.code === 'dispatched');
    const notDispatched = !!order && !order.dispatched_at && !(order as { dispatched?: unknown }).dispatched && !isOrderStarted(order);
    const waitingForDispatch = notDispatched && !finished && (dispatchOffered || flowNext?.code === 'dispatched') && (!allowDriverDispatch || (source === 'server' && !dispatchOffered));
    const candidates = useMemo<Advanceable[]>(() => (waitingForDispatch ? [] : offered), [waitingForDispatch, offered]);
    const next = candidates[0];
    const ambiguous = useMemo(() => source !== 'server' && unresolvedLogic(flow, order?.status), [source, flow, order?.status]);

    const payload = payloadOf(order);
    const entities = useMemo(() => payload.entities ?? [], [payload.entities]);
    const cod = cashOnDeliveryOf(order);
    /*
     * The driver says they took the cash. Recorded on the order so the day's
     * hand-in can be checked; sent in the background (queued without signal),
     * because the driver is at a door and the next tap is completing the order.
     */
    const confirmCash = () => {
        setCashCollected(true);
        if (order?.id) void adapter.post(`orders/${order.id}/cash-collected`, cod ? { amount: cod.amount } : {}).catch(() => undefined);
    };
    /** Completing an order with cash still owed needs the driver to say they took it. */
    const needsCash = (activity?: Advanceable) => Boolean(activity?.complete && cod?.toCollect && !cashCollected);

    const advance = useCallback(
        async (activity?: Advanceable) => {
            if (!activity || !order) return;
            /*
             * Proof first, always — but only once. A capture is recorded
             * against this order and activity (`proofLedger`), so coming back
             * from the capture screen advances instead of asking again.
             */
            const proof = proofFor(order.id, activity.code);
            if (activity.require_pod && onCaptureProof && !proof) {
                const expected = entities.map((e) => entityTrackingNumberOf(e as Record<string, unknown>)).filter((c): c is string => !!c);
                onCaptureProof({ orderId: order.id, activityCode: activity.code, activityLabel: labelFor(activity), podMethod: activity.pod_method, expected });
                return;
            }
            if (needsCash(activity)) return;
            setIsAdvancing(true);
            setAdvanceError(null);
            try {
                const result = await adapter.post(`orders/${order.id}/update-activity`, {
                    // v2 sent the server's activity object; the code is what the
                    // client-side sequencer has. Both resolve server-side.
                    activity: source === 'server' ? activity : activity.code,
                    ...(proof?.proofId ? { proof: proof.proofId } : {}),
                });
                clearProof(order.id, activity.code);
                if (isQueuedAck(result)) {
                    // Optimistic: reflect the new status locally so the driver can
                    // carry on. The queue replays it with the original key.
                    orderStore.upsert({ id: order.id, status: activity.code });
                    setQueued(true);
                } else {
                    const data = (result as { data?: unknown })?.data ?? result;
                    orderStore.upsert({ ...(data as object), id: order.id } as never);
                }
            } catch (err) {
                setAdvanceError((err as Error).message);
            } finally {
                setIsAdvancing(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [adapter, onCaptureProof, order, labelFor, entities, source, cod?.toCollect, cashCollected]
    );

    /*
     * Back from a successful capture: advance into the activity it was for,
     * once. Not when cash is still to be confirmed — that is the driver's tap.
     */
    useEffect(() => {
        if (!order || !next?.require_pod || needsCash(next)) return;
        if (takeAutoAdvance(order.id, next.code)) void advance(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order?.id, next?.code, reloadToken]);

    /** Pressing a step asks first: the foot of the screen becomes the question, with its slide to confirm. */
    const askToAdvance = (activity?: Advanceable) => {
        if (!activity || isAdvancing || needsCash(activity)) return;
        setConfirming(activity);
    };
    /** The slide was carried to the end: now the step is taken, exactly as a press used to take it. */
    const confirmAdvance = () => {
        const activity = confirming;
        setConfirming(null);
        if (activity) void advance(activity);
    };

    const { channels } = useChatChannels(0, { enabled: !!onOpenChannel });
    const threads = useMemo(() => orderThreadsOf(channels, order?.id), [channels, order?.id]);
    // The order's chat with dispatch: asked for when the chat button is pressed (the server starts it if there is none).
    const { open: openDispatchChannel, isOpening: chatOpening } = useOrderDispatchChannel(order?.id);
    // What has happened to the order, oldest first: the times on the activity section's steps.
    const { events: timeline, isLoading: timelineLoading, failed: timelineFailed, refresh: refreshTimeline } = useOrderTimeline(orderId);
    const [activityOpen, setActivityOpen] = useState(false);

    /*
     * The sheet. Heights come from the screen as it was measured, as on Home:
     * at rest the sheet leaves the top of the map showing, and at its highest
     * it stops under the floating buttons.
     */
    const windowHeight = useWindowDimensions().height;
    const [layoutHeight, setLayoutHeight] = useState(0);
    const height = layoutHeight || windowHeight;
    const buttonsTop = Math.max(insets.top, space[4]);
    const restHeight = Math.round(height * (1 - MAP_SHARE));
    const fullHeight = Math.max(restHeight + 1, Math.round(height - (buttonsTop + MAP_BUTTON + MAP_BUTTON_GAP)));
    const snapPoints = useMemo(() => [restHeight, fullHeight], [restHeight, fullHeight]);
    const sheetRef = useRef<BottomSheet>(null);
    const sheetIndex = useRef(0);
    const [footerHeight, setFooterHeight] = useState(0);
    const [qrOpen, setQrOpen] = useState(false);
    // The item the pager over the order is open at; null while it is closed.
    const [itemIndex, setItemIndex] = useState<number | null>(null);

    /*
     * The section index. Each section reports where it sits in the scroll; the
     * pill for the one at the top of the view is the active one, and tapping a
     * pill scrolls to its section. While a tap's own scroll is running the
     * scroll does not move the pill, so it does not flicker through the
     * sections in between.
     */
    const scrollRef = useRef<any>(null);
    const sectionTops = useRef<Partial<Record<SectionKey, number>>>({});
    const sectionKeys = useRef<SectionKey[]>([]);
    const jumpingUntil = useRef(0);
    const [activeSection, setActiveSection] = useState<SectionKey>('now');
    const placeSection = (key: SectionKey) => (event: LayoutChangeEvent) => {
        sectionTops.current[key] = event.nativeEvent.layout.y;
    };
    const onSheetScroll = useCallback((event: { nativeEvent: { contentOffset?: { y?: number }; contentSize?: { height?: number }; layoutMeasurement?: { height?: number } } }) => {
        if (Date.now() < jumpingUntil.current) return;
        const y = event.nativeEvent.contentOffset?.y ?? 0;
        const keys = sectionKeys.current;
        if (!keys.length) return;
        const viewport = event.nativeEvent.layoutMeasurement?.height ?? 0;
        const content = event.nativeEvent.contentSize?.height ?? 0;
        let current = keys[0];
        // At the very end the last section is the one in view, however short it is.
        if (viewport > 0 && y > 0 && y + viewport >= content - 2) current = keys[keys.length - 1];
        else for (const key of keys) if ((sectionTops.current[key] ?? Infinity) <= y + 24) current = key;
        setActiveSection((previous) => (previous === current ? previous : current));
    }, []);
    const jumpToSection = useCallback((key: SectionKey) => {
        setActiveSection(key);
        jumpingUntil.current = Date.now() + 800;
        // The first section is the top of the sheet; the others stop just under the index.
        const y = key === sectionKeys.current[0] ? 0 : Math.max(0, (sectionTops.current[key] ?? 0) - 4);
        const scroll = () => scrollRef.current?.scrollTo?.({ y, animated: true });
        // At rest the sheet holds its content still, so it is pulled up first and scrolled once it is there.
        if (sheetIndex.current === 0 && y > 0) {
            sheetRef.current?.snapToIndex(1);
            setTimeout(scroll, 350);
        } else {
            scroll();
        }
    }, []);

    if (!order) {
        // No title bar on this screen: the way back is drawn here too.
        const back = onBack ? <MapButton icon="back" label={t('common.back')} onPress={onBack} testID="order-back" /> : null;
        if (removal) {
            return (
                <YStack flex={1} backgroundColor="$background" paddingTop={buttonsTop} paddingHorizontal={GUTTER} gap={space[3]} testID="order-detail-removed">
                    {back}
                    <Banner tone="warning" message={t('orderDetail.reassigned')} />
                </YStack>
            );
        }
        return (
            <YStack flex={1} backgroundColor="$background" paddingTop={buttonsTop} paddingHorizontal={GUTTER} gap={space[3]} testID="order-detail-loading">
                {back}
                <Skeleton height={96} />
                <Skeleton height={180} />
            </YStack>
        );
    }

    const heading = currentDestination(payload);
    const points = orderPoints(order);
    const started = isOrderStarted(order);
    /*
     * Counting waypoints alone was wrong, and the device said so: a plain
     * pickup → drop-off order carries no `waypoints` at all, so the button
     * vanished from the very order that has two places to be. Pickup and
     * drop-off count; the waypoint list is what an order adds *between* them.
     */
    const hasChoiceOfStops = orderStops(payload).length > 1;
    /*
     * Where Navigate goes: the place being headed to, from the order as it is
     * *now*. It used to be `payload.dropoff` — wrong on the way to a pickup,
     * and the hand-off then kept that point in its route params, so a drop-off
     * moved by the store sent the driver to the old address.
     * GeoJSON is [longitude, latitude]; fromGeoPoint owns that flip.
     */
    // Named as every place is: its name, else its address, with the separators its empty parts leave behind trimmed (data/placeText).
    const headingPoint =
        fromGeoPoint(heading?.location, placeLines(heading as Record<string, unknown> | undefined).title ?? stopLabel(heading)) ??
        fromGeoPoint((payload.dropoff as { location?: { coordinates?: number[] } } | undefined)?.location, placeLines(payload.dropoff as Record<string, unknown> | undefined).title);
    /*
     * `order.tracker_data` comes back null on this API, so the ETA and distance
     * it fed never rendered — a quiet dead path. The live tracker endpoint is
     * where those numbers actually are, and it is already loaded above.
     */
    const liveEta = live?.eta?.active_stop_seconds;
    const startEta = live?.eta?.start_seconds;
    const legs = live?.route?.legs ?? [];
    const schedule = scheduleWindowOf(order);

    const isBooking = isBookingOrder(order);
    const contact = customerContactOf(order);
    // Someone to reach at the drop-off, when the place has a number of its own: shown as that, never as the customer.
    const dropoffPerson = dropoffContactOf(order);
    const dropoffContact = dropoffPerson && dropoffPerson.phone !== contact?.phone ? dropoffPerson : undefined;
    const reopenNavigation =
        change && changesDropoff(change.changes) && onNavigate && headingPoint
            ? () => {
                  dismissOrderChange(order.id);
                  onNavigate(headingPoint);
              }
            : undefined;
    const messageCustomer = threads.customer && onOpenChannel
        ? () => onOpenChannel(threads.customer as ChatChannelRecord)
        : contact?.phone
          ? () => void openUrl(`sms:${contact.phone}`).catch(() => undefined)
          : undefined;
    const unreadCustomer = Number(threads.customer?.unread_count) || 0;
    const unreadDispatch = Number(threads.dispatch?.unread_count) || 0;
    const openCustomerThread = threads.customer && onOpenChannel ? () => onOpenChannel(threads.customer as ChatChannelRecord) : undefined;
    /*
     * What the chat button did before an order had a chat with dispatch of its
     * own, and still does against a server without one: the order's thread
     * with something unread in it, else a new conversation with dispatch.
     */
    const legacyDispatch = threads.dispatch && onOpenChannel ? () => onOpenChannel(threads.dispatch as ChatChannelRecord) : onMessageDispatch;
    const legacyChat = unreadCustomer > 0 && unreadDispatch === 0 && openCustomerThread ? openCustomerThread : (legacyDispatch ?? openCustomerThread);
    /*
     * The chat button over the map opens the order's chat with dispatch. The
     * thread already in the driver's list opens straight away; otherwise the
     * server is asked for it (it starts one, with dispatch in it, when the
     * order has none). When it cannot give one, the button falls back to what
     * it did before. The customer has their own Message button on the sheet.
     */
    const openChat = onOpenChannel
        ? () => {
              if (threads.dispatch) {
                  onOpenChannel(threads.dispatch);
                  return;
              }
              void openDispatchChannel().then((channel) => {
                  if (channel) onOpenChannel(channel);
                  else legacyChat?.();
              });
          }
        : legacyChat;
    // The count on the button is that chat's own unread messages.
    const unreadChat = unreadDispatch;
    const blockedOnCash = needsCash(next);

    const sequenced = sequenceFlow(flow);
    const primary = !ambiguous ? next : undefined;
    // Where the order stands among its steps: its own status, not the step that comes next.
    const statusIndex = sequenced.ordered ? sequenced.steps.findIndex((a) => a.code === order.status) : -1;
    const canNavigate = Boolean(onNavigate && headingPoint && !finished);

    // The waypoint this moment is about: the one being headed to, or, before the order starts, the one it starts at.
    const focusPoint = points.find((p) => p.state === 'current') ?? (started ? undefined : points.find((p) => p.state === 'later'));

    /*
     * "1.1 km · 3 min · arrive 14:17" — the road to the next waypoint, from the
     * tracker's first leg, and when the driver gets there. Only the figures
     * the server gave: before the order starts there is no arrival, and what
     * the tracker has instead is when it is expected to start.
     */
    const legMeters = Number(legs[0]?.distance_m ?? live?.progress?.remaining_distance_m);
    const travelSeconds = Number(liveEta ?? legs[0]?.duration_s);
    const stale = Boolean(live?.insights?.is_location_stale);
    const arriveAt = liveEta != null && Number.isFinite(Number(liveEta)) ? new Date(Date.now() + Number(liveEta) * 1000).toISOString() : undefined;
    const nowLine = finished
        ? ''
        : [
              Number.isFinite(legMeters) && legMeters > 0 ? formatMeters(legMeters, units) : undefined,
              Number.isFinite(travelSeconds) && travelSeconds > 0 ? formatDuration(travelSeconds) : undefined,
              arriveAt
                  ? `${stale ? '~' : ''}${t('orderDetail.now.arrive', { time: formatClock(arriveAt) })}`
                  : startEta
                    ? `${t('orderDetail.strip.start')} ${formatClock(new Date(Date.now() + Number(startEta) * 1000).toISOString())}`
                    : undefined,
          ]
              .filter(Boolean)
              .join(' · ');
    // Against the waypoint's own window when it has one, else the order's.
    const windowEnd = focusPoint?.windowEnd ?? schedule?.end;
    const windowText = focusPoint?.windowStart && focusPoint.windowEnd ? `${formatClock(focusPoint.windowStart)}–${formatClock(focusPoint.windowEnd)}` : undefined;
    let nowNote: NowNote | undefined;
    if (!finished && windowEnd) {
        const by = formatClock(windowEnd);
        if (arriveAt) {
            const late = Date.parse(arriveAt) > Date.parse(windowEnd);
            nowNote = late
                ? { tone: 'danger', text: windowText ? t('orderDetail.now.lateWindow', { window: windowText }) : t('orderDetail.now.lateBy', { time: by }) }
                : { tone: 'success', text: windowText ? t('orderDetail.now.inWindow', { window: windowText }) : t('orderDetail.now.onTimeBy', { time: by }) };
        } else {
            nowNote = { tone: 'neutral', text: windowText ? t('orderDetail.trip.window', { window: windowText }) : t('home.trip.dueBy', { time: by }) };
        }
    }

    /*
     * Notes, in full, where they belong. What is said about the whole order
     * (`order.notes`) is its own card right under "now". What is said about a
     * place is on that place's row of the trip: the waypoint's own notes and
     * the place's instructions (see `placeNotesOf`). Delivery instructions
     * kept on the payload or the order rather than on a place go on the
     * drop-off's row, which is where they apply; an order with no drop-off
     * carries them under the rail.
     */
    const orderNotes = orderNotesOf(order);
    const placeNotes = orderPlaceNotesOf(order);
    const dropoffIndex = points.findIndex((p) => p.role === 'dropoff');
    const tripNotes: Record<number, string[]> = {};
    // The two lists are built in the same order (pickup, waypoints, drop-off); if they ever differ in length the rows keep the notes the model read.
    if (placeNotes.length === points.length) placeNotes.forEach((notes, index) => (notes.length ? (tripNotes[index] = notes) : undefined));
    const instructions = deliveryInstructionsOf(order)?.trim();
    const saidOnAPlace = !!instructions && (placeNotes.some((notes) => notes.includes(instructions)) || points.some((p) => p.note?.trim() === instructions));
    const looseInstructions = instructions && !saidOnAPlace && instructions !== orderNotes ? instructions : undefined;
    if (looseInstructions && dropoffIndex >= 0) tripNotes[dropoffIndex] = [...(tripNotes[dropoffIndex] ?? []), looseInstructions];
    const tripExtras: TripExtra[] = [
        // A delivery's scheduled time is with its dates; only a job's slot is said here.
        isBooking && schedule?.start ? { key: 'slot', label: t('orderDetail.booking.slot'), text: scheduleLabel(schedule), testID: 'order-schedule' } : undefined,
        looseInstructions && dropoffIndex < 0 ? { key: 'instructions', label: t('orderDetail.instructions'), text: looseInstructions, testID: 'order-instructions' } : undefined,
    ].filter((extra): extra is TripExtra => !!extra);

    /*
     * What the order will still ask for, from its own steps. On a flow whose
     * order is known, the steps already behind the driver are left out; on one
     * that branches, every step that asks is listed.
     */
    const proofRows: ProofRow[] = finished
        ? []
        : (sequenced.ordered ? sequenced.steps : flow)
              .filter((activity, index) => !!activity.require_pod && (!sequenced.ordered || index > statusIndex))
              .map((activity) => ({ key: activity.code, method: proofMethodOf(activity.pod_method), step: labelFor(activity), captured: !!proofFor(order.id, activity.code) }));

    const trackingNumber = displayIdOf(order);
    const codes = orderCodesOf(order);
    // What kind of order this is: its order config's name ("Parcel delivery"), else its own `type`.
    const typeName = config?.name ?? orderTypeLabel(order);
    const eyebrow = isBooking
        ? config?.name
            ? t('orderDetail.eyebrowJob', { type: config.name })
            : t('orderDetail.booking.jobLabel')
        : typeName
          ? t('orderDetail.eyebrow', { type: typeName })
          : t('orderDetail.eyebrowPlain');
    const totalWeight = totalWeightLabel(entities);

    /*
     * The activity section. On a flow whose order is known, its steps: the
     * ones behind the order are done, the one it stands at is current, the
     * rest are to come; each done or current step carries the time of its
     * latest tracking status. On a flow that branches, or a status that is not
     * one of its steps, what has actually happened so far, in order.
     */
    const happenedAt = (code?: string | null) => {
        const wanted = String(code ?? '').toLowerCase();
        if (!wanted) return undefined;
        const matches = (timeline ?? []).filter((event) => String(event.code ?? '').toLowerCase() === wanted);
        return matches.length ? matches[matches.length - 1].created_at : undefined;
    };
    const activitySteps: ActivityStep[] =
        sequenced.ordered && statusIndex >= 0
            ? sequenced.steps.map((activity, index) => ({
                  key: activity.code,
                  label: labelFor(activity),
                  state: index < statusIndex || (index === statusIndex && finished) ? 'done' : index === statusIndex ? 'current' : 'next',
                  at: index <= statusIndex ? happenedAt(activity.code) : undefined,
              }))
            : (timeline ?? []).map((event, index, all) => ({
                  key: `${event.id ?? index}`,
                  label: labelFor({ code: event.code ?? '', status: event.status }),
                  state: index === all.length - 1 && !finished ? 'current' : 'done',
                  at: event.created_at,
              }));
    // Opened from the activity section and from the status in the header; asked for again so it is current.
    const openActivity = () => {
        setActivityOpen(true);
        void refreshTimeline();
    };

    // The index lists only the sections this order has.
    const present: Record<SectionKey, boolean> = {
        now: true,
        trip: points.length > 0 || !!cod,
        items: entities.length > 0,
        // Always there: an order with no customer says so.
        people: true,
        // Comments are always somewhere to leave a note, so this one is always there.
        files: true,
        // Where the order stands is always something to say.
        activity: true,
        info: true,
    };
    const pills = SECTION_ORDER.filter((key) => present[key]).map((key) => ({ key, label: t(`orderDetail.index.${key}`) }));
    sectionKeys.current = pills.map((pill) => pill.key);

    /*
     * The action at the foot of the screen is the step that moves the order
     * on. The way to the next waypoint is on the "now" card; when there is no
     * step to offer it takes the foot of the screen instead, so there is
     * always one thing to press down there.
     */
    const navigateLabel = focusPoint ? t(`home.trip.navigateTo.${focusPoint.role}`) : t('orderDetail.navigate');
    const navigate = canNavigate && headingPoint ? { label: navigateLabel, onPress: () => onNavigate?.(headingPoint) } : undefined;
    const onPrimaryInk = theme.onPrimary?.val as string;
    const advanceButton = primary ? (
        <Button
            fullWidth
            height={ACTION_HEIGHT}
            borderRadius={ACTION_RADIUS}
            variant="primary"
            elevated
            loading={isAdvancing}
            disabled={isAdvancing || needsCash(primary)}
            icon={
                primary.complete ? (
                    <HomeIcon name="tick" color={onPrimaryInk} size={18} />
                ) : (
                    // An arrow onward: the button moves the order on, whatever the step is called.
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={onPrimaryInk} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M5 12h14M13 6l6 6-6 6" />
                    </Svg>
                )
            }
            // Asks first: the footer becomes the question, and its slide is what moves the order.
            onPress={() => askToAdvance(primary)}
            accessibilityLabel={t('orderDetail.step.nextSpoken', { activity: labelFor(primary) })}
            testID="advance-activity"
        >
            {/*
              * What the button is for, then the step it moves the order to. It
              * used to read "Start: <step>", which for a step called "Started"
              * was "Start: Started"; a step's name is the organisation's own
              * and can be anything, so it is never built into a sentence.
              */}
            <YStack flexShrink={1} minWidth={0}>
                <Body tone="onPrimary" fontSize={12} lineHeight={15} fontWeight="700" letterSpacing={0.3} numberOfLines={1} testID="advance-activity-label">
                    {t(primary.complete ? 'orderDetail.step.final' : 'orderDetail.step.next')}
                </Body>
                <Body tone="onPrimary" fontSize={18} lineHeight={23} fontWeight="800" numberOfLines={1} testID="advance-activity-step">
                    {/* A step that ends the order keeps its own wording ("Mark Completed"). */}
                    {primary.complete ? t('orderDetail.advanceTo', { activity: labelFor(primary) }) : labelFor(primary)}
                </Body>
            </YStack>
        </Button>
    ) : navigate && !waitingForDispatch ? (
        <Button fullWidth height={ACTION_HEIGHT} borderRadius={ACTION_RADIUS} variant="primary" elevated icon={<HomeIcon name="navigate" color={onPrimaryInk} size={16} />} onPress={navigate.onPress} testID="navigate-to-dropoff">
            <Body tone="onPrimary" fontSize={18} lineHeight={24} fontWeight="800" numberOfLines={1}>
                {navigate.label}
            </Body>
        </Button>
    ) : null;
    /*
     * The question the footer turns into: the step by name, a slide to confirm
     * and a way out. Whatever a press used to do (proof first, the cash rule,
     * the update itself, queued without signal) happens after the slide.
     */
    const confirmFooter = confirming ? (
        <YStack gap={10} testID="advance-confirm">
            <Body fontSize={17} lineHeight={23} fontWeight="800" accessibilityRole="header" testID="advance-confirm-prompt">
                {t('orderDetail.step.confirmPrompt', { activity: labelFor(confirming) })}
            </Body>
            <SlideToConfirm
                label={t('orderDetail.step.slide')}
                accessibilityLabel={t('orderDetail.step.slideSpoken', { activity: labelFor(confirming) })}
                confirmLabel={t('orderDetail.step.confirm')}
                onConfirm={confirmAdvance}
                disabled={isAdvancing}
                testID="advance-slide"
            />
            <Button fullWidth height={48} borderRadius={14} variant="ghost" onPress={() => setConfirming(null)} testID="advance-cancel">
                {t('common.cancel')}
            </Button>
        </YStack>
    ) : null;
    const proofWanted = Boolean(primary?.require_pod);
    const proofTaken = proofWanted && !!primary && !!proofFor(order.id, primary.code);
    const hasFooter = Boolean(advanceButton || confirmFooter || queued || advanceError || proofWanted || blockedOnCash);
    const footerSpace = hasFooter ? footerHeight : Math.max(insets.bottom, space[3]);

    // What the order's flow has to say when there is no plain next step.
    const flowNotice = !flow.length ? (
        configLoading ? (
            <Skeleton height={56} testID="flow-loading" />
        ) : configFailed ? (
            <Banner tone="neutral" message={t('orderDetail.flowUnavailable')} testID="flow-unavailable" />
        ) : (
            /*
             * Config loaded, but declares no activity flow. Previously
             * this rendered nothing at all: no steps, no explanation,
             * and no advance button — the screen's whole purpose
             * vanished silently and looked like a blank area.
             */
            <Banner tone="warning" message={t('orderDetail.flowNotConfigured')} testID="flow-not-configured" />
        )
    ) : null;
    const stepNotice = ambiguous ? (
        <Banner tone="neutral" message={t('orderDetail.chooseWithDispatch')} testID="next-ambiguous" />
    ) : next || waitingForDispatch ? null : finished ? (
        // (An order waiting for dispatch says so itself, on the card.)
        <Banner tone="success" message={t('orderDetail.terminalReached')} testID="order-terminal" />
    ) : source === 'server' ? (
        // The server was asked and has no step to offer.
        <Banner tone="neutral" message={t('orderDetail.noNextActivity')} testID="no-next-activity" />
    ) : flow.length ? (
        /*
         * There is no next step and the current activity is not a
         * terminal one — which means the order's status is not in
         * its own config's flow. Saying "complete" here was how a
         * dispatched order came to be reported as finished.
         */
        <Banner tone="neutral" message={t('orderDetail.statusOffFlow', { status: labelFor({ code: order.status ?? '' }) })} testID="order-off-flow" />
    ) : null;
    // A branch the server resolved: the first choice is at the foot of the screen, the others are here.
    const otherChoices =
        !ambiguous && candidates.length > 1 ? (
            <YStack gap={8}>
                {candidates.slice(1).map((activity) => (
                    <Button
                        key={activity.code}
                        fullWidth
                        height={48}
                        borderRadius={14}
                        variant="secondary"
                        disabled={isAdvancing || needsCash(activity)}
                        // The same question as the step at the foot of the screen, there.
                        onPress={() => askToAdvance(activity)}
                        testID={`advance-activity-${activity.code}`}
                    >
                        {t('orderDetail.step.updateTo', { activity: labelFor(activity) })}
                    </Button>
                ))}
            </YStack>
        ) : null;
    /*
     * The card says where the order stands: its own status, and that status's
     * place among the steps. What comes next is said separately, under it.
     * (Both used to be the *next* step's, so an order that was only created
     * read "Now · step 2 of 5 / Dispatched".)
     */
    const nowEyebrow = statusIndex >= 0 ? t('orderDetail.now.stepOf', { step: statusIndex + 1, total: sequenced.steps.length }) : t('orderDetail.now.label');
    const nowTitle = order.status ? labelFor({ code: order.status }) : undefined;
    const nowNext = primary ? { label: t(primary.complete ? 'orderDetail.step.final' : 'orderDetail.step.next'), text: labelFor(primary) } : undefined;
    const nowWaiting = waitingForDispatch ? { title: t('orderDetail.waitingDispatch.title'), body: t('orderDetail.waitingDispatch.body') } : undefined;

    return (
        <YStack flex={1} backgroundColor="$mapBackground" onLayout={(event) => setLayoutHeight(Math.round(event.nativeEvent.layout.height))} testID="order-detail">
            <YStack position="absolute" top={0} left={0} right={0} bottom={0}>
                <OrderRouteMap
                    orderId={order.id}
                    payload={payload}
                    tracker={live}
                    activeStopId={heading?.id}
                    finished={finished}
                    /*
                     * The part of the map that can be seen: under the status bar, above the sheet at
                     * rest. The round buttons only take the top corners, and the map keeps what it
                     * frames clear of them itself; counting their whole row as covered left a strip
                     * too short to show a road in, and the view zoomed far out to fit it.
                     */
                    padding={{ top: buttonsTop, bottom: restHeight }}
                />
            </YStack>

            {/* Fixed over the map; the sheet never reaches them. */}
            <XStack position="absolute" top={buttonsTop} left={GUTTER} right={GUTTER} alignItems="flex-start" justifyContent="space-between" pointerEvents="box-none" testID="order-map-buttons">
                {onBack ? <MapButton icon="back" label={t('common.back')} onPress={onBack} testID="order-back" /> : <YStack />}
                {/* The order's shortcuts: a column, so more can join the chat here. */}
                <YStack gap={space[2]} alignItems="center" testID="order-shortcuts">
                    {openChat ? (
                        <MapButton icon="chat" label={unreadChat ? t('orderDetail.chatUnread', { count: unreadChat }) : t('orderDetail.chat')} onPress={openChat} badge={unreadChat} busy={chatOpening} testID="order-chat" />
                    ) : null}
                </YStack>
            </XStack>

            <BottomSheet
                ref={sheetRef}
                index={0}
                snapPoints={snapPoints}
                enableDynamicSizing={false}
                enablePanDownToClose={false}
                enableOverDrag={false}
                animateOnMount={false}
                onChange={(index: number) => {
                    sheetIndex.current = index < 0 ? 0 : index;
                }}
                backgroundStyle={{ backgroundColor: theme.background?.val as string, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: theme.border?.val as string }}
                handleIndicatorStyle={{ backgroundColor: theme.border?.val as string, width: 40, height: 5 }}
                handleStyle={{ paddingTop: 8, paddingBottom: 8 }}
            >
                {/* Stays put while the sections scroll under it. */}
                <YStack borderBottomWidth={1} borderColor="$border" testID="order-sheet-header">
                    <SheetHeader
                        eyebrow={eyebrow}
                        kindTestID={isBooking ? 'order-kind-job' : 'order-kind-delivery'}
                        trackingNumber={trackingNumber}
                        status={order.status}
                        qr={codes.qr}
                        qrLabel={t('orderDetail.qrOpen', { number: trackingNumber })}
                        onOpenQr={() => setQrOpen(true)}
                        // The status opens what has happened to the order.
                        onOpenStatus={openActivity}
                        adhoc={Boolean((order as Record<string, unknown>).adhoc)}
                        statusLabel={t('orderDetail.activity.statusOpen', { status: order.status ? labelFor({ code: order.status }) : '' })}
                        t={t}
                    />
                    <SectionPills items={pills} active={present[activeSection] ? activeSection : pills[0]?.key} onSelect={jumpToSection} label={t('orderDetail.tabsLabel')} />
                </YStack>

                <BottomSheetScrollView
                    ref={scrollRef}
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    // Content that fits stays still; only content taller than the sheet scrolls, and it does not bounce.
                    bounces={false}
                    alwaysBounceVertical={false}
                    overScrollMode="never"
                    keyboardShouldPersistTaps="handled"
                    onScroll={onSheetScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 12, paddingBottom: footerSpace + space[4], gap: SHEET_GAP }}
                    testID="order-sheet"
                >
                    <View onLayout={placeSection('now')} style={{ gap: SHEET_GAP }}>
                        {change ? <ChangeBanner change={change} t={t} onDismiss={() => dismissOrderChange(order.id)} onReopenNavigation={reopenNavigation} /> : null}
                        {finished && !primary ? (
                            stepNotice
                        ) : (
                            <NowCard
                                eyebrow={nowEyebrow}
                                title={nowTitle}
                                next={nowNext}
                                waiting={nowWaiting}
                                line={nowLine || undefined}
                                note={nowNote}
                                // Already at the foot of the screen when there is no step to offer; an order waiting for dispatch has no action there, so the way is offered here.
                                navigate={primary || waitingForDispatch ? navigate : undefined}
                            >
                                {otherChoices}
                                {flowNotice}
                                {stepNotice}
                            </NowCard>
                        )}
                        {/* What dispatch wrote about the whole order, in full, before anything else is read. */}
                        {orderNotes ? <NoteCard label={t('orderDetail.orderNotes')} text={orderNotes} testID="order-notes" /> : null}
                    </View>

                    {present.trip ? (
                        <View onLayout={placeSection('trip')} style={{ gap: SHEET_GAP }}>
                            <TripSection
                                points={points}
                                started={started}
                                color={colorForId(order.id)}
                                legs={legs}
                                units={units}
                                notes={tripNotes}
                                extras={tripExtras}
                                onChange={onChangeDestination && hasChoiceOfStops && !finished ? onChangeDestination : undefined}
                                t={t}
                            />
                            {cod ? (
                                <CashSection cod={cod} t={t} confirmed={cashCollected} onConfirm={finished ? undefined : confirmCash} where={dropoffIndex >= 0 ? t('orderDetail.cod.atDropoff') : undefined} />
                            ) : null}
                        </View>
                    ) : null}

                    {present.items ? (
                        <View onLayout={placeSection('items')} style={{ gap: SHEET_GAP }}>
                            {isBooking ? (
                                <BringChecklist entities={entities} t={t} />
                            ) : (
                                <Section
                                    label={[t('orderDetail.itemsHeading'), String(entities.length), totalWeight].filter(Boolean).join(' · ')}
                                    aside={
                                        <Secondary fontSize={13} lineHeight={16} fontWeight="700" numberOfLines={1}>
                                            {t('orderDetail.items.hint')}
                                        </Secondary>
                                    }
                                >
                                    <Card padded={false} testID="order-payload">
                                        {entities.map((raw, i) => {
                                            const e = raw as Record<string, unknown>;
                                            // `id` is null on every entity a live instance
                                            // returns; identity is in `internal_id`. Gating the
                                            // row on `e.id` made the item screens unreachable.
                                            const rowId = entityIdOf(e);
                                            return (
                                                <YStack key={rowId ?? i}>
                                                    {i > 0 ? <YStack height={1} backgroundColor="$border" /> : null}
                                                    <ItemRow
                                                        entity={e}
                                                        entities={entities}
                                                        t={t}
                                                        testID={`entity-${rowId ?? i}`}
                                                        // Opens the item pager over the order, at this item.
                                                        onPress={rowId ? () => setItemIndex(i) : undefined}
                                                    />
                                                </YStack>
                                            );
                                        })}
                                    </Card>
                                </Section>
                            )}
                        </View>
                    ) : null}

                    {present.people ? (
                        <View onLayout={placeSection('people')} style={{ gap: SHEET_GAP }}>
                            <ContactSection
                                contact={contact}
                                t={t}
                                onCall={contact?.phone ? () => void openUrl(`tel:${contact.phone.replace(/\s+/g, '')}`).catch(() => undefined) : undefined}
                                onMessageCustomer={messageCustomer}
                                onEmail={contact?.email ? () => void openUrl(`mailto:${contact.email}`).catch(() => undefined) : undefined}
                                unread={threads.customer && onOpenChannel ? unreadCustomer : undefined}
                            />
                            <DropoffContactSection
                                contact={dropoffContact}
                                t={t}
                                onCall={dropoffContact?.phone ? () => void openUrl(`tel:${dropoffContact.phone?.replace(/\s+/g, '')}`).catch(() => undefined) : undefined}
                                onMessage={dropoffContact?.phone ? () => void openUrl(`sms:${dropoffContact.phone}`).catch(() => undefined) : undefined}
                            />
                            <Facilitator order={order} t={t} openUrl={openUrl} />
                            <ProofSection rows={proofRows} t={t} />
                        </View>
                    ) : null}

                    <View onLayout={placeSection('files')} style={{ gap: SHEET_GAP }}>
                        <CapturedProofs orderId={order.id} reloadToken={reloadToken + revision} t={t} openUrl={openUrl} />
                        <Files order={order} t={t} openUrl={openUrl} />
                        <Comments orderId={order.id} reloadToken={reloadToken + revision} t={t} />
                    </View>

                    <View onLayout={placeSection('activity')} style={{ gap: SHEET_GAP }}>
                        <ActivitySection steps={activitySteps} onSeeAll={openActivity} t={t} />
                    </View>

                    <View onLayout={placeSection('info')} style={{ gap: SHEET_GAP }}>
                        <OrderReference order={order} config={config} t={t} />
                        {onReportIssue ? <ReportIssueButton label={t('orderDetail.reportIssue')} onPress={() => onReportIssue({ id: order.id, label: trackingNumber })} /> : null}
                    </View>
                </BottomSheetScrollView>
            </BottomSheet>

            {/*
              * Anchored at the foot of the screen, over the sheet's last rows.
              * What stands between the driver and the next step is said right
              * above the button it concerns.
              */}
            {hasFooter ? (
                <YStack
                    position="absolute"
                    left={0}
                    right={0}
                    bottom={0}
                    paddingHorizontal={GUTTER}
                    paddingTop={12}
                    paddingBottom={Math.max(insets.bottom, 12)}
                    gap={8}
                    borderTopWidth={1}
                    borderColor="$border"
                    backgroundColor="$background"
                    onLayout={(event) => setFooterHeight(Math.round(event.nativeEvent.layout.height))}
                    testID="order-actions"
                >
                    {proofWanted && !proofTaken ? <ProofRequiredHint label={t('orderDetail.proofRequired')} testID="proof-required" /> : null}
                    {proofTaken ? <Banner tone="success" message={t('orderDetail.proofCaptured')} testID="proof-captured" /> : null}
                    {blockedOnCash ? <Banner tone="warning" message={t('orderDetail.cod.confirmFirst')} testID="cod-confirm-first" /> : null}
                    {queued ? <Banner tone="neutral" message={t('orderDetail.queuedOffline')} testID="advance-queued" /> : null}
                    {advanceError ? <ErrorState title={t('orderDetail.updateFailed')} body={advanceError} testID="advance-error" /> : null}
                    {confirmFooter ?? advanceButton}
                </YStack>
            ) : null}

            <ActivitySheet visible={activityOpen} onClose={() => setActivityOpen(false)} events={timeline} isLoading={timelineLoading} failed={timelineFailed} number={trackingNumber} t={t} bottomInset={insets.bottom} />
            <ItemPagerModal
                visible={itemIndex !== null}
                onClose={() => setItemIndex(null)}
                orderId={order.id}
                entities={entities}
                stops={orderStops(payload)}
                initialIndex={itemIndex ?? 0}
                // Said under "Not scanned" only when the order's next step asks for a scan.
                scanNeed={primary?.require_pod && proofMethodOf(primary.pod_method) === 'scan' ? labelFor(primary) : undefined}
                openUrl={openUrl}
            />
            <QrSheet visible={qrOpen} onClose={() => setQrOpen(false)} qr={codes.qr} number={codes.number ?? trackingNumber} title={t('orderDetail.details.codesTitle')} closeLabel={t('common.close')} bottomInset={insets.bottom} />
        </YStack>
    );
}

export default OrderDetailScreen;

/**
 * The order on a map, as the screen's background. Stops come from the tracker when it has loaded (it knows
 * which are done), otherwise from the order itself, so the map does not wait on it.
 */
function OrderRouteMap({
    orderId,
    payload,
    tracker,
    activeStopId,
    finished,
    padding,
}: {
    orderId?: string;
    payload: ReturnType<typeof payloadOf>;
    tracker?: TrackerRecord | null;
    /** The place being headed to, as the order names it (`payload.current_waypoint`): a place id. */
    activeStopId?: string;
    finished?: boolean;
    padding?: { top?: number; bottom?: number };
}) {
    const scheme = useResolvedScheme();
    const position = useDeviceLocation();
    const route = useMemo(() => decodePolyline(tracker?.route?.polyline), [tracker?.route?.polyline]);

    const stops = useMemo<OrderMapStop[]>(() => {
        // A waypoint between the ends is numbered among the order's waypoints, as the console numbers it.
        let waypointNumber = 0;
        const numbered = (type: unknown) => (type === 'waypoint' ? { number: ++waypointNumber } : {});
        const tracked = (tracker?.stops ?? []).flatMap((stop, index) => {
            const role = numbered(stop.type);
            const point = coordsOfPoint(stop.location);
            return point
                ? [{ id: stop.public_id ?? stop.uuid ?? String(index), point, sequence: stop.sequence ?? index + 1, kind: markerKindOf(stop.type), ...role, name: placeLines({ name: stop.name, address: stop.address }).title, done: !!stop.completed }]
                : [];
        });
        if (tracked.length) return tracked;
        waypointNumber = 0;
        return orderStops(payload).flatMap((stop, index) => {
            const role = numbered(stop.type);
            const point = coordsOfPoint(stop.location);
            return point ? [{ id: stop.id ?? String(index), point, sequence: index + 1, kind: markerKindOf(stop.type), ...role, name: placeLines({ name: stop.name, address: stop.address }).title }] : [];
        });
    }, [tracker?.stops, payload]);

    return (
        <OrderMap
            stops={stops}
            route={route}
            routeColor={orderId ? colorForId(orderId) : undefined}
            activeStopId={tracker?.active_stop?.public_id ?? activeStopId}
            position={position}
            dark={scheme !== 'light' && scheme !== 'sunlight'}
            fill
            padding={padding}
            overview={finished}
        />
    );
}
