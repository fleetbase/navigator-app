/**
 * The order-detail sections the order-operations contract added.
 *
 * Kept out of OrderDetailScreen so that screen stays about the flow (where the
 * order is, what the driver does next) and these stay about the *content* a
 * driver needs at the door: how many of what, what to collect, how to hand it
 * over, when they are expected, and who to call.
 */
import { useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../../ui/Text';
import { Identifier } from '../../ui/Identifier';
import { StatusPill } from '../../ui/StatusPill';
import { Surface } from '../../ui/Surface';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { radius, space } from '../../theme/tokens';
import { describeStatus } from '../../theme/status';
import { formatClock, formatDateTime, formatMeters, formatMoney } from '../../format';
import { Card, Glyph, IconButton, Initials, Section, SectionLabel, WaypointMark } from '../jobs/parts';
import type { OrderPoint } from '../jobs/model';
import {
    entityIdOf,
    entityNameOf,
    entityTrackingNumberOf,
    entityQuantityOf,
    entityNoteOf,
    entityUnavailableOf,
    entitySubstituteForOf,
    findEntity,
    type CashOnDelivery,
    type ContactPerson,
    type TimeWindow,
    type TrackingStatusEvent,
} from '../../data';
import type { OrderChange } from '../../realtime';

type T = (key: string, options?: Record<string, unknown>) => string;

/* -- "This order changed". ------------------------------------------------ */

export function ChangeBanner({
    change,
    t,
    onDismiss,
    onReopenNavigation,
}: {
    change: OrderChange;
    t: T;
    onDismiss: () => void;
    /** Present when the drop-off moved and there is somewhere to navigate to. */
    onReopenNavigation?: () => void;
}) {
    return (
        <Surface padded="compact" borderColor="$warningBorder" backgroundColor="$warningFill" testID="order-changed">
            <YStack gap={space[2]}>
                <Caption tone="warning">{t('orderDetail.changed.title')}</Caption>
                <Body fontWeight="700" testID="order-changed-summary">
                    {change.summary ?? t('orderDetail.changed.noSummary')}
                </Body>
                {change.changedBy ? <Micro>{t('orderDetail.changed.by', { who: change.changedBy })}</Micro> : null}
                <XStack gap={space[2]}>
                    {onReopenNavigation ? (
                        <Button flex={2} onPress={onReopenNavigation} testID="order-changed-reopen-navigation">
                            {t('orderDetail.changed.reopenNavigation')}
                        </Button>
                    ) : null}
                    <Button flex={1} variant="ghost" onPress={onDismiss} testID="order-changed-dismiss">
                        {t('orderDetail.changed.dismiss')}
                    </Button>
                </XStack>
            </YStack>
        </Surface>
    );
}

/* -- Items. ---------------------------------------------------------------- */

export function ItemRow({
    entity,
    entities,
    t,
    onPress,
    testID,
}: {
    entity: Record<string, unknown>;
    entities: unknown[];
    t: T;
    onPress?: () => void;
    testID?: string;
}) {
    const quantity = entityQuantityOf(entity);
    const note = entityNoteOf(entity);
    const unavailable = entityUnavailableOf(entity);
    const substituteFor = entitySubstituteForOf(entity);
    const replaced = findEntity(entities, substituteFor);
    const code = entityTrackingNumberOf(entity);
    const name = String(entity.name ?? entityNameOf(entity) ?? '');

    return (
        <YStack padding={space[3]} gap={space[1]} testID={testID} onPress={onPress} pressStyle={onPress ? { opacity: 0.7 } : undefined} opacity={unavailable ? 0.6 : 1}>
            <XStack gap={space[2]} alignItems="baseline">
                {/* The count leads: "2 ×" is what the driver checks against the bag. */}
                <Body fontSize={15} fontWeight="800" tabular testID={testID ? `${testID}-qty` : undefined}>
                    {t('orderDetail.items.quantity', { count: quantity ?? 1 })}
                </Body>
                <Body flex={1} fontSize={14} fontWeight="600" textDecorationLine={unavailable ? 'line-through' : 'none'}>
                    {name}
                </Body>
            </XStack>
            {unavailable ? (
                <Micro tone="danger" testID={testID ? `${testID}-unavailable` : undefined}>
                    {t('orderDetail.items.unavailable')}
                </Micro>
            ) : null}
            {substituteFor ? (
                <Micro tone="warning" testID={testID ? `${testID}-substitute` : undefined}>
                    {t('orderDetail.items.substituteFor', { name: replaced ? (entityNameOf(replaced) ?? substituteFor) : substituteFor })}
                </Micro>
            ) : null}
            {note ? (
                <Secondary fontSize={13} testID={testID ? `${testID}-note` : undefined}>
                    {t('orderDetail.items.note', { note })}
                </Secondary>
            ) : null}
            {code ? <Identifier value={code} boxed={false} /> : null}
        </YStack>
    );
}

/* -- Bring to the job (bookings). ----------------------------------------- */

/**
 * The scan checklist pattern from proof capture, ticked by hand: a service
 * job's "items" are what the provider brings, not parcels with barcodes.
 * Local state on purpose — it is the driver's own packing list, not a record.
 */
export function BringChecklist({ entities, t }: { entities: unknown[]; t: T }) {
    const [packed, setPacked] = useState<string[]>([]);
    const rows = entities.map((raw, i) => {
        const e = raw as Record<string, unknown>;
        return { key: entityIdOf(e) ?? String(i), name: String(e.name ?? entityNameOf(e) ?? ''), quantity: entityQuantityOf(e) };
    });
    if (!rows.length) return null;
    return (
        <YStack gap={space[2]} testID="bring-checklist">
            <XStack justifyContent="space-between" alignItems="baseline">
                <SectionLabel>{t('orderDetail.booking.bringHeading')}</SectionLabel>
                <Micro tabular>{t('orderDetail.booking.packedCount', { count: packed.length, total: rows.length })}</Micro>
            </XStack>
            <YStack gap={space[2]}>
                {rows.map((row) => {
                    const done = packed.includes(row.key);
                    return (
                        <XStack
                            key={row.key}
                            testID={`bring-${row.key}`}
                            alignItems="center"
                            gap={space[3]}
                            padding={space[3]}
                            borderRadius={radius.compact}
                            borderWidth={1}
                            borderColor={done ? '$successBorder' : '$border'}
                            backgroundColor={done ? '$successFill' : '$surface'}
                            onPress={() => setPacked((prev) => (done ? prev.filter((k) => k !== row.key) : [...prev, row.key]))}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: done }}
                        >
                            <Body flex={1} fontSize={14} fontWeight="600">
                                {row.quantity && row.quantity > 1 ? t('orderDetail.items.quantityName', { count: row.quantity, name: row.name }) : row.name}
                            </Body>
                            <Micro tone={done ? 'success' : 'muted'}>{done ? t('orderDetail.booking.packed') : t('orderDetail.booking.toPack')}</Micro>
                        </XStack>
                    );
                })}
            </YStack>
        </YStack>
    );
}

