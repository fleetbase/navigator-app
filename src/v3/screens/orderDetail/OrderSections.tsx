/**
 * The order-detail sections the order-operations contract added.
 *
 * Kept out of OrderDetailScreen so that screen stays about the flow (where the
 * order is, what the driver does next) and these stay about the *content* a
 * driver needs at the door: how many of what, what to collect, and who to
 * call. The pieces that belong to the order's sheet (its header, the step to
 * do, the trip) are in OrderSheetParts.
 */
import { useState } from 'react';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../../ui/Text';
import { Surface } from '../../ui/Surface';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { radius, space } from '../../theme/tokens';
import { describeStatus } from '../../theme/status';
import { formatClock, formatDateTime, formatMoney, formatWeight } from '../../format';
import { Card, Glyph, Initials, Section, SectionLabel } from '../jobs/parts';
import { HomeIcon, type HomeIconName } from '../home/parts';
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

/** "12.4 kg" for one item, when the record carries a weight. */
export function entityWeightLabel(entity: Record<string, unknown>): string | undefined {
    if (entity.weight == null || entity.weight === '') return undefined;
    const label = formatWeight(entity.weight as string | number, typeof entity.weight_unit === 'string' ? entity.weight_unit : undefined);
    return label === '—' ? undefined : label;
}

/**
 * The weight of everything on the order, when it can be said honestly: every
 * weighed item uses the same unit. Mixed units are not added up.
 */
export function totalWeightLabel(entities: unknown[]): string | undefined {
    let total = 0;
    let unit: string | undefined;
    let weighed = 0;
    for (const raw of entities) {
        const e = raw as Record<string, unknown>;
        if (e.weight == null || e.weight === '') continue;
        const n = Number(e.weight);
        if (!Number.isFinite(n)) continue;
        const u = typeof e.weight_unit === 'string' && e.weight_unit ? e.weight_unit : '';
        if (weighed && u !== unit) return undefined;
        unit = u;
        total += n * (entityQuantityOf(e) ?? 1);
        weighed += 1;
    }
    if (!weighed || total <= 0) return undefined;
    return formatWeight(Math.round(total * 100) / 100, unit || undefined);
}

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
    const theme = useTheme();
    const quantity = entityQuantityOf(entity);
    const note = entityNoteOf(entity);
    const unavailable = entityUnavailableOf(entity);
    const substituteFor = entitySubstituteForOf(entity);
    const replaced = findEntity(entities, substituteFor);
    const code = entityTrackingNumberOf(entity);
    const name = String(entity.name ?? entityNameOf(entity) ?? '');
    const weight = entityWeightLabel(entity);

    return (
        <XStack
            alignItems="center"
            gap={12}
            paddingVertical={10}
            paddingHorizontal={14}
            testID={testID}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            opacity={unavailable ? 0.6 : 1}
        >
            <YStack width={40} height={40} borderRadius={12} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised" borderWidth={1} borderColor="$border">
                <Glyph name="box" size={20} strokeWidth={2} color={theme.textSecondary?.val as string} />
            </YStack>
            <YStack flex={1} minWidth={0}>
                {/* The count leads: "2 ×" is what the driver checks against the bag. */}
                <Body fontSize={16} lineHeight={21} fontWeight="800" textDecorationLine={unavailable ? 'line-through' : 'none'}>
                    <Body fontSize={16} lineHeight={21} fontWeight="800" tabular tone="brand" testID={testID ? `${testID}-qty` : undefined}>
                        {t('orderDetail.items.quantity', { count: quantity ?? 1 })}{' '}
                    </Body>
                    {name}
                </Body>
                {code ? (
                    <Body fontFamily="$mono" fontSize={13} lineHeight={17} fontWeight="500" tone="secondary" selectable>
                        {code}
                    </Body>
                ) : null}
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
                    <Secondary fontSize={13} lineHeight={17} testID={testID ? `${testID}-note` : undefined}>
                        {t('orderDetail.items.note', { note })}
                    </Secondary>
                ) : null}
            </YStack>
            {weight ? (
                <Body flexShrink={0} fontSize={15} fontWeight="800" tabular numberOfLines={1}>
                    {weight}
                </Body>
            ) : null}
            {onPress ? <Glyph name="chevron" size={16} strokeWidth={2.4} color={theme.textSecondary?.val as string} /> : null}
        </XStack>
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
    where,
}: {
    cod: CashOnDelivery;
    t: T;
    confirmed: boolean;
    /** Offered while the order still has a step to complete. */
    onConfirm?: () => void;
    /** Where the cash is taken: "At the drop-off". Left out when the order has no such place. */
    where?: string;
}) {
    const theme = useTheme();
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
                <YStack width={40} height={40} borderRadius={13} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={owed ? '$warningBorder' : '$surfaceRaised'}>
                    <Glyph name="cash" color={(owed ? theme.warningText?.val : theme.textSecondary?.val) as string} />
                </YStack>
                <YStack flex={1} minWidth={0}>
                    <SectionLabel tone={owed ? 'warning' : 'muted'}>{t(owed ? 'orderDetail.cod.heading' : 'orderDetail.cod.title')}</SectionLabel>
                    <Body fontSize={22} lineHeight={28} fontWeight="800" tabular testID="cod-amount">
                        {amount}
                    </Body>
                </YStack>
                {/* Said in words beside the amount, never by the card's colour alone. */}
                <YStack flexShrink={0} alignItems="flex-end">
                    {where ? (
                        <Secondary fontSize={13} lineHeight={18} fontWeight="700" numberOfLines={1}>
                            {where}
                        </Secondary>
                    ) : null}
                    {owed ? (
                        <Secondary fontSize={13} lineHeight={18} fontWeight="700" tone={confirmed ? 'success' : 'warning'} numberOfLines={1} testID="cod-to-collect">
                            {t(confirmed ? 'orderDetail.cod.collectedShort' : 'orderDetail.cod.notYet')}
                        </Secondary>
                    ) : (
                        <Secondary fontSize={13} lineHeight={18} fontWeight="700" tone="success" numberOfLines={1} testID="cod-settled">
                            {t('orderDetail.cod.settled')}
                        </Secondary>
                    )}
                </YStack>
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

/* -- When. -------------------------------------------------------------------- */

export function scheduleLabel(window: TimeWindow): string {
    if (!window.start) return '';
    const start = formatDateTime(window.start);
    return window.end ? `${start} – ${formatClock(window.end)}` : start;
}

/* -- Who to talk to. ---------------------------------------------------------- */

/** A count on the corner of a button: unread messages. */
export function CountBadge({ count, offset = -6 }: { count?: number; offset?: number }) {
    if (!count || count <= 0) return null;
    return (
        <YStack position="absolute" top={offset} right={offset} minWidth={18} height={18} paddingHorizontal={4} borderRadius={9} alignItems="center" justifyContent="center" backgroundColor="$danger">
            <Body fontSize={11} lineHeight={14} fontWeight="800" tabular color="#FFFFFF">
                {count > 99 ? '99+' : String(count)}
            </Body>
        </YStack>
    );
}

/** A 48dp square with its icon over its word: "Message", "Call". */
function SquareAction({ icon, text, label, onPress, badge, testID }: { icon: HomeIconName; text: string; label: string; onPress: () => void; badge?: number; testID?: string }) {
    const theme = useTheme();
    return (
        <YStack
            width={48}
            height={48}
            borderRadius={14}
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            gap={2}
            backgroundColor="$surfaceRaised"
            borderWidth={1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.6 }}
            accessibilityRole="button"
            accessibilityLabel={badge ? `${label}, ${badge}` : label}
            testID={testID}
        >
            <HomeIcon name={icon} color={theme.textPrimary?.val as string} size={18} />
            <Body fontSize={10} lineHeight={12} fontWeight="700" numberOfLines={1} adjustsFontSizeToFit>
                {text}
            </Body>
            <CountBadge count={badge} />
        </YStack>
    );
}

