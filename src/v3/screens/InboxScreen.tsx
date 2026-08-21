/**
 * Inbox — the channel list behind R1 frame s11.
 *
 * A channel's stored title is every participant's name joined together,
 * including the driver's own, so it is rebuilt from the other participants —
 * reading "Ron, Charlotte, Isabella" in Ron's own inbox is noise.
 */
import { useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useChatChannels, channelTitle, otherParticipants, type ChatChannelRecord } from '../data';
import { formatClock } from '../format';

function UnreadDot({ count }: { count: number }) {
    return (
        <XStack
            minWidth={22}
            height={22}
            paddingHorizontal={space[2]}
            borderRadius={radius.pill}
            backgroundColor="$primary"
            alignItems="center"
            justifyContent="center"
        >
            <Micro color="$onPrimary" fontWeight="800" tabular>
                {count > 99 ? '99+' : count}
            </Micro>
        </XStack>
    );
}

function ChannelRow({
    channel,
    userId,
    onPress,
    t,
}: {
    channel: ChatChannelRecord;
    userId?: string;
    onPress?: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}) {
    const unread = Number(channel.unread_count) || 0;
    const title = channelTitle(channel, userId, t('inbox.untitled'));
    const preview = channel.last_message?.content;
    const others = otherParticipants(channel, userId);

    return (
        <YStack padding={space[3]} gap={space[2]} onPress={onPress} pressStyle={onPress ? { opacity: 0.7 } : undefined} testID={`channel-${channel.id}`}>
            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Body fontSize={15} fontWeight={unread ? '800' : '700'} flex={1} numberOfLines={1}>
                    {title}
                </Body>
                {unread ? <UnreadDot count={unread} /> : null}
            </XStack>

            {preview ? (
                <Secondary fontSize={13} numberOfLines={1}>
                    {preview}
                </Secondary>
            ) : (
                <Micro testID={`no-messages-${channel.id}`}>{t('inbox.noMessagesYet')}</Micro>
            )}

            <XStack justifyContent="space-between" alignItems="center">
                <Micro>{t('inbox.peopleCount', { count: others.length })}</Micro>
                <Micro tabular>{formatClock(channel.last_message?.created_at ?? channel.updated_at)}</Micro>
            </XStack>
        </YStack>
    );
}

export function InboxScreen({
    userId,
    reloadToken,
    onOpenChannel,
    onCompose,
}: {
    userId?: string;
    reloadToken?: number;
    onOpenChannel?: (channel: ChatChannelRecord) => void;
    onCompose?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { channels, isLoading, isRefreshing, failed, error, refresh, retry } = useChatChannels(reloadToken);

    const renderItem = useCallback(
        ({ item }: { item: ChatChannelRecord }) => (
            <Surface marginBottom={space[3]}>
                <ChannelRow channel={item} userId={userId} t={t} onPress={onOpenChannel ? () => onOpenChannel(item) : undefined} />
            </Surface>
        ),
        [onOpenChannel, t, userId]
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="inbox-loading">
                <Skeleton height={88} />
                <Skeleton height={88} />
                <Skeleton height={88} />
            </YStack>
        );
    }

    if (failed && !channels) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="inbox-error">
                <ErrorState
                    title={t('inbox.loadFailed')}
                    body={error?.isTransport ? t('inbox.loadFailedBody') : error?.message}
                    onRetry={retry}
                    retryLabel={t('common.retry')}
                />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="inbox-screen">
            <YStack paddingHorizontal={space[4]} paddingTop={space[3]} gap={space[3]}>
                {!isOnline ? <Banner tone="neutral" message={t('inbox.offlineNotice')} testID="inbox-offline" /> : null}
                {onCompose ? (
                    <Button fullWidth onPress={onCompose} testID="inbox-compose">
                        {t('inbox.newConversation')}
                    </Button>
                ) : null}
            </YStack>

            <FlatList
                data={channels ?? []}
                keyExtractor={(c) => c.id}
                renderItem={renderItem}
                contentContainerStyle={channels?.length ? { padding: space[4] } : { flexGrow: 1, padding: space[4] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListEmptyComponent={
                    <YStack flex={1} justifyContent="center">
                        <EmptyState
                            testID="inbox-empty"
                            title={t('inbox.emptyTitle')}
                            body={t('inbox.emptyBody')}
                            action={onCompose ? { label: t('inbox.newConversation'), onPress: onCompose } : undefined}
                        />
                    </YStack>
                }
            />
        </YStack>
    );
}

export default InboxScreen;