/* -- Cash on delivery. ------------------------------------------------------ */

export function CashSection({
    cod,
    t,
    confirmed,
    onConfirm,
}: {
    cod: CashOnDelivery;
    t: T;
    confirmed: boolean;
    /** Offered while the order still has a step to complete. */
    onConfirm?: () => void;
}) {
    const amount = formatMoney(cod.amount, cod.currency);
    const owed = cod.toCollect;
    return (
        <YStack
            padding={14}
            gap={12}
            borderRadius={18}
            borderWidth={1}
            backgroundColor={owed ? '$warningFill' : '$surface'}
            borderColor={owed ? '$warningBorder' : '$border'}
            testID="cod"
        >
            <XStack alignItems="center" gap={12}>
                <YStack width={40} height={40} borderRadius={13} alignItems="center" justifyContent="center" backgroundColor={owed ? '$warningFill' : '$surfaceRaised'} borderWidth={1} borderColor={owed ? '$warningBorder' : '$border'}>
                    <Glyph name="cash" />
                </YStack>
                <YStack flex={1} gap={2}>
                    <SectionLabel tone={owed ? 'warning' : 'muted'}>{t(owed ? 'orderDetail.cod.heading' : 'orderDetail.cod.title')}</SectionLabel>
                    <Body fontSize={22} fontWeight="800" tabular testID="cod-amount">
                        {amount}
                    </Body>
                </YStack>
                {owed ? (
                    <Secondary fontSize={13} fontWeight="700" tone="warning" testID="cod-to-collect">
                        {t('orderDetail.cod.toCollect')}
                    </Secondary>
                ) : (
                    <Secondary fontSize={13} fontWeight="700" tone="success" testID="cod-settled">
                        {t('orderDetail.cod.settled')}
                    </Secondary>
                )}
            </XStack>
            {owed ? (
                confirmed ? (
                    <Banner tone="success" message={t('orderDetail.cod.collected', { amount })} testID="cod-collected" />
                ) : onConfirm ? (
                    <Button variant="secondary" height={48} borderRadius={14} onPress={onConfirm} testID="cod-confirm">
                        {t('orderDetail.cod.confirm', { amount })}
                    </Button>
                ) : null
            ) : null}
        </YStack>
    );
}

