/**
 * Domain cards.
 *
 * OrderCard replaces three v2 components (OrderCard, PastOrderCard,
 * AdhocOrderCard) that copy-pasted the same destination-derivation useMemo and
 * each embedded a live map — which meant an N-order list fired N Google
 * Directions requests. No map here: the route surface owns the single map.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from './Text';
import { Identifier } from './Identifier';
import { StatusPill } from './StatusPill';
import { Surface, Divider } from './Surface';
import { Button } from './Button';
import { radius, space } from '../theme/tokens';
import { formatDuration, formatMeters, type DistanceUnit } from '../format';
import { useTranslation } from '../i18n/useTranslation';

export interface OrderCardStop {
    name: string;
    /** "Pickup · departed 13:41" / "Drop-off · window 14:00–15:00" */
    detail?: string;
    kind: 'pickup' | 'dropoff';
}

export interface OrderCardProps {
    trackingNumber: string;
    status?: string;
    stops: OrderCardStop[];
    /** order.distance, metres. */
    distanceM?: number;
    /** order.time, seconds. */
    durationS?: number;
    itemCount?: number;
    customerName?: string;
    completedStops?: number;
    totalStops?: number;
    /** Multi-waypoint summary line, e.g. "4 waypoints · Purbeck district". */
    summary?: string;
    /** Driver's unit preference, from src/v3/settings. Metric unless told otherwise. */
    units?: DistanceUnit;
    onPress?: () => void;
    testID?: string;
}

export function OrderCard({
    trackingNumber,
    status,
    stops,
    distanceM,
    durationS,
    itemCount,
    customerName,
    completedStops,
    totalStops,
    summary,
    units = 'metric',
    onPress,
    testID,
}: OrderCardProps) {
    const { t } = useTranslation();
    const meta = [
        distanceM != null || durationS != null
            ? [distanceM != null ? formatMeters(distanceM, units) : null, durationS != null ? formatDuration(durationS) : null].filter(Boolean).join(' · ')
            : null,
        itemCount != null ? t('ui.itemCount', { count: itemCount }) : null,
        customerName ?? null,
    ].filter(Boolean) as string[];

    const progress = totalStops && totalStops > 0 ? Math.min(1, (completedStops ?? 0) / totalStops) : undefined;

    return (
        <Surface testID={testID} hero onPress={onPress} pressStyle={{ opacity: 0.85 }} accessibilityRole="button" overflow="hidden">
            {/* The identifier leads, on its own line, in full — the design's core rule. */}
            <YStack padding={space[4]} gap={space[2]}>
                <XStack alignItems="center" justifyContent="space-between" gap={space[2]}>
                    <Caption>{t('ui.trackingNumber')}</Caption>
                    {status ? <StatusPill status={status} size="sm" /> : null}
                </XStack>
                <Identifier value={trackingNumber} boxed={false} />
            </YStack>

            <Divider />

            <YStack padding={space[4]} gap={space[3]}>
                {summary ? <Secondary fontSize={13}>{summary}</Secondary> : null}

                <XStack gap={space[3]}>
                    {/* Timeline rail */}
                    <YStack alignItems="center" paddingTop={4}>
                        <YStack width={9} height={9} borderRadius={999} borderWidth={2.5} borderColor="$primary" />
                        <YStack width={1.5} flex={1} backgroundColor="$border" marginVertical={3} minHeight={18} />
                        <YStack width={9} height={9} borderRadius={2} backgroundColor="$successText" />
                    </YStack>

                    <YStack flex={1} gap={space[3]}>
                        {stops.map((s, i) => (
                            <YStack key={`${s.name}-${i}`}>
                                <Body fontSize={13} fontWeight="600" numberOfLines={1}>
                                    {s.name}
                                </Body>
                                {s.detail ? <Micro>{s.detail}</Micro> : null}
                            </YStack>
                        ))}
                    </YStack>
                </XStack>

                {progress !== undefined ? (
                    <YStack height={5} borderRadius={3} backgroundColor="$surfaceRaised" overflow="hidden">
                        <YStack height={5} borderRadius={3} width={`${progress * 100}%`} backgroundColor="$primary" />
                    </YStack>
                ) : null}

                {meta.length ? (
                    <XStack justifyContent="space-between" gap={space[2]}>
                        {completedStops != null && totalStops != null ? (
                            <Micro tabular>
                                {completedStops} of {totalStops} stops
                            </Micro>
                        ) : null}
                        {meta.map((m) => (
                            <Micro key={m} tabular>
                                {m}
                            </Micro>
                        ))}
                    </XStack>
                ) : null}
            </YStack>
        </Surface>
    );
}

