/**
 * Order — design round 3 (Order.dc.html, OrderDetails.dc.html).
 *
 * Two tabs over one order. **Overview** is the working surface: the map, the
 * tracking number, how far and how long, the waypoints, cash to collect, the
 * payload, the customer, the notes and the order's steps. **Details** is the
 * reference: identifiers, codes, dates, type, facilitator, rate, files,
 * comments, metadata and the full timeline (see orderDetail/OrderDetails).
 *
 * The bar at the bottom is the same on both tabs and holds the two things a
 * driver does with an order: navigate to where it is going, and move it on to
 * its next step. Whichever fits the moment leads — the step before the order
 * has started, the navigation once it is under way.
 *
 * The steps come from `order-configs` and vary per organisation, so nothing
 * here assumes a fixed flow (see ui/ActivityStepper). The advance is a
 * mutation, so it goes through the adapter and queues when offline — a driver
 * marking "arrived" in a basement keeps the progress and the app says so
 * rather than failing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, View } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack, useTheme } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Secondary } from '../ui/Text';
import { Button } from '../ui/Button';
import { Banner, ErrorState, Skeleton } from '../ui/Banner';
import { ActivityStepper, ProofRequiredHint, nextActivity, sequenceFlow, unresolvedLogic, type FlowActivity } from '../ui/ActivityStepper';
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
    currentDestination,
    orderStops,
    stopLabel,
    orderStore,
    displayIdOf,
    entityIdOf,
    entityNameOf,
    entityTrackingNumberOf,
    orderConfigIdOf,
    payloadOf,
    isFinishedStatus,
    cashOnDeliveryOf,
    customerContactOf,
    deliveryInstructionsOf,
    scheduleWindowOf,
    isBookingOrder,
    orderThreadsOf,
    proofFor,
    takeAutoAdvance,
    clearProof,
    type ChatChannelRecord,
    type RemovalReason,
    type TrackerRecord,
    type TrackingStatusEvent,
    decodePolyline,
    coordsOfPoint,
} from '../data';
import { useFleetbase, isQueuedAck } from '../api';
import { useSettings, useResolvedScheme } from '../settings';
import { useDeviceLocation } from '../shell';
import { OrderMap, type OrderMapStop } from '../ui/OrderMap';
import { markerKindOf } from '../ui/RouteMap';
import { colorForId } from '../ui/routeColors';
import { formatClock, formatDateTime } from '../format';
import { dayKey } from '../data/orderStore';
import { fromGeoPoint, type Destination } from '../navigate/handoff';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useLiveRefresh, useOrderChannel, useOrderChange, dismissOrderChange, changesDropoff } from '../realtime';
import {
    BringChecklist,
    CashSection,
    ChangeBanner,
    ContactSection,
    EtaStrip,
    EventRows,
    HandoverSection,
    ItemRow,
    OrderIdentity,
    SectionLink,
    WaypointsSection,
} from './orderDetail/OrderSections';
import { OrderDetails } from './orderDetail/OrderDetails';
import { Card, Glyph, GUTTER, ModeSwitch, Section } from './jobs/parts';
import { isOrderStarted, orderPoints, orderTypeLabel } from './jobs/model';

type OrderTab = 'overview' | 'details';

/** The two actions at the foot of the screen share one footprint. */
const ACTION_HEIGHT = 60;
const ACTION_RADIUS = 16;

/** What the advance posts: the server's activity object when it gave one, else the code. */
type Advanceable = FlowActivity & { _resolved_status?: string | null };

