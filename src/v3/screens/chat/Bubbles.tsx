/**
 * What a conversation is drawn from: bubbles, and the lines between them.
 *
 * A message is its attachments first and its words after, each in the shape
 * that suits it: a photo is a picture you can open, a voice message is a play
 * button with its progress, any other file is a row naming the file, a shared
 * position is a row that opens the map. Colour never carries the meaning on
 * its own: my side is also on the right, and every state has a glyph and a word.
 */
import { memo } from 'react';
import { Image, Linking } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Micro } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { formatClock } from '../../format';
import { attachmentKind, locationOfMessage, type ChatAttachment, type ChatMessage } from '../../data';
import { ChatIcon } from './icons';
import { useAudioPlayer } from './AudioPlayer';
import { formatSeconds } from './time';

type T = (key: string, options?: Record<string, unknown>) => string;

const BUBBLE_RADIUS = 18;
const TAIL_RADIUS = 6;
const MAX_WIDTH = 290;

/** Bar heights for a voice message. The server keeps no waveform, so this is a fixed shape, not the sound. */
const BARS = [8, 18, 26, 14, 22, 30, 16, 10, 24, 28, 12, 20, 8, 16, 22, 10, 6];

function open(url?: string | null) {
    if (url) void Linking.openURL(url).catch(() => {});
}

/** The corners of a bubble: square-ish where it meets its sender's edge. */
function corners(mine: boolean) {
    return {
        borderTopLeftRadius: BUBBLE_RADIUS,
        borderTopRightRadius: BUBBLE_RADIUS,
        borderBottomLeftRadius: mine ? BUBBLE_RADIUS : TAIL_RADIUS,
        borderBottomRightRadius: mine ? TAIL_RADIUS : BUBBLE_RADIUS,
    };
}

export function DaySeparator({ label }: { label: string }) {
    return (
        <YStack alignItems="center" paddingVertical={space[2]}>
            <Body fontSize={12} lineHeight={16} fontWeight="700" tone="secondary" accessibilityRole="header">
                {label}
            </Body>
        </YStack>
    );
}

/** A channel event: someone joined, the chat was created. */
export function SystemLine({ text, at }: { text: string; at?: string }) {
    return (
        <YStack alignItems="center" paddingVertical={space[1]} paddingHorizontal={space[4]}>
            <Body fontSize={12} lineHeight={16} fontWeight="600" tone="muted" textAlign="center">
                {at ? `${text} · ${formatClock(at)}` : text}
            </Body>
        </YStack>
    );
}

/**
 * A message the platform wrote into an order's chat: "Drop-off changed". Set
 * apart from both sides, because nobody in the conversation said it.
 */
export function SystemNotice({ text, at, testID }: { text: string; at?: string; testID?: string }) {
    return (
        <YStack alignItems="center" paddingVertical={space[1]} testID={testID}>
            <YStack maxWidth="90%" paddingHorizontal={space[3]} paddingVertical={space[2]} borderRadius={14} borderWidth={1} borderColor="$warningBorder" backgroundColor="$warningFill" gap={2}>
                <Body fontSize={14} lineHeight={20} fontWeight="600" tone="warning" textAlign="center">
                    {text}
                </Body>
                {at ? (
                    <Micro tabular textAlign="center">
                        {formatClock(at)}
                    </Micro>
                ) : null}
            </YStack>
        </YStack>
    );
}

