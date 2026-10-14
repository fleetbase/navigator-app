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
import { Body, Caption, Heading, Micro, Secondary } from '../../ui/Text';
import { Identifier } from '../../ui/Identifier';
import { Surface, Divider } from '../../ui/Surface';
import { Button } from '../../ui/Button';
import { Banner } from '../../ui/Banner';
import { radius, space } from '../../theme/tokens';
import { formatClock, formatDateTime, formatMoney } from '../../format';
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
                <Heading fontSize={17}>{t('orderDetail.booking.bringHeading')}</Heading>
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
    return (
        <Surface padded="compact" testID="cod">
            <YStack gap={space[2]}>
                <XStack justifyContent="space-between" alignItems="center">
                    <Caption>{t('orderDetail.cod.title')}</Caption>
                    {cod.toCollect ? (
                        <Micro tone="warning" testID="cod-to-collect">
                            {t('orderDetail.cod.toCollect')}
                        </Micro>
                    ) : (
                        <Micro tone="success" testID="cod-settled">
                            {t('orderDetail.cod.settled')}
                        </Micro>
                    )}
                </XStack>
                <Body fontSize={22} fontWeight="800" tabular testID="cod-amount">
                    {amount}
                </Body>
                {cod.toCollect ? (
                    confirmed ? (
                        <Banner tone="success" message={t('orderDetail.cod.collected', { amount })} testID="cod-collected" />
                    ) : onConfirm ? (
                        <Button variant="secondary" onPress={onConfirm} testID="cod-confirm">
                            {t('orderDetail.cod.confirm', { amount })}
                        </Button>
                    ) : null
                ) : null}
            </YStack>
        </Surface>
    );
}

/* -- When and how. ----------------------------------------------------------- */

export function scheduleLabel(window: TimeWindow): string {
    if (!window.start) return '';
    const start = formatDateTime(window.start);
    return window.end ? `${start} – ${formatClock(window.end)}` : start;
}

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
    return (
        <YStack gap={space[2]}>
            <Heading fontSize={17}>{t('orderDetail.notesHeading')}</Heading>
            <Surface>
                {window?.start ? (
                    <YStack padding={space[3]} gap={2} testID="order-schedule">
                        <Caption>{isBooking ? t('orderDetail.booking.slot') : t('orderDetail.scheduled')}</Caption>
                        <Body fontWeight="700" tabular>
                            {scheduleLabel(window)}
                        </Body>
                    </YStack>
                ) : null}
                {instructions ? (
                    <YStack>
                        {window?.start ? <Divider /> : null}
                        <YStack padding={space[3]} gap={2} testID="order-instructions">
                            <Caption>{t('orderDetail.instructions')}</Caption>
                            <Body>{instructions}</Body>
                        </YStack>
                    </YStack>
                ) : null}
                <YStack>
                    {window?.start || instructions ? <Divider /> : null}
                    <YStack padding={space[3]} gap={2} testID="order-notes">
                        {window?.start || instructions ? <Caption>{t('orderDetail.orderNotes')}</Caption> : null}
                        <Secondary>{notes || t('orderDetail.noNotes')}</Secondary>
                    </YStack>
                </YStack>
            </Surface>
        </YStack>
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
    return (
        <YStack gap={space[2]}>
            <Heading fontSize={17}>{t('orderDetail.customerHeading')}</Heading>
            <Surface padded="compact" testID="order-contact">
                <YStack gap={space[3]}>
                    {contact ? (
                        <YStack gap={2}>
                            {contact.name ? <Body fontWeight="700">{contact.name}</Body> : null}
                            {contact.phone ? (
                                <Secondary tabular testID="contact-phone">
                                    {contact.phone}
                                </Secondary>
                            ) : null}
                        </YStack>
                    ) : null}
                    <XStack gap={space[2]} flexWrap="wrap">
                        {onCall ? (
                            <Button flex={1} variant="secondary" onPress={onCall} testID="call-customer">
                                {t('orderDetail.contact.call')}
                            </Button>
                        ) : null}
                        {onMessageCustomer ? (
                            <Button flex={1} variant="secondary" onPress={onMessageCustomer} testID="message-customer">
                                {t('orderDetail.contact.messageCustomer')}
                            </Button>
                        ) : null}
                    </XStack>
                    {onMessageDispatch ? (
                        <Button variant="ghost" onPress={onMessageDispatch} testID="message-dispatch">
                            {t('orderDetail.contact.messageDispatch')}
                        </Button>
                    ) : null}
                </YStack>
            </Surface>
        </YStack>
    );
}