/** The customer, with the two ways to reach them. Absent when the order names nobody. */
export function ContactSection({
    contact,
    t,
    onCall,
    onMessageCustomer,
    unread,
}: {
    contact?: ContactPerson;
    t: T;
    onCall?: () => void;
    onMessageCustomer?: () => void;
    /** Unread messages in the thread `onMessageCustomer` opens. */
    unread?: number;
}) {
    if (!contact) return null;
    const who = contact.name ?? contact.phone ?? '';
    return (
        <Section label={t('orderDetail.customerHeading')}>
            <Card testID="order-contact">
                <XStack alignItems="center" gap={10}>
                    <Initials name={contact.name} size={40} />
                    <YStack flex={1} minWidth={0}>
                        {contact.name ? (
                            <Body fontSize={16} lineHeight={21} fontWeight="800">
                                {contact.name}
                            </Body>
                        ) : null}
                        {contact.phone ? (
                            <Body fontFamily="$mono" fontSize={13} lineHeight={17} fontWeight="500" tone="secondary" selectable testID="contact-phone">
                                {contact.phone}
                            </Body>
                        ) : null}
                    </YStack>
                    {onMessageCustomer ? (
                        <SquareAction icon="chat" text={t('orderDetail.contact.message')} label={t('orderDetail.contact.messageWho', { name: who })} onPress={onMessageCustomer} badge={unread} testID="message-customer" />
                    ) : null}
                    {onCall ? <SquareAction icon="phone" text={t('orderDetail.contact.call')} label={t('orderDetail.contact.callWho', { name: who })} onPress={onCall} testID="call-customer" /> : null}
                </XStack>
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
