/**
 * One chat in the inbox — round 3.
 *
 * Top row: who it is with, what it is about, when it last spoke. Below it an
 * inset strip previews the last message *as what it is*: a voice message is a
 * play glyph and a waveform, a photo is its thumbnail, a file is named, text
 * is the text. An unread chat is marked three ways at once (a count, heavier
 * type, a tinted strip), never by colour alone.
 */
import { memo } from 'react';
import { Image } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { CARD_RADIUS } from '../../onboarding/AuthScaffold';
import { attachmentKind, isGroupChannel, isSystemMessage, messagePreviewKind, type ChatChannelRecord } from '../../data';
import { Avatar } from './Avatar';
import { ChatIcon } from './icons';
import { chatContext, chatName, chatOrderLabel } from './naming';
import { formatChatWhen } from './time';

type T = (key: string, options?: Record<string, unknown>) => string;

const MINI_BARS = [10, 20, 14, 24, 12, 18, 8];

function firstName(name?: string | null): string | undefined {
    return name?.trim().split(/\s+/)[0] || undefined;
}

function ChannelCardBase({ channel, userId, onPress, t }: { channel: ChatChannelRecord; userId?: string; onPress?: () => void; t: T }) {
    const theme = useTheme();
    const unread = Number(channel.unread_count) || 0;
    const group = isGroupChannel(channel);
    const name = chatName(channel, userId, t);
    const order = chatOrderLabel(channel);
    const context = chatContext(channel, userId, t);

    const last = channel.last_message ?? undefined;
    const kind = messagePreviewKind(last);
    const mine = !!userId && last?.sender?.user === userId;
    const attachments = last?.attachments ?? [];
    const photo = attachments.find((a) => attachmentKind(a) === 'image');
    const file = attachments.find((a) => attachmentKind(a) === 'file');

    // "You:" for my own last word; in a room, the speaker's first name. A platform notice has no speaker.
    const speaker = !last || isSystemMessage(last) ? undefined : mine ? t('chat.preview.you') : group ? firstName(last.sender?.name) : undefined;
    const said =
        kind === 'audio'
            ? t('chat.preview.voice')
            : kind === 'image'
              ? last?.content?.trim() || t('chat.preview.photo', { count: attachments.filter((a) => attachmentKind(a) === 'image').length })
              : kind === 'file'
                ? (file?.filename ?? t('chat.preview.file'))
                : kind === 'location'
                  ? t('chat.preview.location')
                  : kind === 'text'
                    ? (last?.content ?? '').trim()
                    : t('inbox.noMessagesYet');
    const preview = speaker && kind !== 'none' ? `${speaker}: ${said}` : said;
    const when = formatChatWhen(last?.created_at ?? channel.updated_at);
    const muted = theme.textSecondary?.val as string;

    return (
        <YStack
            padding={14}
            gap={10}
            borderRadius={CARD_RADIUS}
            backgroundColor="$surface"
            borderWidth={1}
            borderColor={unread ? '$primaryBorder' : '$border'}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole="button"
            accessibilityLabel={[name, order ? t('chat.orderLine', { order: order.label }) : context, preview, when, unread ? t('chat.unreadCount', { count: unread }) : undefined].filter(Boolean).join('. ')}
            testID={`channel-${channel.id}`}
        >
            <XStack alignItems="center" gap={space[3]}>
                <Avatar name={name} seed={channel.id} group={group} />
                <YStack flex={1} gap={2}>
                    <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                        {name}
                    </Body>
                    {order ? (
                        // The identifier is never cut short: it wraps instead.
                        <Body fontSize={13} lineHeight={18} tone="secondary" testID={`channel-order-${channel.id}`}>
                            {t('chat.orderPrefix')}{' '}
                            <Body fontSize={12} lineHeight={18} fontFamily="$mono" tone="secondary">
                                {order.label}
                            </Body>
                        </Body>
                    ) : context ? (
                        <Body fontSize={13} lineHeight={18} tone="secondary" numberOfLines={1}>
                            {context}
                        </Body>
                    ) : null}
                </YStack>
                {when ? (
                    <Body fontSize={13} lineHeight={18} fontWeight={unread ? '700' : '500'} tabular color={unread ? '$primary' : '$textSecondary'} alignSelf="flex-start">
                        {when}
                    </Body>
                ) : null}
            </XStack>

            <XStack alignItems="center" gap={10} height={44} paddingHorizontal={space[3]} borderRadius={14} backgroundColor={unread ? '$primaryFill' : '$surfaceRaised'}>
                {kind === 'audio' ? (
                    <>
                        <YStack width={28} height={28} borderRadius={14} backgroundColor="$primary" alignItems="center" justifyContent="center">
                            <ChatIcon name="play" size={12} color={theme.onPrimary?.val as string} />
                        </YStack>
                        <XStack alignItems="center" gap={3} height={24}>
                            {MINI_BARS.map((height, i) => (
                                <YStack key={i} width={3} height={height} borderRadius={2} backgroundColor="$primary" opacity={0.7} />
                            ))}
                        </XStack>
                    </>
                ) : null}
                {kind === 'image' ? (
                    photo?.url ? (
                        <Image source={{ uri: photo.url }} style={{ width: 28, height: 28, borderRadius: 8 }} />
                    ) : (
                        <YStack width={28} height={28} borderRadius={8} backgroundColor="$border" alignItems="center" justifyContent="center">
                            <ChatIcon name="photo" size={14} color={muted} />
                        </YStack>
                    )
                ) : null}
                {kind === 'file' || kind === 'location' ? (
                    <YStack width={28} height={28} borderRadius={8} backgroundColor="$border" alignItems="center" justifyContent="center">
                        <ChatIcon name={kind === 'file' ? 'file' : 'pin'} size={14} color={muted} />
                    </YStack>
                ) : null}

                <Body flex={1} fontSize={14} lineHeight={19} fontWeight={unread ? '700' : '500'} color={unread ? '$textPrimary' : '$textSecondary'} numberOfLines={1} testID={kind === 'none' ? `no-messages-${channel.id}` : undefined}>
                    {preview}
                </Body>

                {unread ? (
                    <XStack minWidth={22} height={22} paddingHorizontal={6} borderRadius={11} backgroundColor="$primary" alignItems="center" justifyContent="center" testID={`channel-unread-${channel.id}`}>
                        <Body fontSize={12} lineHeight={16} fontWeight="800" color="$onPrimary" tabular>
                            {unread > 99 ? '99+' : unread}
                        </Body>
                    </XStack>
                ) : null}
            </XStack>
        </YStack>
    );
}

export const ChannelCard = memo(ChannelCardBase);
export default ChannelCard;
