/**
 * Chat — the inbox, design round 3 (`Inbox.dc.html`).
 *
 * The screen draws its own header now (the shell has none): the title, a
 * search over the chats already loaded, and the one action, starting a chat.
 * Under it, four filters that each mean something the server can answer:
 *
 *   - **Unread**: `unread_count`, which the API works out for the person asking.
 *   - **Waypoints**: chats linked to an order (`meta.order_public_id`).
 *   - **Groups**: more than two people in the room.
 *
 * There is no "dispatch" chat and no online dot: the platform has neither a
 * built-in dispatch channel nor presence for anyone signed in through this app.
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { FlatList, ScrollView } from '../ui/Scroll';
import { Body, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useTabBarSpace } from '../navigation/TabBar';
import { useChatChannels, channelOrderId, isChannelClosed, isGroupChannel, otherParticipants, type ChatChannelRecord } from '../data';
import { ChannelCard } from './chat/ChannelCard';
import { Entrance } from './chat/Entrance';
import { ChatIcon } from './chat/icons';
import { chatName, chatOrderLabel } from './chat/naming';

type Filter = 'all' | 'unread' | 'waypoints' | 'groups' | 'ended';
const FILTERS: Filter[] = ['all', 'unread', 'waypoints', 'groups'];

function matchesFilter(channel: ChatChannelRecord, filter: Filter): boolean {
    if (filter === 'unread') return (Number(channel.unread_count) || 0) > 0;
    if (filter === 'waypoints') return !!channelOrderId(channel);
    if (filter === 'groups') return isGroupChannel(channel);
    return true;
}

function HeaderButton({ icon, primary, active, label, onPress, testID }: { icon: 'search' | 'plus' | 'close'; primary?: boolean; active?: boolean; label: string; onPress?: () => void; testID: string }) {
    const theme = useTheme();
    return (
        <YStack
            width={44}
            height={44}
            borderRadius={22}
            alignItems="center"
            justifyContent="center"
            backgroundColor={primary ? '$primary' : active ? '$surfaceRaised' : '$surface'}
            borderWidth={primary ? 0 : 1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={{ opacity: 0.6 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={active === undefined ? undefined : { expanded: active }}
            testID={testID}
        >
            <ChatIcon name={icon} size={20} color={(primary ? theme.onPrimary?.val : theme.textPrimary?.val) as string} strokeWidth={primary ? 2.6 : 2.4} />
        </YStack>
    );
}

function FilterChip({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID: string }) {
    return (
        <XStack
            height={36}
            paddingHorizontal={14}
            alignItems="center"
            borderRadius={18}
            // The chosen chip is inverted, so it is told apart by fill as well as by colour.
            backgroundColor={on ? '$textPrimary' : '$transparent'}
            borderWidth={1}
            borderColor={on ? '$textPrimary' : '$border'}
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            testID={testID}
        >
            <Body fontSize={14} lineHeight={18} fontWeight="700" color={on ? '$background' : '$textSecondary'} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

function Empty({ title, body, action, testID }: { title: string; body: string; action?: { label: string; onPress: () => void }; testID: string }) {
    const theme = useTheme();
    return (
        <YStack flex={1} alignItems="center" justifyContent="center" gap={space[3]} paddingHorizontal={space[5]} testID={testID}>
            <YStack width={64} height={64} borderRadius={32} backgroundColor="$surface" borderWidth={1} borderColor="$border" alignItems="center" justifyContent="center">
                <ChatIcon name="send" size={26} color={theme.textSecondary?.val as string} />
            </YStack>
            <Body fontSize={20} lineHeight={26} fontWeight="800" textAlign="center">
                {title}
            </Body>
            <Secondary textAlign="center">{body}</Secondary>
            {action ? (
                <Button marginTop={space[2]} paddingHorizontal={space[5]} onPress={action.onPress} testID={`${testID}-action`}>
                    {action.label}
                </Button>
            ) : null}
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
    const tabBarSpace = useTabBarSpace();
    const { channels: allChannels, isLoading, isRefreshing, failed, error, refresh, retry } = useChatChannels(reloadToken);
    const [filter, setFilter] = useState<Filter>('all');
    // An order's chat ends with the order. Ended chats are kept out of the way, not
    // thrown away: they sit behind their own "Ended" filter, which only appears when
    // there are some.
    const endedCount = useMemo(() => (allChannels ?? []).filter((channel) => isChannelClosed(channel)).length, [allChannels]);
    const channels = useMemo(
        () => (allChannels ? allChannels.filter((channel) => (filter === 'ended' ? isChannelClosed(channel) : !isChannelClosed(channel))) : allChannels),
        [allChannels, filter]
    );

    const [searching, setSearching] = useState(false);
    const [query, setQuery] = useState('');

    const shown = useMemo(() => {
        const needle = searching ? query.trim().toLowerCase() : '';
        return (channels ?? []).filter((channel) => {
            if (!matchesFilter(channel, filter)) return false;
            if (!needle) return true;
            // What a driver would remember a chat by: its name, who is in it, its order, the last thing said.
            const haystack = [
                chatName(channel, userId, t),
                channel.name,
                ...otherParticipants(channel, userId).map((p) => p.name),
                chatOrderLabel(channel)?.label,
                channel.last_message?.content,
            ];
            return haystack.some((value) => typeof value === 'string' && value.toLowerCase().includes(needle));
        });
    }, [channels, filter, query, searching, t, userId]);

    const renderItem = useCallback(
        ({ item, index }: { item: ChatChannelRecord; index: number }) => (
            <Entrance index={index}>
                <ChannelCard channel={item} userId={userId} t={t} onPress={onOpenChannel ? () => onOpenChannel(item) : undefined} />
            </Entrance>
        ),
        [onOpenChannel, t, userId]
    );

    const toggleSearch = useCallback(() => {
        setSearching((on) => !on);
        setQuery('');
    }, []);

    const header = (
        <YStack>
            <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={space[4]} paddingTop={space[2]} paddingBottom={space[3]}>
                <Body fontSize={30} lineHeight={36} fontWeight="800" letterSpacing={-0.6} accessibilityRole="header" testID="inbox-title">
                    {t('chat.title')}
                </Body>
                <XStack gap={space[2]}>
                    <HeaderButton icon={searching ? 'close' : 'search'} active={searching} label={searching ? t('chat.search.close') : t('chat.search.open')} onPress={toggleSearch} testID="inbox-search-toggle" />
                    {onCompose ? <HeaderButton icon="plus" primary label={t('chat.newChat')} onPress={onCompose} testID="inbox-compose" /> : null}
                </XStack>
            </XStack>

            {searching ? (
                <YStack paddingHorizontal={space[4]} paddingBottom={space[3]}>
                    <Field value={query} onChangeText={setQuery} placeholder={t('chat.search.placeholder')} autoCapitalize="none" testID="inbox-search" />
                </YStack>
            ) : null}
        </YStack>
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" testID="inbox-loading">
                {header}
                <YStack paddingHorizontal={space[4]} gap={space[2]}>
                    <Skeleton height={124} borderRadius={18} />
                    <Skeleton height={124} borderRadius={18} />
                    <Skeleton height={124} borderRadius={18} />
                </YStack>
            </YStack>
        );
    }

    if (failed && !channels) {
        return (
            <YStack flex={1} backgroundColor="$background" testID="inbox-error">
                {header}
                <YStack flex={1} padding={space[4]} paddingBottom={tabBarSpace} justifyContent="center">
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="inbox-error" />
                </YStack>
            </YStack>
        );
    }

    const hasChats = (allChannels ?? []).length > 0;
    const narrowed = filter !== 'all' || (searching && query.trim().length > 0);

    return (
        <YStack flex={1} backgroundColor="$background" testID="inbox-screen">
            {header}

            {/* Filters only once there is something to filter. */}
            {hasChats ? (
                <YStack paddingBottom={space[3]}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4] }} testID="inbox-filters">
                        {FILTERS.map((key) => (
                            <FilterChip key={key} label={t(`chat.filters.${key}`)} on={filter === key} onPress={() => setFilter(key)} testID={`inbox-filter-${key}`} />
                        ))}
                        {endedCount > 0 ? <FilterChip label={t('chat.filters.ended', { count: endedCount })} on={filter === 'ended'} onPress={() => setFilter('ended')} testID="inbox-filter-ended" /> : null}
                    </ScrollView>
                </YStack>
            ) : null}

            <FlatList
                data={shown}
                keyExtractor={(c) => c.id}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                ItemSeparatorComponent={Gap}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingBottom: tabBarSpace }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListEmptyComponent={
                    hasChats && narrowed ? (
                        <Empty testID="inbox-no-matches" title={t('chat.empty.noMatchesTitle')} body={t('chat.empty.noMatchesBody')} action={{ label: t('chat.empty.showAll'), onPress: () => { setFilter('all'); setQuery(''); setSearching(false); } }} />
                    ) : (
                        <Empty testID="inbox-empty" title={t('chat.empty.title')} body={t('chat.empty.body')} action={onCompose ? { label: t('chat.newChat'), onPress: onCompose } : undefined} />
                    )
                }
                testID="inbox-list"
            />
        </YStack>
    );
}

function Gap() {
    return <YStack height={space[2]} />;
}

export default InboxScreen;
