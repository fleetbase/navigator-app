/**
 * Waiting to send — design round 3 (`Sync.dc.html`), gap I1.
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
 * driver's attention, so they are listed first, carry the reason, and are
 * marked with a square "!" where waiting ones get a round "…".
 *
 * The mockup's third figure, "last sent 14:21", is not here: the queue does not
 * record when it last got something through, and a made-up time would be worse
 * than none.
 */
import { useCallback, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Button } from '../ui/Button';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useQueue, mutationQueue, type MutationQueue, type QueuedMutation } from '../api';
import { ACTION_RADIUS, BigButton } from '../onboarding/AuthScaffold';
import { Card, CARD_PAD, Icon, Screen, Section, SmallButton, Tile } from './me/parts';

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
    first,
    onDiscard,
    t,
}: {
    item: QueuedMutation;
    now: number;
    first: boolean;
    onDiscard: (item: QueuedMutation) => void;
    t: (k: string, o?: Record<string, unknown>) => string;
}) {
    const failed = item.status === 'failed';
    // The key is stored, not the translated string — see describeMutation.
    const label = item.labelKey ? t(item.labelKey, { defaultValue: item.label }) : item.label;
    const state = failed ? t('sync.failed') : item.status === 'syncing' ? t('sync.sending') : t('sync.waiting');

    return (
        <XStack
            alignItems="center"
            gap={space[3]}
            minHeight={68}
            paddingVertical={10}
            paddingHorizontal={CARD_PAD}
            borderTopWidth={first ? 0 : 1}
            borderTopColor="$border"
            backgroundColor={failed ? '$dangerFill' : '$transparent'}
            testID={`queued-${item.id}`}
        >
            {/* Square with "!" for the ones that need the driver, round with "…" for the ones that only need signal. */}
            <YStack width={32} height={32} borderRadius={failed ? 6 : 16} backgroundColor={failed ? '$danger' : '$surfaceRaised'} alignItems="center" justifyContent="center">
                <Body fontSize={15} fontWeight="800" color={failed ? '$background' : '$textSecondary'}>
                    {failed ? '!' : '…'}
                </Body>
            </YStack>
            <YStack flex={1} gap={2} minWidth={0}>
                <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                    {label}
                </Body>
                <Secondary fontSize={13} tabular numberOfLines={1}>
                    <Secondary fontSize={13} fontWeight="700" tone={failed ? 'danger' : item.status === 'syncing' ? 'brand' : 'secondary'} testID={failed ? `failed-${item.id}` : undefined}>
                        {state}
                    </Secondary>
                    {' · '}
                    {relativeAge(item.createdAt, now, t)}
                    {item.attempts > 0 ? ' · ' : ''}
                    {item.attempts > 0 ? <Secondary fontSize={13} testID={`attempts-${item.id}`}>{t('sync.attempts', { count: item.attempts })}</Secondary> : null}
                </Secondary>
                {/* Only failed items carry a reason worth reading. */}
                {failed && item.lastError ? (
                    <Secondary fontSize={13} lineHeight={18} testID={`reason-${item.id}`}>
                        {item.lastStatus ? t('sync.rejected', { status: item.lastStatus, message: item.lastError }) : item.lastError}
                    </Secondary>
                ) : null}
            </YStack>
            {failed ? <SmallButton tone="danger" height={40} label={t('sync.discard')} onPress={() => onDiscard(item)} testID={`discard-${item.id}`} /> : null}
        </XStack>
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
            <Screen testID="sync-empty">
                <YStack flex={1} alignItems="center" justifyContent="center" gap={space[3]} paddingVertical={space[6]}>
                    <YStack width={72} height={72} borderRadius={36} backgroundColor="$successFill" borderWidth={1} borderColor="$successBorder" alignItems="center" justifyContent="center">
                        <Icon name="tick" size={32} color="successText" strokeWidth={3} />
                    </YStack>
                    <Body fontSize={20} fontWeight="800" center>
                        {t('sync.emptyTitle')}
                    </Body>
                    <Secondary fontSize={15} lineHeight={22} center>
                        {t('sync.emptyBody')}
                    </Secondary>
                </YStack>
            </Screen>
        );
    }

    const headline = !isOnline ? t('me.sync.offlineTitle') : snapshot.isFlushing ? t('sync.sendingNow') : snapshot.failedCount > 0 ? t('me.sync.needsYouTitle') : t('me.sync.waitingTitle');
    const body = !isOnline ? t('me.sync.offlineBody') : snapshot.failedCount > 0 && !snapshot.isFlushing ? t('me.sync.needsYouBody') : t('sync.explainer');

    return (
        <Screen
            testID="sync-queue"
            footer={
                <>
                    <BigButton variant={isOnline ? 'primary' : 'secondary'} disabled={!isOnline || snapshot.isFlushing} loading={isOnline && snapshot.isFlushing} onPress={retry} testID="sync-retry">
                        {isOnline ? t('me.sync.sendNow') : t('me.sync.sendNowNoSignal')}
                    </BigButton>
                    <Secondary fontSize={13} center testID="sync-explainer">
                        {t('sync.explainer')}
                    </Secondary>
                </>
            }
        >
            <Card flexDirection="row" alignItems="center" gap={14} paddingVertical={space[4]} testID={!isOnline ? 'sync-offline' : 'sync-status'}>
                {/* Signal bars: one lit when there is none, all four when there is. */}
                <XStack width={52} height={52} borderRadius={16} backgroundColor="$surfaceRaised" alignItems="flex-end" justifyContent="center" gap={4} paddingBottom={14}>
                    {[8, 14, 20, 26].map((height, i) => (
                        <YStack key={height} width={5} height={height} borderRadius={2} backgroundColor={isOnline || i === 0 ? '$textSecondary' : '$border'} />
                    ))}
                </XStack>
                <YStack flex={1} gap={2}>
                    <Body fontSize={18} fontWeight="800" testID={snapshot.isFlushing ? 'sync-flushing' : undefined}>
                        {headline}
                    </Body>
                    <Secondary fontSize={14} lineHeight={20}>
                        {body}
                    </Secondary>
                </YStack>
            </Card>

            <XStack gap={space[2]} testID="sync-summary">
                <Tile>
                    <Body fontSize={24} fontWeight="800" tabular>
                        {snapshot.pendingCount}
                    </Body>
                    <Secondary fontSize={12}>{t('me.sync.waiting')}</Secondary>
                </Tile>
                {/* Absent, not zero, when nothing needs the driver. */}
                {snapshot.failedCount > 0 ? (
                    <Tile tone="danger">
                        <Body fontSize={24} fontWeight="800" tone="danger" tabular>
                            {snapshot.failedCount}
                        </Body>
                        <Secondary fontSize={12}>{t('me.sync.needsYou')}</Secondary>
                    </Tile>
                ) : null}
            </XStack>

            {confirming ? (
                <Card gap={space[3]} testID="discard-confirm">
                    <Body fontSize={17} fontWeight="800">
                        {t('sync.discardTitle')}
                    </Body>
                    {/* Names the work, because "Clear" tells the driver nothing. */}
                    <Secondary fontSize={14} lineHeight={20}>
                        {t('sync.discardBody', {
                            label: confirming.labelKey ? t(confirming.labelKey, { defaultValue: confirming.label }) : confirming.label,
                        })}
                    </Secondary>
                    <XStack gap={space[2]}>
                        <Button flex={1} height={52} borderRadius={ACTION_RADIUS} variant="secondary" onPress={() => setConfirming(null)} testID="discard-cancel">
                            {t('common.cancel')}
                        </Button>
                        <Button flex={1} height={52} borderRadius={ACTION_RADIUS} variant="destructive" onPress={() => discard(confirming)} testID="discard-confirm-yes">
                            {t('sync.discardConfirm')}
                        </Button>
                    </XStack>
                </Card>
            ) : null}

            <Section title={t('me.sync.onThisPhone')}>
                <Card flush testID="sync-items">
                    {items.map((item, i) => (
                        <QueueRow key={item.id} item={item} now={now} first={i === 0} onDiscard={setConfirming} t={t} />
                    ))}
                </Card>
            </Section>
        </Screen>
    );
}

export default SyncQueueScreen;