function VoiceBubble({ attachment, mine, t }: { attachment: ChatAttachment; mine: boolean; t: T }) {
    const theme = useTheme();
    const { state, toggle } = useAudioPlayer();
    const url = attachment.url ?? '';
    const isCurrent = !!url && state.url === url;
    const playing = isCurrent && state.playing;
    const failed = !!url && !!state.failed[url];
    const duration = isCurrent ? state.duration : 0;
    const position = isCurrent ? state.position : 0;
    const progress = duration > 0 ? Math.min(1, position / duration) : 0;

    const played = (mine ? theme.onPrimary?.val : theme.primary?.val) as string;
    const rest = (mine ? theme.onPrimary?.val : theme.textMuted?.val) as string;

    if (failed || !url) {
        // This device cannot decode it. Say so, and leave a way to hear it anyway.
        return (
            <XStack
                width={262}
                alignItems="center"
                gap={space[3]}
                padding={10}
                backgroundColor={mine ? '$primary' : '$surfaceRaised'}
                onPress={url ? () => open(url) : undefined}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.voice.cannotPlay')}
                testID={`voice-failed-${attachment.id}`}
                {...corners(mine)}
            >
                <ChatIcon name="file" size={22} color={played} />
                <YStack flex={1}>
                    <Body fontSize={14} lineHeight={19} fontWeight="700" color={mine ? '$onPrimary' : '$textPrimary'}>
                        {t('chat.voice.cannotPlay')}
                    </Body>
                    {url ? (
                        <Body fontSize={13} lineHeight={18} color={mine ? '$onPrimary' : '$textSecondary'}>
                            {t('chat.voice.openInstead')}
                        </Body>
                    ) : null}
                </YStack>
            </XStack>
        );
    }

    return (
        <XStack width={262} alignItems="center" gap={space[3]} paddingVertical={10} paddingLeft={10} paddingRight={14} backgroundColor={mine ? '$primary' : '$surfaceRaised'} {...corners(mine)}>
            <YStack
                width={44}
                height={44}
                borderRadius={22}
                backgroundColor={mine ? '$onPrimary' : '$primary'}
                alignItems="center"
                justifyContent="center"
                onPress={() => toggle(url)}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="button"
                accessibilityLabel={playing ? t('chat.voice.pause') : t('chat.voice.play')}
                testID={`voice-toggle-${attachment.id}`}
            >
                <ChatIcon name={playing ? 'pause' : 'play'} size={18} color={(mine ? theme.primary?.val : theme.onPrimary?.val) as string} />
            </YStack>
            <XStack flex={1} height={32} alignItems="center" gap={3} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {BARS.map((height, i) => {
                    const done = (i + 0.5) / BARS.length <= progress;
                    return <YStack key={i} width={3} height={height} borderRadius={2} backgroundColor={done ? played : rest} opacity={done ? 1 : mine ? 0.45 : 0.6} />;
                })}
            </XStack>
            {/* The length is only known once the file's header has loaded, so it appears on first play. */}
            {isCurrent && duration > 0 ? (
                <Body fontSize={13} lineHeight={18} fontWeight="700" tabular color={mine ? '$onPrimary' : '$textSecondary'}>
                    {formatSeconds(playing || position > 0 ? position : duration)}
                </Body>
            ) : null}
        </XStack>
    );
}

function FileRow({ icon, title, detail, mine, onPress, label, testID }: { icon: 'file' | 'pin'; title: string; detail?: string; mine: boolean; onPress?: () => void; label: string; testID?: string }) {
    const theme = useTheme();
    return (
        <XStack
            maxWidth={MAX_WIDTH}
            alignItems="center"
            gap={space[3]}
            paddingVertical={10}
            paddingHorizontal={12}
            backgroundColor={mine ? '$primary' : '$surfaceRaised'}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={label}
            testID={testID}
            {...corners(mine)}
        >
            <YStack width={36} height={36} borderRadius={10} backgroundColor={mine ? '$primaryDeep' : '$surface'} alignItems="center" justifyContent="center">
                <ChatIcon name={icon} size={18} color={(mine ? theme.onPrimary?.val : theme.textSecondary?.val) as string} />
            </YStack>
            <YStack flexShrink={1}>
                <Body fontSize={15} lineHeight={20} fontWeight="700" color={mine ? '$onPrimary' : '$textPrimary'}>
                    {title}
                </Body>
                {detail ? (
                    <Body fontSize={13} lineHeight={18} tabular color={mine ? '$onPrimary' : '$textSecondary'}>
                        {detail}
                    </Body>
                ) : null}
            </YStack>
        </XStack>
    );
}

export type DeliveryState = 'sent' | 'read' | 'queued';

export interface MessageBubbleProps {
    message: Pick<ChatMessage, 'id' | 'content' | 'attachments' | 'created_at'>;
    mine: boolean;
    /** The line above the first bubble of a run: who is speaking, and their side of the order. */
    author?: string;
    /** Whether to close the run with its time (and, for my messages, its state). */
    showMeta: boolean;
    state?: DeliveryState;
    /** How many others have read it; only meaningful in a room. */
    readBy?: number;
    isGroup?: boolean;
    onOpenImage?: (attachment: ChatAttachment) => void;
    onLongPress?: () => void;
    t: T;
    testID?: string;
}

