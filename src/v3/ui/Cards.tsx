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
import { formatDuration, formatMeters } from '../format';

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
    onPress,
    testID,
}: OrderCardProps) {
    const meta = [
        distanceM != null || durationS != null
            ? [distanceM != null ? formatMeters(distanceM) : null, durationS != null ? formatDuration(durationS) : null].filter(Boolean).join(' · ')
            : null,
        itemCount != null ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : null,
        customerName ?? null,
    ].filter(Boolean) as string[];

    const progress = totalStops && totalStops > 0 ? Math.min(1, (completedStops ?? 0) / totalStops) : undefined;

    return (
        <Surface testID={testID} hero onPress={onPress} pressStyle={{ opacity: 0.85 }} accessibilityRole="button" overflow="hidden">
            {/* The identifier leads, on its own line, in full — the design's core rule. */}
            <YStack padding={space[4]} gap={space[2]}>
                <XStack alignItems="center" justifyContent="space-between" gap={space[2]}>
                    <Caption>TRACKING NUMBER</Caption>
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
    return (
        <Surface testID={testID} hero level="card" borderColor="$primaryBorder" backgroundColor="$primaryFill">
            <YStack padding={space[4]} gap={space[3]}>
                <XStack alignItems="center" justifyContent="space-between">
                    <Caption tone="brand">NEW OFFER NEARBY</Caption>
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
                            <Micro>PAYOUT</Micro>
                            <Body fontWeight="800" tabular>
                                {payout}
                            </Body>
                        </YStack>
                    ) : null}
                </XStack>

                <XStack gap={space[2]}>
                    <Button flex={1} variant="ghost" onPress={onDecline}>
                        Decline
                    </Button>
                    <Button flex={2} onPress={onAccept}>
                        Accept
                    </Button>
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