export function OrderDetailScreen({
    orderId,
    reloadToken = 0,
    onOpenEntity,
    onOpenTimeline,
    onNavigate,
    onCaptureProof,
    onChangeDestination,
    onRemoved,
    onOpenChannel,
    onMessageDispatch,
    openUrl = (url: string) => Linking.openURL(url),
}: {
    orderId: string;
    /** Bumped on screen focus: the order, tracker and next step are asked again. */
    reloadToken?: number;
    /** Opens item detail (R2 D4); the row's copy is passed so it paints instantly. */
    onOpenEntity?: (entity: { id: string; name?: string; entity: Record<string, unknown> }) => void;
    /** Opens the full activity history (R2 D5). */
    onOpenTimeline?: () => void;
    /** Opens the navigation hand-off for the current destination (R2 D6). */
    onNavigate?: (destination: Destination) => void;
    /** Opens the stop picker, when the order has more than one stop. */
    onChangeDestination?: () => void;
    /** Opens proof capture for an activity whose config demands it. */
    onCaptureProof?: (request: { orderId: string; activityCode: string; activityLabel: string; podMethod?: string | null; expected?: string[] }) => void;
    /** The order was taken off this driver; the host leaves the screen. */
    onRemoved?: (reason: RemovalReason) => void;
    /** Opens an order-linked chat thread. */
    onOpenChannel?: (channel: ChatChannelRecord) => void;
    /** Starts a conversation with dispatch when the order has no thread of its own. */
    onMessageDispatch?: () => void;
    /** Injected in tests; defaults to Linking. */
    openUrl?: (url: string) => Promise<unknown>;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();
    const { adapter } = useFleetbase();
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const [tab, setTab] = useState<OrderTab>('overview');
    /*
     * The comment field on Details sits low on the page. KeyboardAvoidingView
     * pads by how far the keyboard overlaps its own frame, but reads that frame
     * relative to its parent, and this screen starts below the status bar and
     * the title bar — the offset is that distance (as in ConversationScreen).
     */
    const frameRef = useRef<View>(null);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const measureFrame = useCallback(() => {
        frameRef.current?.measureInWindow((_x, y) => {
            if (Number.isFinite(y)) setKeyboardOffset(y);
        });
    }, []);

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
    const candidates = useMemo<Advanceable[]>(() => {
        if (source === 'server' && serverNext) return serverNext;
        const local = nextActivity(flow, order?.status);
        return local ? [local] : [];
    }, [source, serverNext, flow, order?.status]);
    const next = candidates[0];
    // The config's `complete` flag, not a list of names: a booking flow may end anywhere.
    const finished = useMemo(() => isFinishedStatus(order?.status, flow), [flow, order?.status]);
    const ambiguous = useMemo(() => source !== 'server' && unresolvedLogic(flow, order?.status), [source, flow, order?.status]);

    const payload = payloadOf(order);
    const entities = useMemo(() => payload.entities ?? [], [payload.entities]);
    const cod = cashOnDeliveryOf(order);
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

    const { channels } = useChatChannels(0, { enabled: !!onOpenChannel });
    const threads = useMemo(() => orderThreadsOf(channels, order?.id), [channels, order?.id]);

    if (!order) {
        if (removal) {
            return (
                <YStack flex={1} backgroundColor="$background" padding={space[4]} testID="order-detail-removed">
                    <Banner tone="warning" message={t('orderDetail.reassigned')} />
                </YStack>
            );
        }
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="order-detail-loading">
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
    const headingPoint =
        fromGeoPoint(heading?.location, stopLabel(heading)) ??
        fromGeoPoint((payload.dropoff as { location?: { coordinates?: number[] } } | undefined)?.location, payload.dropoff?.name ?? payload.dropoff?.address);
    /*
     * `order.tracker_data` comes back null on this API, so the ETA and distance
     * it fed never rendered — a quiet dead path. The live tracker endpoint is
     * where those numbers actually are, and it is already loaded above.
     */
    const liveEta = live?.eta?.active_stop_seconds;
    // Time to the place being headed to, not to the whole order finishing.
    const etaSeconds = liveEta ?? live?.eta?.start_seconds;
    const schedule = scheduleWindowOf(order);
    const headingWindowEnd = points.find((p) => !!p.id && p.id === heading?.id)?.windowEnd;

    const isBooking = isBookingOrder(order);
    const contact = customerContactOf(order);
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
    const messageDispatch = threads.dispatch && onOpenChannel ? () => onOpenChannel(threads.dispatch as ChatChannelRecord) : onMessageDispatch;
    const blockedOnCash = needsCash(next);

    // "Pharmacy cold-chain · scheduled 14:00" — what it is, and when it is due.
    const scheduledAt = typeof order.scheduled_at === 'string' ? order.scheduled_at : undefined;
    const typeLine = [
        isBooking ? undefined : orderTypeLabel(order),
        scheduledAt && !isBooking ? t('orderDetail.scheduledFor', { time: dayKey(scheduledAt) === dayKey() ? formatClock(scheduledAt) : formatDateTime(scheduledAt) }) : undefined,
    ]
        .filter(Boolean)
        .join(' · ');

    // Newest first, and only the last few: the whole history is on Details.
    const history = [...((order.tracking_statuses as TrackingStatusEvent[] | undefined) ?? [])].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));

    const sequenced = sequenceFlow(flow);
    const stepIndex = sequenced.ordered ? sequenced.steps.findIndex((a) => a.code === order.status) : -1;

    const primary = !ambiguous ? next : undefined;
    const canNavigate = Boolean(onNavigate && headingPoint && !finished);
    // Under way, the road comes first; before that, the step that starts the order does.
    const navigateLeads = canNavigate && (!primary || (started && points.some((p) => p.state === 'current')));
    const tabs = [
        { value: 'overview' as const, label: t('orderDetail.tabOverview') },
        { value: 'details' as const, label: t('orderDetail.tabDetails') },
    ];

    const navigateButton = canNavigate ? (
        <Button
            key="navigate"
            flex={navigateLeads ? 1.4 : 1}
            height={ACTION_HEIGHT}
            borderRadius={ACTION_RADIUS}
            variant={navigateLeads ? 'primary' : 'secondary'}
            icon={<Glyph name="navigate" size={18} color={(navigateLeads ? theme.onPrimary?.val : theme.textPrimary?.val) as string} />}
            onPress={() => headingPoint && onNavigate?.(headingPoint)}
            testID="navigate-to-dropoff"
        >
            {t('orderDetail.navigate')}
        </Button>
    ) : null;
    const advanceButton = primary ? (
        <Button
            key="advance"
            flex={navigateLeads ? 1 : 1.4}
            height={ACTION_HEIGHT}
            borderRadius={ACTION_RADIUS}
            variant={navigateLeads ? 'secondary' : 'primary'}
            elevated={!navigateLeads}
            loading={isAdvancing}
            disabled={isAdvancing || needsCash(primary)}
            onPress={() => void advance(primary)}
            testID="advance-activity"
        >
            {t('orderDetail.advanceTo', { activity: labelFor(primary) })}
        </Button>
    ) : null;

    return (
        <View ref={frameRef} onLayout={measureFrame} style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
        <YStack flex={1} backgroundColor="$background">
            <YStack paddingHorizontal={GUTTER} paddingTop={4} paddingBottom={12}>
                <ModeSwitch options={tabs} value={tab} onChange={setTab} stretch label={t('orderDetail.tabsLabel')} testID="order-tabs" />
            </YStack>

            <ScrollView style={screen} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24, gap: tab === 'overview' ? 18 : 20 }} keyboardShouldPersistTaps="handled" testID="order-detail">
                {change ? (
                    <ChangeBanner change={change} t={t} onDismiss={() => dismissOrderChange(order.id)} onReopenNavigation={reopenNavigation} />
                ) : null}

                {tab === 'details' ? (
                    <OrderDetails order={order} config={config} reloadToken={reloadToken + revision} onOpenTimeline={onOpenTimeline} openUrl={openUrl} />
                ) : (
                    <>
                        <OrderRouteMap orderId={order.id} payload={payload} tracker={live} activeStopId={heading?.id} />

                        {/* The identifier leads, in full, on its own line. */}
                        <OrderIdentity
                            label={isBooking ? t('orderDetail.booking.jobLabel') : t('orderDetail.trackingNumberLabel')}
                            kindTestID={isBooking ? 'order-kind-job' : 'order-kind-delivery'}
                            trackingNumber={displayIdOf(order)}
                            internalId={typeof order.internal_id === 'string' ? order.internal_id : undefined}
                            publicId={order.id}
                            status={order.status}
                            typeLine={typeLine || undefined}
                            t={t}
                        />

                        {finished ? null : (
                            <EtaStrip
                                etaSeconds={etaSeconds}
                                etaKind={liveEta == null ? 'start' : 'live'}
                                distanceM={live?.progress?.remaining_distance_m}
                                deliverBy={schedule?.end ?? headingWindowEnd}
                                stale={Boolean(live?.insights?.is_location_stale)}
                                units={units}
                                t={t}
                            />
                        )}

                        <WaypointsSection points={points} started={started} onChange={onChangeDestination && hasChoiceOfStops && !finished ? onChangeDestination : undefined} t={t} />

                        {cod ? <CashSection cod={cod} t={t} confirmed={cashCollected} onConfirm={finished ? undefined : () => setCashCollected(true)} /> : null}

                        {isBooking ? (
                            <BringChecklist entities={entities} t={t} />
                        ) : entities.length ? (
                            <Section
                                label={`${t('orderDetail.payloadHeading')} · ${t('orderDetail.payloadCount', { count: entities.length })}`}
                                aside={
                                    onOpenEntity ? (
                                        <Secondary fontSize={13} fontWeight="700" numberOfLines={1}>
                                            {t('orderDetail.payloadHint')}
                                        </Secondary>
                                    ) : undefined
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
                                                    onPress={onOpenEntity && rowId ? () => onOpenEntity({ id: rowId, name: entityNameOf(e), entity: e }) : undefined}
                                                />
                                            </YStack>
                                        );
                                    })}
                                </Card>
                            </Section>
                        ) : null}

                        <ContactSection
                            contact={contact}
                            t={t}
                            onCall={contact?.phone ? () => void openUrl(`tel:${contact.phone}`).catch(() => undefined) : undefined}
                            onMessageCustomer={messageCustomer}
                            onMessageDispatch={messageDispatch}
                        />

                        <HandoverSection
                            window={schedule}
                            isBooking={isBooking}
                            instructions={deliveryInstructionsOf(order)}
                            notes={typeof order.notes === 'string' && order.notes.trim() ? order.notes : undefined}
                            t={t}
                        />

                        {history.length ? (
                            <Section
                                label={t('orderDetail.historyHeading')}
                                aside={onOpenTimeline ? <SectionLink label={t('orderDetail.fullTimeline')} onPress={onOpenTimeline} testID="open-timeline" /> : undefined}
                            >
                                <Card testID="order-history">
                                    <EventRows events={history.slice(0, 3)} t={t} />
                                </Card>
                            </Section>
                        ) : null}

                        {/* Progress through the order's own steps. Config-driven, any length. */}
                        <Section
                            label={
                                stepIndex >= 0
                                    ? t('orderDetail.stepsHeadingOf', { step: stepIndex + 1, total: sequenced.steps.length })
                                    : t('orderDetail.stepsHeading')
                            }
                        >
                            <YStack gap={12}>
                                {flow.length ? (
                                    <ActivityStepper flow={flow} currentCode={order.status} labelFor={labelFor} testID="order-stepper" />
                                ) : configLoading ? (
                                    <Skeleton height={56} testID="flow-loading" />
                                ) : configFailed ? (
                                    <Banner tone="neutral" message={t('orderDetail.flowUnavailable')} testID="flow-unavailable" />
                                ) : (
                                    /*
                                     * Config loaded, but declares no activity flow. Previously
                                     * this rendered nothing at all: no stepper, no explanation,
                                     * and no advance button — the screen's whole purpose
                                     * vanished silently and looked like a blank area.
                                     */
                                    <Banner tone="warning" message={t('orderDetail.flowNotConfigured')} testID="flow-not-configured" />
                                )}

                                {primary ? (
                                    <Secondary fontSize={14}>
                                        {t('orderDetail.nextStep')}{' '}
                                        <Body fontSize={14} fontWeight="700">
                                            {labelFor(primary)}
                                        </Body>
                                    </Secondary>
                                ) : null}

                                {/* A branch the server resolved: the first choice is in the bar below, the others are here. */}
                                {!ambiguous && candidates.length > 1 ? (
                                    <YStack gap={8}>
                                        {candidates.slice(1).map((activity) => (
                                            <Button
                                                key={activity.code}
                                                fullWidth
                                                height={48}
                                                borderRadius={14}
                                                variant="secondary"
                                                disabled={isAdvancing || needsCash(activity)}
                                                onPress={() => void advance(activity)}
                                                testID={`advance-activity-${activity.code}`}
                                            >
                                                {t('orderDetail.advanceTo', { activity: labelFor(activity) })}
                                            </Button>
                                        ))}
                                    </YStack>
                                ) : null}

                                {ambiguous ? (
                                    <Banner tone="neutral" message={t('orderDetail.chooseWithDispatch')} testID="next-ambiguous" />
                                ) : next ? null : finished ? (
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
                                ) : null}
                            </YStack>
                        </Section>
                    </>
                )}
            </ScrollView>

            {/*
              * What stands between the driver and the next step is said right
              * above the button it concerns, on either tab.
              */}
            {navigateButton || advanceButton || queued || advanceError ? (
                <YStack paddingHorizontal={GUTTER} paddingTop={12} paddingBottom={Math.max(insets.bottom, 12)} gap={8} borderTopWidth={1} borderColor="$border" backgroundColor="$background" testID="order-actions">
                    {primary?.require_pod && !proofFor(order.id, primary.code) ? <ProofRequiredHint label={t('orderDetail.proofRequired')} testID="proof-required" /> : null}
                    {primary?.require_pod && proofFor(order.id, primary.code) ? <Banner tone="success" message={t('orderDetail.proofCaptured')} testID="proof-captured" /> : null}
                    {blockedOnCash ? <Banner tone="warning" message={t('orderDetail.cod.confirmFirst')} testID="cod-confirm-first" /> : null}
                    {queued ? <Banner tone="neutral" message={t('orderDetail.queuedOffline')} testID="advance-queued" /> : null}
                    {advanceError ? <ErrorState title={t('orderDetail.updateFailed')} body={advanceError} testID="advance-error" /> : null}
                    {navigateButton || advanceButton ? <XStack gap={8}>{navigateLeads ? [navigateButton, advanceButton] : [advanceButton, navigateButton]}</XStack> : null}
                </YStack>
            ) : null}
        </YStack>
        </KeyboardAvoidingView>
        </View>
    );
}

export default OrderDetailScreen;

/**
 * The order on a map. Stops come from the tracker when it has loaded (it knows
 * which are done), otherwise from the order itself, so the map does not wait on it.
 */
function OrderRouteMap({ orderId, payload, tracker, activeStopId }: { orderId?: string; payload: ReturnType<typeof payloadOf>; tracker?: TrackerRecord | null; activeStopId?: string }) {
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
                ? [{ id: stop.public_id ?? stop.uuid ?? String(index), point, sequence: stop.sequence ?? index + 1, kind: markerKindOf(stop.type), ...role, name: stop.name ?? stop.address, done: !!stop.completed }]
                : [];
        });
        if (tracked.length) return tracked;
        waypointNumber = 0;
        return orderStops(payload).flatMap((stop, index) => {
            const role = numbered(stop.type);
            const point = coordsOfPoint(stop.location);
            return point ? [{ id: stop.id ?? String(index), point, sequence: index + 1, kind: markerKindOf(stop.type), ...role, name: stop.name ?? stop.address }] : [];
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
        />
    );
}