function MessageBubbleBase({ message, mine, author, showMeta, state, readBy = 0, isGroup, onOpenImage, onLongPress, t, testID }: MessageBubbleProps) {
    const theme = useTheme();
    const attachments = message.attachments ?? [];
    const location = locationOfMessage(message.content);
    const text = location ? '' : (message.content ?? '');
    const hasVoice = attachments.some((a) => attachmentKind(a) === 'audio');
    const muted = theme.textSecondary?.val as string;

    return (
        <YStack alignItems={mine ? 'flex-end' : 'flex-start'} gap={space[1]} testID={testID}>
            {author ? (
                <Body fontSize={12} lineHeight={16} fontWeight="700" tone="secondary" paddingHorizontal={6} testID={testID ? `${testID}-role` : undefined}>
                    {author}
                </Body>
            ) : null}

            <YStack alignItems={mine ? 'flex-end' : 'flex-start'} gap={space[1]} onLongPress={onLongPress}>
                {attachments.map((attachment, i) => {
                    const kind = attachmentKind(attachment);
                    const key = attachment.id ?? String(i);
                    if (kind === 'audio') return <VoiceBubble key={key} attachment={attachment} mine={mine} t={t} />;
                    if (kind === 'image' && attachment.url) {
                        return (
                            <YStack
                                key={key}
                                onPress={onOpenImage ? () => onOpenImage(attachment) : undefined}
                                pressStyle={{ opacity: 0.8 }}
                                accessibilityRole="imagebutton"
                                accessibilityLabel={t('chat.photo.open')}
                                overflow="hidden"
                                borderWidth={1}
                                borderColor="$border"
                                backgroundColor="$surfaceRaised"
                                testID={`attachment-${key}`}
                                {...corners(mine)}
                            >
                                <Image source={{ uri: attachment.url }} style={{ width: 220, height: 165 }} resizeMode="cover" />
                            </YStack>
                        );
                    }
                    return (
                        <FileRow
                            key={key}
                            icon="file"
                            title={attachment.filename ?? t('conversation.attachment')}
                            detail={attachment.url ? t('chat.file.open') : undefined}
                            mine={mine}
                            onPress={attachment.url ? () => open(attachment.url) : undefined}
                            label={`${attachment.filename ?? t('conversation.attachment')}. ${t('chat.file.open')}`}
                            testID={`attachment-${key}`}
                        />
                    );
                })}

                {location ? (
                    <FileRow
                        icon="pin"
                        title={mine ? t('chat.location.mine') : t('chat.location.theirs')}
                        detail={t('chat.location.open')}
                        mine={mine}
                        onPress={() => open(location.url)}
                        label={`${mine ? t('chat.location.mine') : t('chat.location.theirs')}. ${t('chat.location.open')}`}
                        testID={`location-${message.id}`}
                    />
                ) : null}

                {text ? (
                    <YStack maxWidth={MAX_WIDTH} paddingVertical={10} paddingHorizontal={14} backgroundColor={mine ? '$primary' : '$surfaceRaised'} {...corners(mine)}>
                        <Body fontSize={16} lineHeight={22} color={mine ? '$onPrimary' : '$textPrimary'} selectable>
                            {text}
                        </Body>
                    </YStack>
                ) : null}
            </YStack>

            {showMeta ? (
                <XStack alignItems="center" gap={6} paddingHorizontal={6}>
                    {state === 'queued' ? (
                        <>
                            <ChatIcon name="clock" size={13} color={muted} />
                            <Body fontSize={12} lineHeight={16} tone="secondary" testID={testID ? `${testID}-queued` : undefined}>
                                {t('chat.state.queued')}
                            </Body>
                        </>
                    ) : (
                        <>
                            <Body fontSize={12} lineHeight={16} tabular tone="secondary">
                                {[
                                    formatClock(message.created_at),
                                    !mine && hasVoice ? t('chat.voice.label') : undefined,
                                    state === 'read' ? (isGroup ? t('conversation.readBy', { count: readBy }) : t('chat.state.read')) : state === 'sent' ? t('chat.state.sent') : undefined,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Body>
                            {/* One tick sent, two read: the shape says it as well as the word. */}
                            {state === 'read' ? <ChatIcon name="checks" size={12} color={theme.primary?.val as string} strokeWidth={2.6} /> : null}
                            {state === 'sent' ? <ChatIcon name="check" size={12} color={muted} strokeWidth={2.6} /> : null}
                        </>
                    )}
                </XStack>
            ) : null}
        </YStack>
    );
}

export const MessageBubble = memo(MessageBubbleBase);
