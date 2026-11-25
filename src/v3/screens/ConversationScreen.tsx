/**
 * A conversation — design round 3 (`Chat.dc.html`, `Attach.dc.html`, `Record.dc.html`).
 *
 * The server already interleaves channel events and messages into one ordered
 * `feed`, so the screen's job is to lay that out the way people read a chat:
 * days apart, a sender's run of messages together, the time once per run, and
 * for my own messages whether they were read (the API returns each message's
 * `receipts`).
 *
 * What a message can carry is what the API can carry:
 *
 *   - **Text**, sent through the offline queue like every other mutation; a
 *     message written without signal shows in the conversation as waiting.
 *   - **Photos**, uploaded first (`POST files/base64`) and attached by file id.
 *     An upload cannot queue (the message needs the id), so photos need signal.
 *   - **Voice messages**: hold the microphone to record; uploaded like a photo
 *     and attached by file id, so they need signal too. Played back in place.
 *     See `chat/voice.ts`.
 *   - **Where I am**: a text message holding a map link, because the chat API
 *     has no location type. Drawn as a location row on this side.
 *
 * Opening the conversation marks what is in it as read, which is what brings
 * the inbox count and the tab badge back down.
 *
 * Order chats carry `meta.order_public_id` on the channel and a `role` on each
 * participant (customer / driver / store / system). The header links to the
 * order, each run of messages says which side wrote it, and messages the
 * platform wrote (`meta.system`) are notices rather than someone talking.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, PermissionsAndroid, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Input as TamaguiInput, XStack, YStack, styled, useTheme } from 'tamagui';
import type { Asset, ImagePickerResponse } from 'react-native-image-picker';
import { FlatList, ScrollView } from '../ui/Scroll';
import { Body } from '../ui/Text';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation } from '../shell';
import { openSettings } from '../permissions/permissions';
import {
    useChatChannel,
    useSendMessage,
    useMarkChannelRead,
    useDeleteMessage,
    useOrder,
    myParticipant,
    otherParticipants,
    participantRole,
    isSystemMessage,
    isGroupChannel,
    isChannelClosed,
    readersOf,
    locationMessageContent,
    payloadOf,
    type ChatAttachment,
    type ChatChannelRecord,
    type ChatMessage,
    type FeedEntry,
} from '../data';
import { useUploadFile, type UploadedFile } from '../data/useFiles';
import { Avatar } from './chat/Avatar';
import { AttachSheet } from './chat/AttachSheet';
import { AudioPlayerProvider } from './chat/AudioPlayer';
import { DaySeparator, MessageBubble, SystemLine, SystemNotice, type DeliveryState } from './chat/Bubbles';
import { ChatIcon } from './chat/icons';
import { ImagePreview } from './chat/ImagePreview';
import { chatContext, chatName, chatOrderLabel } from './chat/naming';
import { RecordPanel, useHoldToRecord, type RecordRefusal } from './chat/Recording';
import { voiceRecorder } from './chat/recorder';
import { dayKeyOf, dayLabelOf } from './chat/time';
import { VOICE_RECORDING_ENABLED, type VoiceRecording } from './chat/voice';

type T = (key: string, options?: Record<string, unknown>) => string;

/* Loaded when the driver first asks for a photo, so opening a chat never touches the picker's native module. */
const picker = () => require('react-native-image-picker') as typeof import('react-native-image-picker');

/** Whether this build can record at all: the browser build has no recorder, and draws no microphone. */
const CAN_RECORD = VOICE_RECORDING_ENABLED && !!voiceRecorder;

/** What the line above the composer can be saying about an attachment or a recording. */
type AttachNotice = 'needs-connection' | 'failed' | 'no-camera' | 'no-microphone' | 'cannot-record' | 'voice-needs-connection' | 'voice-failed';