/**
 * Ad-hoc offer. Distinct from OrderCard because the decision is time-boxed —
 * the countdown and the accept/decline pair are the whole point.
 */
export function OfferCard({
    trackingNumber,
    pickup,
    dropoff,
    distanceAwayM,
    payout,
    expiresIn,
    onAccept,
    onDecline,
    testID,
}: {
    trackingNumber: string;
    pickup: string;
    dropoff: string;
    distanceAwayM?: number;
    payout?: string;
    /** Formatted countdown, e.g. "01:54". */
    expiresIn?: string;
    onAccept?: () => void;
    onDecline?: () => void;
    testID?: string;
}) {
    const { t } = useTranslation();
    return (
        <Surface testID={testID} hero level="card" borderColor="$primaryBorder" backgroundColor="$primaryFill">
            <YStack padding={space[4]} gap={space[3]}>
                <XStack alignItems="center" justifyContent="space-between">
                    <Caption tone="brand">{t('ui.newOfferNearby')}</Caption>
                    {expiresIn ? (
                        <Micro tone="brand" tabular>
                            expires in {expiresIn}
                        </Micro>
                    ) : null}
                </XStack>

                <Identifier value={trackingNumber} />

                <YStack gap={space[1]}>
                    <Body fontSize={14} fontWeight="700">
                        {pickup}
                    </Body>
                    <Secondary fontSize={13}>→ {dropoff}</Secondary>
                </YStack>

                <XStack gap={space[4]}>
                    {distanceAwayM != null ? (
                        <YStack>
                            <Micro>AWAY</Micro>
                            <Body fontWeight="800" tabular>
                                {formatMeters(distanceAwayM)}
                            </Body>
                        </YStack>
                    ) : null}
                    {payout ? (
                        <YStack>
                            <Micro>{t('ui.payout')}</Micro>
                            <Body fontWeight="800" tabular>
                                {payout}
                            </Body>
                        </YStack>
                    ) : null}
                </XStack>

                <XStack gap={space[2]}>
                    <Button flex={1} variant="ghost" onPress={onDecline}>{t('ui.decline')}</Button>
                    <Button flex={2} onPress={onAccept}>{t('ui.accept')}</Button>
                </XStack>
            </YStack>
        </Surface>
    );
}

