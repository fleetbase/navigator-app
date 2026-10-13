/**
 * Order detail — R1 frame s06, with correction 1 applied.
 *
 * The frame draws a fixed four-step stepper; the real flow comes from
 * `order-configs` and varies per organisation, so the stepper here renders
 * whatever length the config declares (see ui/ActivityStepper).
 *
 * The activity advance is a mutation, so it goes through the adapter and
 * queues when offline — a driver marking "arrived" in a basement keeps the
 * progress and the app says so rather than failing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, HeroValue, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, ErrorState, Skeleton } from '../ui/Banner';
import { ActivityStepper, ProofRequiredHint, nextActivity, unresolvedLogic, type FlowActivity } from '../ui/ActivityStepper';
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
} from '../data';
import { useFleetbase, isQueuedAck } from '../api';
import { useSettings } from '../settings';
import { formatClock, formatMeters } from '../format';
import { fromGeoPoint, type Destination } from '../navigate/handoff';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useLiveRefresh, useOrderChannel, useOrderChange, dismissOrderChange, changesDropoff } from '../realtime';
import { BringChecklist, CashSection, ChangeBanner, ContactSection, HandoverSection, ItemRow } from './orderDetail/OrderSections';

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
    const { flow, isLoading: configLoading, failed: configFailed } = useOrderConfig(configId);
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
    /*
     * A stop with neither name nor address would otherwise take the whole card
     * down with it — including the way to change destination. Fall through to
     * anything on the order that can be named.
     */
    const destination = stopLabel(heading) ?? orderStops(payload).map(stopLabel).find(Boolean);
    /*
     * Counting waypoints alone was wrong, and the device said so: a plain
     * pickup → drop-off order carries no `waypoints` at all, so the button
     * vanished from the very order that has two places to be. Pickup and
     * drop-off are stops; the waypoint list is what an order adds *between*
     * them.
     */
    const hasChoiceOfStops = orderStops(payload).length > 1;
    /*
     * Where Navigate goes: the stop being headed to, from the order as it is
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
     * this fed never rendered — a quiet dead path. The live tracker endpoint is
     * where those numbers actually are, and it is already loaded above for the
     * current stop.
     */
    const tracker = {
        // Time to the stop being headed to, not to the whole order finishing.
        eta_seconds: live?.eta?.active_stop_seconds ?? live?.eta?.start_seconds,
        distance_m: live?.progress?.remaining_distance_m ?? undefined,
    };

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

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="order-detail">
            {change ? (
                <ChangeBanner change={change} t={t} onDismiss={() => dismissOrderChange(order.id)} onReopenNavigation={reopenNavigation} />
            ) : null}

            {/* The identifier leads, in full, on its own line. */}
            <Surface hero padded>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Caption testID={isBooking ? 'order-kind-job' : 'order-kind-delivery'}>
                            {isBooking ? t('orderDetail.booking.jobLabel') : t('orderDetail.trackingNumberLabel')}
                        </Caption>
                        <StatusPill status={order.status} t={(k, fb) => t(k, { defaultValue: fb })} />
                    </XStack>
                    <Identifier value={displayIdOf(order)} boxed={false} />
                    <Micro>
                        {order.dispatched_at
                            ? t('orderDetail.createdDispatched', {
                                  created: formatClock(order.created_at),
                                  dispatched: formatClock(order.dispatched_at),
                              })
                            : t('orderDetail.created', { created: formatClock(order.created_at) })}
                    </Micro>
                </YStack>
            </Surface>

            {tracker?.eta_seconds || tracker?.distance_m ? (
                <XStack gap={space[4]}>
                    {tracker?.eta_seconds ? (
                        <YStack flex={1}>
                            <HeroValue fontSize={34}>{formatClock(new Date(Date.now() + tracker.eta_seconds * 1000).toISOString())}</HeroValue>
                            <Caption>{t('orderDetail.etaLabel')}</Caption>
                        </YStack>
                    ) : null}
                    {tracker?.distance_m ? (
                        <YStack flex={1}>
                            <HeroValue fontSize={34}>{formatMeters(tracker.distance_m, units)}</HeroValue>
                            <Caption>{t('orderDetail.remainingLabel')}</Caption>
                        </YStack>
                    ) : null}
                </XStack>
            ) : null}

            {destination ? (
                <Surface padded="compact">
                    <XStack justifyContent="space-between" alignItems="center" gap={space[3]}>
                        <YStack flex={1} gap={2}>
                            <Caption>{t('orderDetail.currentDestination')}</Caption>
                            <Body fontWeight="700">{destination}</Body>
                        </YStack>
                        <XStack gap={space[2]} alignItems="center">
                            {/*
                              * Only offered on an order with somewhere else to
                              * go. A single-stop order presents no choice, and
                              * a button that opens a list of one is a button
                              * that wasted the driver's tap.
                              */}
                            {onChangeDestination && hasChoiceOfStops ? (
                                <Button variant="ghost" onPress={onChangeDestination} testID="change-destination">
                                    {t('orderDetail.changeDestination')}
                                </Button>
                            ) : null}
                            {/* Only offered when there is a real point to send. */}
                            {onNavigate && headingPoint ? (
                                <Button variant="secondary" onPress={() => onNavigate(headingPoint)} testID="navigate-to-dropoff">
                                    {t('orderDetail.navigate')}
                                </Button>
                            ) : null}
                        </XStack>
                    </XStack>
                </Surface>
            ) : null}

            {cod ? <CashSection cod={cod} t={t} confirmed={cashCollected} onConfirm={finished ? undefined : () => setCashCollected(true)} /> : null}

            {isBooking ? (
                <BringChecklist entities={entities} t={t} />
            ) : (
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="baseline">
                        <Heading fontSize={17}>{t('orderDetail.payloadHeading')}</Heading>
                        <Micro>{t('orderDetail.payloadCount', { count: entities.length })}</Micro>
                    </XStack>
                    <Surface>
                        {entities.length ? (
                            entities.map((raw, i) => {
                                const e = raw as Record<string, unknown>;
                                // `id` is null on every entity a live instance
                                // returns; identity is in `internal_id`. Gating the
                                // row on `e.id` made the item screens unreachable.
                                const rowId = entityIdOf(e);
                                return (
                                    <YStack key={rowId ?? i}>
                                        {i > 0 ? <Divider /> : null}
                                        <ItemRow
                                            entity={e}
                                            entities={entities}
                                            t={t}
                                            testID={`entity-${rowId ?? i}`}
                                            onPress={onOpenEntity && rowId ? () => onOpenEntity({ id: rowId, name: entityNameOf(e), entity: e }) : undefined}
                                        />
                                    </YStack>
                                );
                            })
                        ) : (
                            <YStack padding={space[3]}>
                                {/* Not the count again — the heading already says 0. */}
                                <Secondary>{t('orderDetail.payloadEmpty')}</Secondary>
                            </YStack>
                        )}
                    </Surface>
                </YStack>
            )}

            <HandoverSection
                window={scheduleWindowOf(order)}
                isBooking={isBooking}
                instructions={deliveryInstructionsOf(order)}
                notes={typeof order.notes === 'string' ? order.notes : undefined}
                t={t}
            />

            <ContactSection
                contact={contact}
                t={t}
                onCall={contact?.phone ? () => void openUrl(`tel:${contact.phone}`).catch(() => undefined) : undefined}
                onMessageCustomer={messageCustomer}
                onMessageDispatch={messageDispatch}
            />

            {onOpenTimeline ? (
                <Button variant="ghost" onPress={onOpenTimeline} testID="open-timeline">
                    {t('orderTimeline.viewTimeline')}
                </Button>
            ) : null}

            {/* Progress + the one action. Config-driven, any length. */}
            <YStack gap={space[3]}>
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

                {next?.require_pod && !proofFor(order.id, next.code) ? <ProofRequiredHint label={t('orderDetail.proofRequired')} testID="proof-required" /> : null}
                {next?.require_pod && proofFor(order.id, next.code) ? (
                    <Banner tone="success" message={t('orderDetail.proofCaptured')} testID="proof-captured" />
                ) : null}
                {blockedOnCash ? <Banner tone="warning" message={t('orderDetail.cod.confirmFirst')} testID="cod-confirm-first" /> : null}

                {queued ? <Banner tone="neutral" message={t('orderDetail.queuedOffline')} testID="advance-queued" /> : null}
                {advanceError ? (
                    <ErrorState title={t('orderDetail.updateFailed')} body={advanceError} testID="advance-error" />
                ) : null}

                {ambiguous ? (
                    <Banner tone="neutral" message={t('orderDetail.chooseWithDispatch')} testID="next-ambiguous" />
                ) : next ? (
                    <YStack gap={space[2]}>
                        {candidates.map((activity, i) => (
                            <Button
                                key={activity.code}
                                fullWidth
                                elevated={i === 0}
                                variant={i === 0 ? 'primary' : 'secondary'}
                                loading={isAdvancing && i === 0}
                                disabled={isAdvancing || needsCash(activity)}
                                onPress={() => void advance(activity)}
                                testID={i === 0 ? 'advance-activity' : `advance-activity-${activity.code}`}
                            >
                                {t('orderDetail.advanceTo', { activity: labelFor(activity) })}
                            </Button>
                        ))}
                    </YStack>
                ) : finished ? (
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
        </ScrollView>
    );
}

export default OrderDetailScreen;
