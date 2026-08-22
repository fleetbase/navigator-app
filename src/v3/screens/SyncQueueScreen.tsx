/**
 * Sync queue — gap I1.
 *
 * The queue is the app's promise that work done without signal is not lost.
 * This screen is where that promise is auditable: what is waiting, what failed
 * and why, and what the driver can do about it.
 *
 * Two things it is careful about.
 *
 * **Discarding is destructive and irreversible** — the work is gone, and on a
 * proof-of-delivery capture that means it never happened. So it asks first, and
 * says what will be lost rather than offering a bare "Clear".
 *
 * **A failed item is not the same as a waiting one.** Pending work needs
 * nothing but signal. Failed work has been refused eight times or rejected
 * outright, and will not move on its own — those are the only ones worth the
 * driver's attention, so they are listed first and carry the reason.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useQueue, mutationQueue, type MutationQueue, type QueuedMutation } from '../api';

function relativeAge(createdAt: number, now: number, t: (k: string, o?: Record<string, unknown>) => string): string {
    const minutes = Math.max(0, Math.round((now - createdAt) / 60000));
    if (minutes < 1) return t('sync.justNow');
    if (minutes < 60) return t('sync.minutesAgo', { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('sync.hoursAgo', { count: hours });
    return t('sync.daysAgo', { count: Math.round(hours / 24) });
}

function QueueRow({
    item,
    now,
    onDiscard,
    t,
}: {
    item: QueuedMutation;
    now: number;
    onDiscard: (item: QueuedMutation) => void;
    t: (k: string, o?: Record<string, unknown>) => string;
}) {
    const failed = item.status === 'failed';
    // The key is stored, not the translated string — see describeMutation.
    const label = item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label;

    return (
        <YStack padding={space[3]} gap={space[2]} testID={`queued-${item.id}`}>
            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Body fontSize={15} fontWeight="700" flex={1} numberOfLines={1}>
                    {label}
                </Body>
                {failed ? (
                    <Micro tone="danger" testID={`failed-${item.id}`}>
                        {t('sync.failed')}
                    </Micro>
                ) : item.status === 'syncing' ? (
                    <Micro tone="brand">{t('sync.sending')}</Micro>
                ) : (
                    <Micro>{t('sync.waiting')}</Micro>
                )}
            </XStack>

            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Micro>{relativeAge(item.createdAt, now, t)}</Micro>
                {item.attempts > 0 ? (
                    <Micro tabular testID={`attempts-${item.id}`}>
                        {t('sync.attempts', { count: item.attempts })}
                    </Micro>
                ) : null}
            </XStack>

            {/* Only failed items carry a reason worth reading. */}
            {failed && item.lastError ? (
                <Secondary fontSize={13} testID={`reason-${item.id}`}>
                    {item.lastStatus ? t('sync.rejected', { status: item.lastStatus, message: item.lastError }) : item.lastError}
                </Secondary>
            ) : null}

            {failed ? (
                <Button variant="ghost" onPress={() => onDiscard(item)} testID={`discard-${item.id}`}>
                    {t('sync.discard')}
                </Button>
            ) : null}
        </YStack>
    );
}

export function SyncQueueScreen({ queue = mutationQueue }: { queue?: MutationQueue }) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const snapshot = useQueue(queue);
    const [confirming, setConfirming] = useState<QueuedMutation | null>(null);
    // Captured per render rather than ticking: the ages are coarse, and a timer
    // here would re-render the whole list every second for no benefit.
    const now = Date.now();

    const retry = useCallback(() => {
        queue.retryFailed();
        void queue.flush();
    }, [queue]);

    const discard = useCallback(
        (item: QueuedMutation) => {
            queue.discard(item.id);
            setConfirming(null);
        },
        [queue]
    );

    // Failed first: those are the only ones that will not move on their own.
    const items = [...snapshot.items].sort((a, b) => {
        if ((a.status === 'failed') !== (b.status === 'failed')) return a.status === 'failed' ? -1 : 1;
        return a.createdAt - b.createdAt;
    });

    if (items.length === 0) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="sync-empty">
                <EmptyState title={t('sync.emptyTitle')} body={t('sync.emptyBody')} />
            </YStack>
        );
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="sync-queue">
            {!isOnline ? <Banner tone="neutral" message={t('sync.offlineNotice')} testID="sync-offline" /> : null}

            <YStack gap={space[1]}>
                <Caption testID="sync-summary">
                    {t('sync.summary', { pending: snapshot.pendingCount, failed: snapshot.failedCount })}
                </Caption>
                {snapshot.isFlushing ? <Micro tone="brand" testID="sync-flushing">{t('sync.sendingNow')}</Micro> : null}
            </YStack>

            {confirming ? (
                <Surface padded testID="discard-confirm">
                    <YStack gap={space[3]}>
                        <Body fontSize={15} fontWeight="700">
                            {t('sync.discardTitle')}
                        </Body>
                        {/* Names the work, because "Clear" tells the driver nothing. */}
                        <Secondary fontSize={13}>
                            {t('sync.discardBody', {
                                label: confirming.labelKey ? t(confirming.labelKey, { defaultValue: confirming.label }) : confirming.label,
                            })}
                        </Secondary>
                        <XStack gap={space[2]}>
                            <Button flex={1} variant="ghost" onPress={() => setConfirming(null)} testID="discard-cancel">
                                {t('common.cancel')}
                            </Button>
                            <Button flex={1} variant="destructive" onPress={() => discard(confirming)} testID="discard-confirm-yes">
                                {t('sync.discardConfirm')}
                            </Button>
                        </XStack>
                    </YStack>
                </Surface>
            ) : null}

            <Surface testID="sync-items">
                {items.map((item, i) => (
                    <YStack key={item.id}>
                        {i > 0 ? <Divider /> : null}
                        <QueueRow item={item} now={now} onDiscard={setConfirming} t={t} />
                    </YStack>
                ))}
            </Surface>

            {snapshot.failedCount > 0 ? (
                <Button fullWidth disabled={!isOnline || snapshot.isFlushing} onPress={retry} testID="sync-retry">
                    {t('sync.retryAll')}
                </Button>
            ) : null}

            <Micro testID="sync-explainer">{t('sync.explainer')}</Micro>
        </ScrollView>
    );
}

export default SyncQueueScreen;
