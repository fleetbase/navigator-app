/**
 * Order timeline — R2 frame D5.
 *
 * A chronological log, oldest first, so it reads as progression rather than as
 * a feed. The most recent entry is marked current; completed entries carry the
 * config's own `complete` flag rather than being inferred from position.
 *
 * D5 asks for an actor on each entry. The API does not record one on a tracking
 * status, so the row omits it — see `useOrderTimeline` for why that is a
 * deliberate omission and not an oversight.
 */
import { ScrollView, RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface } from '../ui/Surface';
import { Banner, EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { space, radius } from '../theme/tokens';
import { describeStatus } from '../theme/status';
import { useTranslation } from '../i18n/useTranslation';
import { useOrder, useOrderTimeline, placeOf, displayIdOf, type TrackingStatusEvent } from '../data';
import { useSync } from '../shell';

/** Absolute date + time — a timeline entry needs the day, not just the clock. */
function formatStamp(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
}

function TimelineEntry({
    event,
    isFirst,
    isLast,
    isCurrent,
    t,
}: {
    event: TrackingStatusEvent;
    isFirst: boolean;
    isLast: boolean;
    isCurrent: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
}) {
    const tone = describeStatus(event.code);
    const place = placeOf(event);

    return (
        <XStack gap={space[3]} testID={`timeline-${event.id}`}>
            {/* The rail: a continuous line with this entry's node on it. */}
            <YStack width={20} alignItems="center">
                <YStack width={2} height={space[2]} backgroundColor={isFirst ? '$transparent' : '$border'} />
                <YStack
                    width={isCurrent ? 14 : 10}
                    height={isCurrent ? 14 : 10}
                    borderRadius={radius.pill}
                    backgroundColor={isCurrent ? '$primary' : '$border'}
                    borderWidth={isCurrent ? 3 : 0}
                    borderColor="$primaryGlow"
                />
                <YStack flex={1} width={2} backgroundColor={isLast ? '$transparent' : '$border'} minHeight={space[4]} />
            </YStack>

            <YStack flex={1} paddingBottom={isLast ? 0 : space[4]} gap={space[1]}>
                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                    <StatusPill
                        status={event.code}
                        label={t(tone.labelKey, { defaultValue: event.status ?? tone.defaultLabel })}
                        size="sm"
                    />
                    <Micro tabular>{formatStamp(event.created_at)}</Micro>
                </XStack>

                {event.details ? <Secondary fontSize={13}>{event.details}</Secondary> : null}

                {place ? (
                    <Micro testID={`timeline-place-${event.id}`}>{place}</Micro>
                ) : null}

                {isCurrent ? (
                    <Micro tone="brand" testID="timeline-current">
                        {t('orderTimeline.current')}
                    </Micro>
                ) : null}
            </YStack>
        </XStack>
    );
}

export function OrderTimelineScreen({ orderId }: { orderId: string }) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const order = useOrder(orderId);
    const { events, isLoading, isRefreshing, failed, isEmpty, refresh, error } = useOrderTimeline(orderId);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="timeline-loading">
                <Skeleton height={64} />
                <Skeleton height={200} />
            </YStack>
        );
    }

    // A failure with nothing cached is a dead end; with cached rows it is not.
    if (failed && !events) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="timeline-error">
                <ErrorState
                    title={t('orderTimeline.loadFailed')}
                    body={t('orderTimeline.loadFailedBody')}
                    onRetry={refresh}
                    retryLabel={t('common.retry')}
                />
            </YStack>
        );
    }

    const list = events ?? [];

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space[4], gap: space[4] }}
            testID="order-timeline"
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
        >
            {!isOnline ? <Banner tone="neutral" message={t('orderTimeline.offlineCached')} testID="timeline-offline" /> : null}
            {failed && events ? (
                <Banner
                    tone="warning"
                    message={t('orderTimeline.refreshFailed')}
                    meta={__DEV__ ? (error ?? undefined) : undefined}
                    action={{ label: t('common.retry'), onPress: refresh }}
                    testID="timeline-stale"
                />
            ) : null}

            <YStack gap={space[2]}>
                <Caption>{t('orderTimeline.orderLabel')}</Caption>
                <Identifier value={displayIdOf(order)} boxed={false} />
            </YStack>

            {isEmpty || list.length === 0 ? (
                <EmptyState title={t('orderTimeline.emptyTitle')} body={t('orderTimeline.emptyBody')} testID="timeline-empty" />
            ) : (
                <Surface padded testID="timeline-list">
                    <YStack>
                        {list.map((event, i) => (
                            <TimelineEntry
                                key={event.id ?? i}
                                event={event}
                                isFirst={i === 0}
                                isLast={i === list.length - 1}
                                // Chronological, so the newest is the last row.
                                isCurrent={i === list.length - 1}
                                t={t}
                            />
                        ))}
                    </YStack>
                </Surface>
            )}

            {list.length === 1 ? (
                <Micro testID="timeline-sparse">{t('orderTimeline.sparseNote')}</Micro>
            ) : null}

            <Body fontSize={12} tone="muted">
                {t('orderTimeline.actorUnavailable')}
            </Body>
        </ScrollView>
    );
}

export default OrderTimelineScreen;