const ATTACH_NOTICE_KEYS: Record<AttachNotice, string> = {
    'needs-connection': 'conversation.attachmentsNeedConnection',
    failed: 'conversation.attachmentFailed',
    'no-camera': 'chat.attach.noCamera',
    'no-microphone': 'chat.record.noMicrophone',
    'cannot-record': 'chat.record.cannotRecord',
    'voice-needs-connection': 'chat.record.needsConnection',
    'voice-failed': 'chat.record.notSent',
};

/** The three things a driver says most. */
const QUICK_REPLY_KEYS = ['onMyWay', 'runningLate', 'arrived'] as const;

/** Messages from one sender this close together read as one thought. */
const RUN_GAP_MS = 5 * 60_000;

/** Long enough for the sheet to finish closing; iOS will not present the picker over a modal that is still leaving. */
const SHEET_CLOSE_MS = 450;

/** "Store", "Customer", "Driver", "You" — the side of an order chat a message came from. */
export function roleLabel(role: string | undefined, mine: boolean, t: (key: string) => string): string | undefined {
    if (mine) return role ? t('conversation.role.you') : undefined;
    if (role === 'store' || role === 'customer' || role === 'driver') return t(`conversation.role.${role}`);
    return undefined;
}

const ComposerInput = styled(TamaguiInput, {
    name: 'ChatComposerInput',
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '$border',
    backgroundColor: '$surface',
    paddingHorizontal: space[4],
    paddingVertical: 12,
    fontFamily: '$body',
    fontSize: 16,
    color: '$textPrimary',
    focusStyle: { borderColor: '$primary', outlineWidth: 0 },
});

/** A message written without signal, shown until the server's copy arrives. */
interface WaitingMessage {
    id: string;
    content: string;
    created_at: string;
    attachments?: ChatAttachment[];
}

/** How far the phone's clock and the server's may disagree before a waiting message is no longer recognised as arrived. */
const CLOCK_SLACK_MS = 2 * 60_000;

type Row =
    | { key: string; kind: 'day'; label: string }
    | { key: string; kind: 'log'; text: string; at?: string }
    | { key: string; kind: 'notice'; id: string; text: string; at?: string }
    | { key: string; kind: 'message'; message: ChatMessage; mine: boolean; author?: string; showMeta: boolean; state?: DeliveryState; readBy: number; deletable: boolean };

function buildRows(feed: FeedEntry[], waiting: WaitingMessage[], userId: string | undefined, isGroup: boolean, t: T): Row[] {
    // Oldest first, so the newest sits at the bottom where a chat belongs.
    const entries = [...feed].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
    const rows: Row[] = [];
    let day = '';
    const now = new Date();

    const openDay = (at?: string) => {
        const key = dayKeyOf(at);
        if (!key || key === day) return;
        day = key;
        const label = dayLabelOf(at, now);
        rows.push({ key: `day-${key}`, kind: 'day', label: label === 'today' ? t('chat.day.today') : label === 'yesterday' ? t('chat.day.yesterday') : label });
    };

    entries.forEach((entry, index) => {
        const at = entry.created_at ?? entry.data?.created_at;
        const id = entry.data?.id ?? String(index);

        if (entry.type === 'log') {
            // `content` still carries "{subject.0.name}" placeholders; only the resolved form is fit to show.
            const text = entry.data.resolved_content ?? entry.data.content ?? '';
            if (!text) return;
            openDay(at);
            rows.push({ key: `log-${id}`, kind: 'log', text, at });
            return;
        }

        if (entry.type === 'attachment') {
            // A file dropped into the channel on its own, with no message around it. The API does not say who sent it.
            openDay(at);
            rows.push({
                key: `attachment-${id}`,
                kind: 'message',
                message: { id, attachments: [entry.data as unknown as ChatAttachment], created_at: at },
                mine: false,
                showMeta: true,
                readBy: 0,
                deletable: false,
            });
            return;
        }

        if (entry.type !== 'message') return;
        const message = entry.data as ChatMessage;

        if (isSystemMessage(message)) {
            if (!message.content) return;
            openDay(at);
            rows.push({ key: `notice-${id}`, kind: 'notice', id, text: message.content, at });
            return;
        }

        openDay(at);
        const mine = !!userId && message.sender?.user === userId;
        const readers = readersOf(message).length;
        const role = roleLabel(participantRole(message.sender), false, t);
        rows.push({
            key: `message-${id}`,
            kind: 'message',
            message: { ...message, created_at: at },
            mine,
            // In a one-to-one chat the header already says who is talking.
            author: !mine && (isGroup || role) ? [message.sender?.name, role].filter(Boolean).join(' · ') || undefined : undefined,
            showMeta: true,
            state: mine ? (readers > 0 ? 'read' : 'sent') : undefined,
            readBy: readers,
            deletable: mine,
        });
    });

    // Fold runs: one author line at the top of a run, one time at its foot.
    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const next = rows[i + 1];
        if (row.kind !== 'message' || next?.kind !== 'message') continue;
        const sameSender = !!row.message.sender?.id && row.message.sender.id === next.message.sender?.id;
        const close = Math.abs(new Date(next.message.created_at ?? 0).getTime() - new Date(row.message.created_at ?? 0).getTime()) < RUN_GAP_MS;
        if (sameSender && close) {
            row.showMeta = false;
            next.author = undefined;
        }
    }

    for (const message of waiting) {
        rows.push({ key: message.id, kind: 'message', message, mine: true, showMeta: true, state: 'queued', readBy: 0, deletable: false });
    }
    return rows;
}