/* -- When and how. ----------------------------------------------------------- */

export function scheduleLabel(window: TimeWindow): string {
    if (!window.start) return '';
    const start = formatDateTime(window.start);
    return window.end ? `${start} – ${formatClock(window.end)}` : start;
}

/** Booked slot (jobs), delivery instructions and the order's notes. Absent when the order has none of them. */
export function HandoverSection({
    window,
    isBooking,
    instructions,
    notes,
    t,
}: {
    window?: TimeWindow;
    isBooking: boolean;
    instructions?: string;
    notes?: string;
    t: T;
}) {
    // A delivery's scheduled time is in the header line; only a job's slot is repeated here.
    const slot = isBooking && window?.start ? scheduleLabel(window) : undefined;
    if (!slot && !instructions && !notes) return null;
    return (
        <Section label={t('orderDetail.notesHeading')}>
            <Card>
                <YStack gap={12}>
                    {slot ? (
                        <YStack gap={2} testID="order-schedule">
                            <Caption>{t('orderDetail.booking.slot')}</Caption>
                            <Body fontWeight="700" tabular>
                                {slot}
                            </Body>
                        </YStack>
                    ) : null}
                    {instructions ? (
                        <YStack gap={2} testID="order-instructions">
                            {slot || notes ? <Caption>{t('orderDetail.instructions')}</Caption> : null}
                            <Body fontSize={16} lineHeight={24}>
                                {instructions}
                            </Body>
                        </YStack>
                    ) : null}
                    {notes ? (
                        <YStack gap={2} testID="order-notes">
                            {slot || instructions ? <Caption>{t('orderDetail.orderNotes')}</Caption> : null}
                            <Body fontSize={16} lineHeight={24}>
                                {notes}
                            </Body>
                        </YStack>
                    ) : null}
                </YStack>
            </Card>
        </Section>
    );
}

/* -- Who to talk to. ---------------------------------------------------------- */

export function ContactSection({
    contact,
    t,
    onCall,
    onMessageCustomer,
    onMessageDispatch,
}: {
    contact?: ContactPerson;
    t: T;
    onCall?: () => void;
    onMessageCustomer?: () => void;
    onMessageDispatch?: () => void;
}) {
    if (!contact && !onMessageDispatch) return null;
    const who = contact?.name ?? contact?.phone ?? '';
    return (
        <Section label={t('orderDetail.customerHeading')}>
            <Card testID="order-contact">
                <YStack gap={12}>
                    {contact ? (
                        <XStack alignItems="center" gap={12}>
                            <Initials name={contact.name} />
                            <YStack flex={1} gap={2}>
                                {contact.name ? (
                                    <Body fontSize={16} fontWeight="800">
                                        {contact.name}
                                    </Body>
                                ) : null}
                                {contact.phone ? (
                                    <Secondary fontSize={13} tabular testID="contact-phone">
                                        {contact.phone}
                                    </Secondary>
                                ) : null}
                            </YStack>
                            {onCall ? <IconButton name="call" label={t('orderDetail.contact.callWho', { name: who })} onPress={onCall} testID="call-customer" /> : null}
                            {onMessageCustomer ? (
                                <IconButton name="message" label={t('orderDetail.contact.messageWho', { name: who })} onPress={onMessageCustomer} testID="message-customer" />
                            ) : null}
                        </XStack>
                    ) : null}
                    {onMessageDispatch ? (
                        <XStack
                            minHeight={48}
                            paddingHorizontal={12}
                            gap={10}
                            alignItems="center"
                            borderRadius={12}
                            backgroundColor="$surfaceRaised"
                            onPress={onMessageDispatch}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="button"
                            testID="message-dispatch"
                        >
                            <Body flex={1} fontSize={15} fontWeight="700" numberOfLines={1}>
                                {t('orderDetail.contact.messageDispatch')}
                            </Body>
                            <Glyph name="chevron" size={16} strokeWidth={2.4} />
                        </XStack>
                    ) : null}
                </YStack>
            </Card>
        </Section>
    );
}