export function VehicleCard({
    name,
    plate,
    odometerLabel,
    inspectionLabel,
    inspectionOk = true,
    online,
    photo,
    onPress,
    testID,
}: {
    name: string;
    plate?: string;
    /** Pre-formatted, e.g. "84,212 km". */
    odometerLabel?: string;
    /** e.g. "Inspection passed 06:40" or "Inspection due". */
    inspectionLabel?: string;
    inspectionOk?: boolean;
    online?: boolean;
    photo?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
}) {
    return (
        <Surface testID={testID} padded="compact" onPress={onPress} pressStyle={{ opacity: 0.85 }}>
            <XStack alignItems="center" gap={space[3]}>
                <YStack
                    width={46}
                    height={46}
                    borderRadius={radius.compact + 2}
                    borderWidth={1}
                    borderColor="$border"
                    backgroundColor="$surfaceRaised"
                    alignItems="center"
                    justifyContent="center"
                    overflow="hidden"
                >
                    {photo}
                </YStack>

                <YStack flex={1} gap={2}>
                    <XStack alignItems="center" gap={space[2]} flexWrap="wrap">
                        <Body fontSize={14} fontWeight="700">
                            {name}
                        </Body>
                        {plate ? <Identifier value={plate} boxed={false} /> : null}
                    </XStack>
                    <Micro tabular>
                        {odometerLabel ? `Odometer ${odometerLabel}` : ''}
                        {odometerLabel && inspectionLabel ? ' · ' : ''}
                    </Micro>
                    {inspectionLabel ? (
                        <Micro tone={inspectionOk ? 'success' : 'warning'}>{inspectionLabel}</Micro>
                    ) : null}
                </YStack>

                {online !== undefined ? (
                    <YStack width={9} height={9} borderRadius={999} backgroundColor={online ? '$successText' : '$textMuted'} />
                ) : null}
            </XStack>
        </Surface>
    );
}

/* -- ManifestCard — R2 frame B1. ------------------------------------------ */

export interface ManifestCardProps {
    /** The manifest's public id, rendered in full and monospaced. */
    manifestId: string;
    status?: string | null;
    /** "TODAY, 19 AUG" — the caller formats the date for the bucket it is in. */
    dateLabel: string;
    /** "Purbeck loop · Sprinter 316" — vehicle and notes, whatever is known. */
    subtitle?: string;
    completedStops?: number;
    totalStops?: number;
    distanceM?: number | null;
    durationS?: number | null;
    /** Started or scheduled clock time, with its label. */
    time?: { label: string; value: string };
    /** Draft: dispatch is still building it. Shown instead of the metrics. */
    notice?: string;
    /** Metric labels, translated by the caller. */
    labels: { stops: string; distance: string; duration: string };
    units?: DistanceUnit;
    onPress?: () => void;
    testID?: string;
}

function Metric({ value, label }: { value: string; label: string }) {
    return (
        <YStack flex={1} gap={2}>
            <Body fontSize={16} fontWeight="800" tabular>
                {value}
            </Body>
            <Micro fontSize={10}>{label}</Micro>
        </YStack>
    );
}

export function ManifestCard({
    manifestId,
    status,
    dateLabel,
    subtitle,
    completedStops,
    totalStops,
    distanceM,
    durationS,
    time,
    notice,
    labels,
    units = 'metric',
    onPress,
    testID,
}: ManifestCardProps) {
    const { t } = useTranslation();
    return (
        <Surface testID={testID} hero onPress={onPress} pressStyle={{ opacity: 0.85 }} accessibilityRole="button" overflow="hidden">
            <YStack padding={space[4]} gap={space[2]}>
                <XStack alignItems="center" justifyContent="space-between" gap={space[2]}>
                    <Caption>
                        {t('ui.manifestId')} · {dateLabel}
                    </Caption>
                    {status ? <StatusPill status={status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} /> : null}
                </XStack>
                <Identifier value={manifestId} boxed={false} />
                {subtitle ? <Secondary fontSize={13}>{subtitle}</Secondary> : null}
            </YStack>

            <Divider />

            <YStack padding={space[4]}>
                {notice ? (
                    <Secondary fontSize={13}>{notice}</Secondary>
                ) : (
                    <XStack gap={space[3]}>
                        {totalStops != null ? (
                            <Metric value={`${completedStops ?? 0} / ${totalStops}`} label={labels.stops} />
                        ) : null}
                        {distanceM != null ? <Metric value={formatMeters(distanceM, units)} label={labels.distance} /> : null}
                        {durationS != null ? <Metric value={formatDuration(durationS)} label={labels.duration} /> : null}
                        {time ? <Metric value={time.value} label={time.label} /> : null}
                    </XStack>
                )}
            </YStack>
        </Surface>
    );
}