function RoundControl({
    icon,
    size = 48,
    primary,
    disabled,
    label,
    onPress,
    testID,
}: {
    icon: 'plus' | 'send' | 'mic' | 'phone';
    size?: number;
    primary?: boolean;
    disabled?: boolean;
    label: string;
    onPress?: () => void;
    testID: string;
}) {
    const theme = useTheme();
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={size / 2}
            alignItems="center"
            justifyContent="center"
            backgroundColor={primary ? '$primary' : '$surface'}
            borderWidth={primary ? 0 : 1}
            borderColor="$border"
            opacity={disabled ? 0.4 : 1}
            onPress={disabled ? undefined : onPress}
            pressStyle={disabled ? undefined : { opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            testID={testID}
        >
            <ChatIcon name={icon} size={primary ? 24 : 22} color={(primary ? theme.onPrimary?.val : theme.textPrimary?.val) as string} strokeWidth={primary ? 2.2 : 2.4} />
        </YStack>
    );
}

export function ConversationScreen({
    channelId,
    channel: seed,
    userId,
    onOpenOrder,
    onBack,
}: {
    channelId?: string;
    channel?: ChatChannelRecord | null;
    userId?: string;
    /** Opens the order this chat is about. Without it the order line is shown but not tappable. */
    onOpenOrder?: (orderId: string) => void;
    /** Given when the screen owns the whole header (no title bar above it): draws the back control in the identity row. */
    onBack?: () => void;
}) {
    const { t } = useTranslation();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const listRef = useRef<FlatList<Row>>(null);

    const { channel, isLoading, isBlocked, error, reload } = useChatChannel(channelId, seed);
    const me = myParticipant(channel, userId);
    const { deliver, isSending, error: sendError, clearError } = useSendMessage(channelId, me?.id);
    const { upload, isUploading } = useUploadFile();
    const { remove } = useDeleteMessage();
    useMarkChannelRead(channel, me?.id, isOnline);

    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState<{ file: UploadedFile; uri?: string }[]>([]);
    const [waiting, setWaiting] = useState<WaitingMessage[]>([]);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [attachNotice, setAttachNotice] = useState<AttachNotice | null>(null);

    const order = chatOrderLabel(channel);
    const orderRecord = useOrder(order?.orderId);
    const isGroup = isGroupChannel(channel);
    const closed = isChannelClosed(channel);

    /*
     * KeyboardAvoidingView pads by how far the keyboard overlaps its own frame,
     * but it reads that frame relative to its parent, and this screen starts
     * below the status bar and the title bar. The offset is that distance.
     */
    const frameRef = useRef<View>(null);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const measure = useCallback(() => {
        frameRef.current?.measureInWindow((_x, y) => {
            if (Number.isFinite(y)) setKeyboardOffset(y);
        });
    }, []);

    /*
     * A waiting message has arrived once the feed holds my own copy of it: the
     * same words, sent no earlier than it was written. Each server message can
     * stand in for one waiting message only, so two identical quick replies do
     * not both vanish when the first lands.
     */
    useEffect(() => {
        if (!waiting.length || !channel?.feed) return;
        const arrived = channel.feed
            .filter((e) => e.type === 'message' && !!userId && e.data?.sender?.user === userId)
            .map((e) => ({ content: (e.data.content ?? '').trim(), at: new Date(e.created_at ?? e.data.created_at ?? 0).getTime(), used: false }));
        const left = waiting.filter((w) => {
            const match = arrived.find((m) => !m.used && m.content === w.content.trim() && m.at >= new Date(w.created_at).getTime() - CLOCK_SLACK_MS);
            if (match) match.used = true;
            return !match;
        });
        if (left.length !== waiting.length) setWaiting(left);
    }, [channel, userId, waiting]);

    const rows = useMemo(() => buildRows(channel?.feed ?? [], waiting, userId, isGroup, t), [channel, waiting, userId, isGroup, t]);

    const submit = useCallback(
        async (text: string, { files, fromDraft }: { files?: { file: UploadedFile; uri?: string }[]; fromDraft?: boolean } = {}) => {
            const body = text.trim();
            const attached = files ?? (fromDraft ? pending : []);
            if (!body && !attached.length) return;
            const writtenAt = new Date().toISOString();
            if (fromDraft) {
                // Cleared straight away so a second tap cannot send it twice.
                setDraft('');
                setPending([]);
            }

            const outcome = await deliver(
                body,
                attached.map((a) => a.file.id)
            );
            if (outcome.kind === 'sent') {
                // Cheapest correct refresh: the feed is assembled server-side.
                await reload();
            } else if (outcome.kind === 'queued') {
                // No signal: it is saved on the device, and shown in the conversation as waiting.
                setWaiting((current) => [
                    ...current,
                    {
                        id: `waiting-${writtenAt}`,
                        content: body,
                        created_at: writtenAt,
                        attachments: attached.map((a) => ({ id: a.file.id, url: a.uri ?? a.file.url, filename: a.file.original_filename, content_type: a.file.content_type })),
                    },
                ]);
            } else if (outcome.kind === 'failed' && fromDraft) {
                // Refused: hand the words and photos back rather than losing them.
                setDraft((current) => current || body);
                setPending((current) => (current.length ? current : attached));
            }
        },
        [deliver, pending, reload]
    );

    const addAssets = useCallback(
        async (response: ImagePickerResponse) => {
            if (response.didCancel) return;
            if (response.errorCode) {
                setAttachNotice(response.errorCode === 'camera_unavailable' || response.errorCode === 'permission' ? 'no-camera' : 'failed');
                return;
            }
            for (const asset of (response.assets ?? []) as Asset[]) {
                if (!asset.base64) continue;
                const outcome = await upload({
                    base64: asset.base64,
                    fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
                    contentType: asset.type ?? 'image/jpeg',
                    fileType: 'image',
                });
                if (outcome.kind === 'uploaded') setPending((current) => [...current, { file: outcome.file, uri: asset.uri }]);
                else {
                    setAttachNotice(outcome.kind === 'needs-connection' ? 'needs-connection' : 'failed');
                    break;
                }
            }
        },
        [upload]
    );

    /* Sized for a phone screen and a mobile connection: the bytes travel as base64 inside a JSON body. */
    const photoOptions = { mediaType: 'photo' as const, includeBase64: true, maxWidth: 1600, maxHeight: 1600, quality: 0.7 as const };

    const fromSheet = useCallback((action: () => void) => {
        setSheetOpen(false);
        setAttachNotice(null);
        setTimeout(action, SHEET_CLOSE_MS);
    }, []);

    const takePhoto = useCallback(
        () =>
            fromSheet(async () => {
                try {
                    // The manifest declares CAMERA (for the scanner), and Android then refuses the system camera until it is granted.
                    if (Platform.OS === 'android') {
                        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
                        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                            setAttachNotice('no-camera');
                            return;
                        }
                    }
                    await addAssets(await picker().launchCamera({ ...photoOptions, saveToPhotos: false }));
                } catch {
                    setAttachNotice('failed');
                }
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [addAssets, fromSheet]
    );

    const pickPhotos = useCallback(
        () =>
            fromSheet(async () => {
                try {
                    await addAssets(await picker().launchImageLibrary({ ...photoOptions, selectionLimit: 6 }));
                } catch {
                    setAttachNotice('failed');
                }
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [addAssets, fromSheet]
    );

    const shareLocation = useCallback(() => {
        setSheetOpen(false);
        if (position) void submit(locationMessageContent(position.latitude, position.longitude));
    }, [position, submit]);

    const sendRecording = useCallback(
        async (recording: VoiceRecording) => {
            setAttachNotice(null);
            // The server stores the name and content type it is given, and those are what mark the attachment as a voice message.
            const outcome = await upload({ base64: recording.base64, fileName: recording.fileName, contentType: recording.contentType, fileType: 'audio' });
            if (outcome.kind === 'uploaded') await submit('', { files: [{ file: outcome.file }] });
            else setAttachNotice(outcome.kind === 'needs-connection' ? 'voice-needs-connection' : 'voice-failed');
        },
        [submit, upload]
    );
    const recordRefused = useCallback((why: RecordRefusal) => setAttachNotice(why === 'denied' ? 'no-microphone' : 'cannot-record'), []);
    const recorder = useHoldToRecord(sendRecording, recordRefused);

    const confirmDelete = useCallback(
        (message: ChatMessage) => {
            Alert.alert(t('chat.delete.title'), t('chat.delete.body'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                        void remove(message.id).then((gone) => {
                            if (gone) void reload();
                            else Alert.alert(t('chat.delete.failed'));
                        });
                    },
                },
            ]);
        },
        [reload, remove, t]
    );

    const renderItem = useCallback(
        ({ item }: { item: Row }) => {
            if (item.kind === 'day') return <DaySeparator label={item.label} />;
            if (item.kind === 'log') return <SystemLine text={item.text} at={item.at} />;
            if (item.kind === 'notice') return <SystemNotice text={item.text} at={item.at} testID={`system-${item.id}`} />;
            return (
                <YStack paddingBottom={item.showMeta ? 6 : 0}>
                    <MessageBubble
                        message={item.message}
                        mine={item.mine}
                        author={item.author}
                        showMeta={item.showMeta}
                        state={item.state}
                        readBy={item.readBy}
                        isGroup={isGroup}
                        onOpenImage={(attachment) => setPreview(attachment.url ?? null)}
                        // Only my own messages, and only with signal: a delete must not sit in a queue.
                        onLongPress={item.deletable && isOnline ? () => confirmDelete(item.message) : undefined}
                        t={t}
                        testID={`${item.mine ? 'mine' : 'theirs'}-${item.message.id}`}
                    />
                </YStack>
            );
        },
        [confirmDelete, isGroup, isOnline, t]
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="conversation-loading">
                <Skeleton height={56} />
                <Skeleton height={56} />
                <Skeleton height={56} />
            </YStack>
        );
    }

    if (isBlocked || !channel) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="conversation-error">
                <FailureState error={error} isOnline={isOnline} onRetry={reload} t={t} testID="conversation-error" />
            </YStack>
        );
    }

    const others = otherParticipants(channel, userId);
    const heading = chatName(channel, userId, t);
    const context = chatContext(channel, userId, t);
    // A call button only where it is unambiguous who would be called, and only when they have a number.
    const phone = others.length === 1 ? others[0].phone?.trim() : undefined;
    const place = payloadOf(orderRecord).dropoff?.name;
    const canWrite = !!me && !closed;
    const hasDraft = draft.trim().length > 0 || pending.length > 0;
    const canSend = canWrite && hasDraft && !isUploading && !isSending;
    const recording = recorder.phase !== 'idle';
    const muted = theme.textSecondary?.val as string;

    return (
        <AudioPlayerProvider>
            <View ref={frameRef} onLayout={measure} style={{ flex: 1 }}>
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
                    <YStack flex={1} backgroundColor="$background" testID="conversation">
                        {/* Who this is with. */}
                        <XStack alignItems="center" gap={space[3]} paddingHorizontal={onBack ? space[2] : space[4]} paddingTop={space[1]} paddingBottom={space[2]}>
                            {onBack ? (
                                <YStack width={44} height={44} alignItems="center" justifyContent="center" onPress={onBack} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" accessibilityLabel={t('chat.back')} testID="conversation-back">
                                    <ChatIcon name="back" size={22} color={theme.textPrimary?.val as string} />
                                </YStack>
                            ) : null}
                            <Avatar name={heading} seed={channel.id} group={isGroup} />
                            <YStack flex={1} gap={1}>
                                <Body fontSize={17} lineHeight={22} fontWeight="800" numberOfLines={1} accessibilityRole="header" testID="conversation-title">
                                    {heading}
                                </Body>
                                {context ? (
                                    <Body fontSize={13} lineHeight={18} tone="secondary" numberOfLines={1} testID="participant-summary">
                                        {context}
                                    </Body>
                                ) : null}
                            </YStack>
                            {phone ? (
                                <YStack
                                    width={44}
                                    height={44}
                                    borderRadius={12}
                                    backgroundColor="$surface"
                                    borderWidth={1}
                                    borderColor="$border"
                                    alignItems="center"
                                    justifyContent="center"
                                    onPress={() => void Linking.openURL(`tel:${phone}`).catch(() => {})}
                                    pressStyle={{ opacity: 0.6 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('chat.call', { name: others[0].name ?? heading })}
                                    testID="conversation-call"
                                >
                                    <ChatIcon name="phone" size={20} color={theme.textPrimary?.val as string} strokeWidth={2.2} />
                                </YStack>
                            ) : null}
                        </XStack>

                        {/* What it is about: the order, one tap away. */}
                        {order ? (
                            <XStack
                                alignItems="center"
                                gap={10}
                                marginHorizontal={space[4]}
                                paddingVertical={10}
                                paddingHorizontal={space[3]}
                                borderRadius={14}
                                backgroundColor="$surface"
                                borderWidth={1}
                                borderColor="$border"
                                onPress={onOpenOrder ? () => onOpenOrder(order.orderId) : undefined}
                                pressStyle={onOpenOrder ? { opacity: 0.7 } : undefined}
                                accessibilityRole={onOpenOrder ? 'button' : undefined}
                                accessibilityLabel={`${place ? t('chat.aboutPlace', { place }) : t('chat.aboutOrder')}. ${order.label}`}
                                testID="conversation-order"
                            >
                                <YStack flex={1} gap={1}>
                                    <Body fontSize={14} lineHeight={19} fontWeight="700" numberOfLines={1}>
                                        {place ? t('chat.aboutPlace', { place }) : t('chat.aboutOrder')}
                                    </Body>
                                    {/* The identifier in full: it wraps rather than being cut. */}
                                    <Body fontSize={12} lineHeight={17} fontFamily="$mono" tone="secondary">
                                        {order.label}
                                    </Body>
                                </YStack>
                                {onOpenOrder ? <ChatIcon name="chevron" size={16} color={muted} /> : null}
                            </XStack>
                        ) : null}

                        {/* Without a participant record the API rejects every send. */}
                        {!me ? (
                            <YStack paddingHorizontal={space[4]} paddingTop={space[2]}>
                                <Banner tone="warning" message={t('conversation.notAParticipant')} testID="not-participant" />
                            </YStack>
                        ) : null}

                        <FlatList
                            ref={listRef}
                            data={rows}
                            keyExtractor={(row) => row.key}
                            renderItem={renderItem}
                            style={{ flex: 1, opacity: recording ? 0.45 : 1 }}
                            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: space[4], paddingVertical: 14, gap: space[1] }}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="interactive"
                            testID="conversation-feed"
                            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                            ListEmptyComponent={
                                <YStack flex={1} alignItems="center" justifyContent="center" paddingVertical={space[5]}>
                                    <Body fontSize={15} lineHeight={21} tone="secondary" textAlign="center" testID="conversation-empty">
                                        {t('conversation.emptyBody')}
                                    </Body>
                                </YStack>
                            }
                        />

                        {recording ? <RecordPanel recorder={recorder} t={t} /> : null}

                        {closed ? (
                            <YStack paddingHorizontal={space[4]} paddingTop={space[2]} paddingBottom={Math.max(insets.bottom, space[3])}>
                                <Banner tone="neutral" message={t('chat.closed')} testID="conversation-closed" />
                            </YStack>
                        ) : (
                            <YStack backgroundColor={recording ? '$surface' : '$background'}>
                                {sendError ? (
                                    <YStack paddingHorizontal={space[4]} paddingBottom={space[2]}>
                                        <Banner
                                            tone="danger"
                                            message={sendError === 'missing-participant' ? t('conversation.notAParticipant') : `${t('conversation.sendFailed')}. ${sendError}`}
                                            action={{ label: t('common.dismiss'), onPress: clearError }}
                                            testID="send-error"
                                        />
                                    </YStack>
                                ) : null}
                                {attachNotice ? (
                                    <YStack paddingHorizontal={space[4]} paddingBottom={space[2]}>
                                        <Banner
                                            tone={attachNotice === 'failed' || attachNotice === 'voice-failed' ? 'danger' : 'neutral'}
                                            message={t(ATTACH_NOTICE_KEYS[attachNotice])}
                                            action={
                                                attachNotice === 'no-microphone'
                                                    ? // Once refused, only Settings can allow it; the system will not ask again.
                                                      {
                                                          label: t('permissions.openSettings'),
                                                          onPress: () => {
                                                              setAttachNotice(null);
                                                              void openSettings().catch(() => {});
                                                          },
                                                      }
                                                    : { label: t('common.dismiss'), onPress: () => setAttachNotice(null) }
                                            }
                                            testID={`attach-${attachNotice}`}
                                        />
                                    </YStack>
                                ) : null}

                                {/* Scrolls rather than dividing the width: a translated reply can be long, and none may be cut. */}
                                {!recording && !hasDraft ? (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingBottom: 10 }} testID="quick-replies">
                                        {QUICK_REPLY_KEYS.map((key) => (
                                            <XStack
                                                key={key}
                                                height={40}
                                                paddingHorizontal={14}
                                                alignItems="center"
                                                borderRadius={20}
                                                backgroundColor="$surface"
                                                borderWidth={1}
                                                borderColor="$border"
                                                opacity={canWrite && !isSending ? 1 : 0.4}
                                                onPress={canWrite && !isSending ? () => void submit(t(`conversation.quick.${key}`)) : undefined}
                                                pressStyle={{ opacity: 0.7 }}
                                                accessibilityRole="button"
                                                accessibilityState={{ disabled: !canWrite || isSending }}
                                                testID={`quick-${key}`}
                                            >
                                                <Body fontSize={14} lineHeight={18} fontWeight="700" numberOfLines={1}>
                                                    {t(`conversation.quick.${key}`)}
                                                </Body>
                                            </XStack>
                                        ))}
                                    </ScrollView>
                                ) : null}

                                {pending.length || isUploading ? (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space[2], paddingHorizontal: space[4], paddingBottom: 10, alignItems: 'center' }} testID="composer-attachments">
                                        {pending.map(({ file, uri }) => (
                                            <YStack key={file.id} width={64} height={64} borderRadius={14} overflow="hidden" borderWidth={1} borderColor="$border" backgroundColor="$surface">
                                                {uri || file.url ? <Image source={{ uri: (uri ?? file.url) as string }} style={{ width: 64, height: 64 }} /> : null}
                                                <YStack
                                                    position="absolute"
                                                    top={0}
                                                    right={0}
                                                    width={32}
                                                    height={32}
                                                    alignItems="center"
                                                    justifyContent="center"
                                                    onPress={() => setPending((current) => current.filter((p) => p.file.id !== file.id))}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={t('conversation.removeAttachment')}
                                                    testID={`remove-attachment-${file.id}`}
                                                >
                                                    <YStack width={22} height={22} borderRadius={11} backgroundColor="$background" alignItems="center" justifyContent="center">
                                                        <ChatIcon name="close" size={12} color={theme.textPrimary?.val as string} strokeWidth={3} />
                                                    </YStack>
                                                </YStack>
                                            </YStack>
                                        ))}
                                        <Body fontSize={13} lineHeight={18} fontWeight="700" tone="secondary" tabular>
                                            {isUploading ? t('conversation.uploading') : t('conversation.attachedCount', { count: pending.length })}
                                        </Body>
                                    </ScrollView>
                                ) : null}

                                <XStack alignItems="flex-end" gap={space[2]} paddingHorizontal={space[4]} paddingTop={10} paddingBottom={Math.max(insets.bottom, space[3])} borderTopWidth={1} borderColor="$border">
                                    <RoundControl icon="plus" disabled={!canWrite || isUploading || recording} label={t('chat.attach.open')} onPress={() => setSheetOpen(true)} testID="attach-photo" />
                                    <YStack flex={1} testID="composer">
                                        <ComposerInput
                                            value={draft}
                                            onChangeText={setDraft}
                                            placeholder={t('chat.composer.placeholder')}
                                            placeholderTextColor="$textMuted"
                                            editable={canWrite && !recording}
                                            multiline
                                            accessibilityLabel={t('chat.composer.placeholder')}
                                            testID="composer-input"
                                        />
                                    </YStack>
                                    {/*
                                      * One button on the right. With something to send it sends; with nothing, on a
                                      * build that can record, it is the microphone: hold to record.
                                      */}
                                    {CAN_RECORD && !hasDraft ? (
                                        // A plain view owns the touch: the hold and the slide must not compete with a button's own press handling.
                                        <View {...(canWrite ? recorder.handlers : {})} accessible accessibilityRole="button" accessibilityLabel={t('chat.record.hold')} testID="record-voice">
                                            <View pointerEvents="none">
                                                <RoundControl icon="mic" size={56} primary disabled={!canWrite} label={t('chat.record.hold')} testID="record-voice-glyph" />
                                            </View>
                                        </View>
                                    ) : (
                                        <RoundControl icon="send" size={56} primary disabled={!canSend} label={t('conversation.send')} onPress={() => void submit(draft, { fromDraft: true })} testID="send" />
                                    )}
                                </XStack>
                            </YStack>
                        )}
                    </YStack>
                </KeyboardAvoidingView>
            </View>

            <AttachSheet
                visible={sheetOpen}
                recipient={isGroup ? undefined : (others[0]?.name?.trim().split(/\s+/)[0] ?? undefined)}
                hasLocation={!!position}
                onCamera={takePhoto}
                onLibrary={pickPhotos}
                onLocation={shareLocation}
                onClose={() => setSheetOpen(false)}
                t={t}
            />
            <ImagePreview url={preview} closeLabel={t('chat.photo.close')} onClose={() => setPreview(null)} />
        </AudioPlayerProvider>
    );
}

export default ConversationScreen;