/* -- What the order is. ------------------------------------------------------- */

/**
 * The top of the order: the tracking number in full, then the other two ids a
 * driver may be asked for, then one line saying what kind of order it is and
 * when it is due.
 */
export function OrderIdentity({
    label,
    trackingNumber,
    internalId,
    publicId,
    status,
    typeLine,
    kindTestID,
    t,
}: {
    label: string;
    trackingNumber: string;
    internalId?: string;
    publicId?: string;
    status?: string | null;
    typeLine?: string;
    kindTestID?: string;
    t: T;
}) {
    // When there is no tracking number the header already shows one of these.
    const others = [internalId, publicId].filter((id): id is string => !!id && id !== trackingNumber);
    return (
        <YStack gap={4} testID="order-identity">
            <XStack justifyContent="space-between" alignItems="center" gap={12}>
                <SectionLabel testID={kindTestID}>{label}</SectionLabel>
                <StatusPill status={status} t={(k, fb) => t(k, { defaultValue: fb })} />
            </XStack>
            <Body fontFamily="$mono" fontSize={22} lineHeight={28} fontWeight="600" selectable testID="order-tracking-number">
                {trackingNumber}
            </Body>
            {others.length ? (
                <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable testID="order-other-ids">
                    {others.join(' · ')}
                </Body>
            ) : null}
            {typeLine ? <Secondary fontSize={13}>{typeLine}</Secondary> : null}
        </YStack>
    );
}

/** Arrive / to go / deliver by — only the figures the server gave. */
export function EtaStrip({
    etaSeconds,
    etaKind,
    distanceM,
    deliverBy,
    stale,
    units,
    t,
}: {
    etaSeconds?: number | null;
    /** `start`: the order has not begun, so this is when it is expected to. */
    etaKind?: 'live' | 'start';
    distanceM?: number | null;
    deliverBy?: string;
    /** The driver's position was too old to trust; the ETA is marked approximate. */
    stale?: boolean;
    units: 'metric' | 'imperial';
    t: T;
}) {
    const cells = [
        etaSeconds ? { key: 'eta', value: `${stale ? '~' : ''}${formatClock(new Date(Date.now() + etaSeconds * 1000).toISOString())}`, label: t(etaKind === 'start' ? 'orderDetail.strip.start' : 'orderDetail.strip.arrive') } : null,
        distanceM ? { key: 'distance', value: formatMeters(distanceM, units), label: t('orderDetail.strip.toGo') } : null,
        deliverBy ? { key: 'by', value: formatClock(deliverBy), label: t('orderDetail.strip.deliverBy') } : null,
    ].filter((c): c is { key: string; value: string; label: string } => !!c);
    if (!cells.length) return null;
    return (
        <XStack gap={8} paddingVertical={12} paddingHorizontal={14} borderRadius={16} backgroundColor="$surface" borderWidth={1} borderColor="$border" testID="order-eta-strip">
            {cells.map((cell) => (
                <YStack key={cell.key} flex={1} gap={2} testID={`order-strip-${cell.key}`}>
                    <Body fontSize={24} lineHeight={30} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                        {cell.value}
                    </Body>
                    <Secondary fontSize={12}>{cell.label}</Secondary>
                </YStack>
            ))}
        </XStack>
    );
}

/* -- Where it goes. ----------------------------------------------------------- */

/**
 * Every point on the order in working order. The one being headed to is
 * spelled out with its address and carries the way to change it; the others
 * are a line each.
 */
