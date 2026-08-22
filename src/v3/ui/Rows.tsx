/**
 * List rows.
 *
 * StopRow is the route list's workhorse and carries three visual states —
 * current, pending, completed — because the design collapses completed stops
 * and pins the current one. Formatting comes from src/v3/format.ts — see
 * that file for why v3 cannot import the v2 formatters directly.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from './Text';
import { Identifier } from './Identifier';
import { Surface } from './Surface';
import { radius, space } from '../theme/tokens';
import { formatDuration, formatMeters, type DistanceUnit } from '../format';
import { useTranslation } from '../i18n/useTranslation';

export type StopState = 'current' | 'pending' | 'completed' | 'failed';

export interface StopRowProps {
    sequence: number;
    name: string;
    address?: string;
    /** Tracking number of the order this stop belongs to. Rendered in full. */
    trackingNumber?: string;
    /** 'PICKUP' | 'DROPOFF' | 'RETURN' — from the waypoint type. */
    type?: 'pickup' | 'dropoff' | 'return';
    itemCount?: number;
    /** Formatted clock time, e.g. "14:32". */
    eta?: string;
    /** Delivery window, e.g. "14:00–15:00". */
    window?: string;
    /** From manifest_stops.distance_from_prev_m / duration_from_prev_s. */
    distanceFromPrevM?: number;
    durationFromPrevS?: number;
    state?: StopState;
    /** Completion time for the collapsed completed row. */
    completedAt?: string;
    /** Driver's unit preference, from src/v3/settings. */
    units?: DistanceUnit;
    onPress?: () => void;
    testID?: string;
}

/** Keys, not words: the map is module-level and outlives a language change. */
const typeLabelKey: Record<NonNullable<StopRowProps['type']>, string> = {
    pickup: 'ui.stopPickup',
    dropoff: 'ui.stopDropoff',
    return: 'ui.stopReturn',
};

const typeToken: Record<NonNullable<StopRowProps['type']>, string> = {
    pickup: '$stopPickup',
    dropoff: '$stopDropoff',
    return: '$stopReturn',
};

function Chip({ label, color, border }: { label: string; color?: string; border?: string }) {
    return (
        <XStack
            paddingHorizontal={space[2]}
            paddingVertical={3}
            borderRadius={radius.pill}
            borderWidth={1}
            borderColor={(border ?? '$border') as never}
            backgroundColor="$surfaceRaised"
        >
            <Micro fontSize={10.5} color={(color ?? '$textSecondary') as never}>
                {label}
            </Micro>
        </XStack>
    );
}