export function WaypointsSection({
    points,
    started,
    onChange,
    t,
}: {
    points: OrderPoint[];
    started: boolean;
    /** Present when the order has more than one place to choose between. */
    onChange?: () => void;
    t: T;
}) {
    if (!points.length) return null;
    // Before the order starts nothing is "being headed to", but the first point is still where it begins.
    const focus = points.find((p) => p.state === 'current') ?? (started ? undefined : points.find((p) => p.state === 'later'));
    const roleOf = (p: OrderPoint) =>
        p.role === 'pickup'
            ? t('jobs.role.pickup')
            : p.role === 'dropoff'
              ? t('jobs.role.dropoff')
              : p.waypointNumber && p.waypointTotal && p.waypointTotal > 1
                ? t('jobs.role.waypointOf', { number: p.waypointNumber, total: p.waypointTotal })
                : t('jobs.role.waypoint');
    return (
        <Section label={t('orderDetail.waypointsHeading')}>
            <Card testID="order-waypoints">
                <YStack gap={14}>
                    {points.map((point, index) => {
                        const isFocus = point === focus;
                        const tag = [
                            point.state === 'done' ? t('jobs.state.done') : isFocus ? t(point.state === 'current' ? 'jobs.state.heading' : 'orderDetail.startsHere') : null,
                            roleOf(point),
                            point.state !== 'done' && point.windowEnd ? t('jobs.byTime', { time: formatClock(point.windowEnd) }) : null,
                        ]
                            .filter(Boolean)
                            .join(' · ');
                        return (
                            <XStack key={point.id ?? index} alignItems="flex-start" gap={12} testID={`order-waypoint-${index}`}>
                                <WaypointMark state={point.state} label={index + 1} size={28} />
                                <YStack flex={1} gap={2}>
                                    <SectionLabel tone={point.state === 'done' ? 'success' : point.state === 'current' ? 'brand' : 'muted'}>{tag}</SectionLabel>
                                    <Body fontSize={isFocus ? 17 : 16} fontWeight={isFocus ? '800' : '700'} tone={point.state === 'done' ? 'secondary' : 'primary'}>
                                        {point.name ?? point.address ?? t('jobs.unnamed', { sequence: index + 1 })}
                                    </Body>
                                    {isFocus && point.name && point.address ? <Secondary fontSize={14}>{point.address}</Secondary> : null}
                                </YStack>
                                {/*
                                  * Only offered on an order with somewhere else to
                                  * go. A single-place order presents no choice, and
                                  * a button that opens a list of one is a button
                                  * that wasted the driver's tap.
                                  */}
                                {isFocus && onChange ? (
                                    <YStack
                                        height={36}
                                        paddingHorizontal={12}
                                        borderRadius={12}
                                        borderWidth={1}
                                        borderColor="$border"
                                        alignItems="center"
                                        justifyContent="center"
                                        onPress={onChange}
                                        pressStyle={{ opacity: 0.6 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('orderDetail.changeDestinationLabel')}
                                        testID="change-destination"
                                    >
                                        <Body fontSize={13} fontWeight="700" numberOfLines={1}>
                                            {t('orderDetail.changeDestination')}
                                        </Body>
                                    </YStack>
                                ) : null}
                            </XStack>
                        );
                    })}
                </YStack>
            </Card>
        </Section>
    );
}

/* -- What has happened. -------------------------------------------------------- */

/** One line per tracking status: a dot, the status in words, and when. */
export function EventRows({ events, t, dated }: { events: TrackingStatusEvent[]; t: T; dated?: boolean }) {
    return (
        <YStack gap={12}>
            {events.map((event, index) => {
                const d = describeStatus(event.code);
                const label = t(d.labelKey, { defaultValue: event.status ?? d.defaultLabel });
                return (
                    <XStack key={event.id ?? index} alignItems="flex-start" gap={12} testID={`order-event-${event.id ?? index}`}>
                        {/* Newest is first and is the one that still stands. */}
                        <YStack width={10} height={10} borderRadius={5} marginTop={6} backgroundColor={index === 0 ? '$primary' : event.complete ? '$success' : '$textMuted'} />
                        <YStack flex={1} gap={2}>
                            <Body fontSize={15} fontWeight="700">
                                {label}
                            </Body>
                            {dated && event.details ? <Secondary fontSize={13}>{event.details}</Secondary> : null}
                        </YStack>
                        <Secondary fontSize={13} tabular>
                            {dated ? formatDateTime(event.created_at) : formatClock(event.created_at)}
                        </Secondary>
                    </XStack>
                );
            })}
        </YStack>
    );
}

/** A quiet text link on the right of a section label. */
export function SectionLink({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
    return (
        <YStack onPress={onPress} pressStyle={{ opacity: 0.6 }} hitSlop={12} accessibilityRole="button" testID={testID}>
            <Body fontSize={13} fontWeight="700" tone="brand" numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}