export function StopRow({
    sequence,
    name,
    address,
    trackingNumber,
    type = 'dropoff',
    itemCount,
    eta,
    window,
    distanceFromPrevM,
    durationFromPrevS,
    state = 'pending',
    completedAt,
    units = 'metric',
    onPress,
    testID,
}: StopRowProps) {
    const { t } = useTranslation();
    // Completed stops recede — legible, but out of the way of the next action.
    if (state === 'completed') {
        return (
            <Surface testID={testID} muted padded="compact" onPress={onPress} pressStyle={{ opacity: 0.5 }}>
                <XStack alignItems="center" gap={space[3]}>
                    <YStack
                        width={28}
                        height={28}
                        borderRadius={radius.compact - 2}
                        alignItems="center"
                        justifyContent="center"
                        backgroundColor="$successFill"
                    >
                        <Micro tone="success" fontSize={13}>
                            ✓
                        </Micro>
                    </YStack>
                    <Secondary flex={1} fontSize={13} textDecorationLine="line-through" numberOfLines={1}>
                        {name}
                    </Secondary>
                    {completedAt ? (
                        <Micro tabular>{completedAt}</Micro>
                    ) : null}
                </XStack>
            </Surface>
        );
    }

    const isCurrent = state === 'current';
    const leg =
        distanceFromPrevM != null
            ? `${formatMeters(distanceFromPrevM, units)}${durationFromPrevS != null ? ` · ${formatDuration(durationFromPrevS)}` : ''}`
            : undefined;

    return (
        <Surface
            testID={testID}
            active={isCurrent}
            hero
            padded="compact"
            onPress={onPress}
            pressStyle={{ opacity: 0.8 }}
            accessibilityRole="button"
            accessibilityLabel={`Stop ${sequence}, ${name}${eta ? `, ETA ${eta}` : ''}`}
        >
            <XStack gap={space[3]} alignItems="flex-start">
                <YStack
                    width={40}
                    height={40}
                    borderRadius={radius.compact + 1}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={isCurrent ? '$primary' : '$surfaceRaised'}
                    borderWidth={isCurrent ? 0 : 1}
                    borderColor="$border"
                >
                    <Body fontSize={17} fontWeight="800" tone={isCurrent ? 'onPrimary' : 'secondary'}>
                        {sequence}
                    </Body>
                </YStack>

                <YStack flex={1} gap={space[1]}>
                    <XStack justifyContent="space-between" gap={space[2]}>
                        <Body flex={1} fontSize={14} fontWeight="700" numberOfLines={1}>
                            {name}
                        </Body>
                        {eta ? (
                            <Micro fontSize={12} tone={isCurrent ? 'brand' : 'muted'} tabular>
                                ETA {eta}
                            </Micro>
                        ) : null}
                    </XStack>

                    {address ? <Secondary fontSize={12.5}>{address}</Secondary> : null}

                    {/* Identifiers render in full, on their own line — never truncated. */}
                    {trackingNumber ? <Identifier value={trackingNumber} boxed={false} /> : null}

                    <XStack gap={space[2]} alignItems="center" flexWrap="wrap">
                        <Chip label={t(typeLabelKey[type])} color={typeToken[type]} border={`${typeToken[type]}Border`} />
                        {itemCount != null ? <Chip label={t('ui.itemCount', { count: itemCount })} /> : null}
                        {window ? <Chip label={`Window ${window}`} /> : null}
                        {leg ? (
                            <Micro marginLeft="auto" tabular>
                                {leg}
                            </Micro>
                        ) : null}
                    </XStack>
                </YStack>
            </XStack>
        </Surface>
    );
}

/**
 * A planned break, rendered inline in the route list.
 * Design shows it between stops with its own treatment — it is not a stop.
 */
export function BreakRow({ minutes, around, reason, testID }: { minutes: number; around?: string; reason?: string; testID?: string }) {
    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[3]}
            padding={space[3]}
            borderRadius={radius.compact + 2}
            borderWidth={1}
            borderColor="$warningBorder"
            backgroundColor="$warningFill"
        >
            <YStack flex={1}>
                <Body fontSize={13} fontWeight="700" tone="warning">
                    Planned break · {minutes} min
                </Body>
                {(around || reason) && (
                    <Micro tone="warning">
                        {around ? `around ${around}` : ''}
                        {around && reason ? ' · ' : ''}
                        {reason ?? ''}
                    </Micro>
                )}
            </YStack>
        </XStack>
    );
}

/** Account-style row: icon, name, right-hand meta, chevron. */
export function ListRow({
    icon,
    name,
    meta,
    metaTone = 'muted',
    onPress,
    testID,
}: {
    icon?: React.ReactNode;
    name: string;
    meta?: string;
    metaTone?: 'muted' | 'warning' | 'danger' | 'success';
    onPress?: () => void;
    testID?: string;
}) {
    return (
        <XStack
            testID={testID}
            alignItems="center"
            gap={space[3]}
            paddingHorizontal={space[4]}
            paddingVertical={space[3]}
            minHeight={56}
            onPress={onPress}
            pressStyle={{ backgroundColor: '$surfaceRaised' }}
            accessibilityRole="button"
            accessibilityLabel={meta ? `${name}, ${meta}` : name}
        >
            {icon}
            <Body flex={1} fontSize={15}>
                {name}
            </Body>
            {meta ? <Caption tone={metaTone}>{meta}</Caption> : null}
            <Micro fontSize={16}>›</Micro>
        </XStack>
    );
}
