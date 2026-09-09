/**
 * Conversation — R2 frames G1 and G2.
 *
 * The server already interleaves system events and messages into one ordered
 * `feed`, so the three bubble kinds G1 asks for — self, other, system — are a
 * render of `entry.type` plus "is this sender me", with no client-side merge.
 *
 * What is not built, and why:
 *
 *   - **Attachments** (camera, file, location share). The API accepts a `files`
 *     array of ids, so this needs the upload half — `POST /v1/files` — and a
 *     picker. The composer therefore offers text and quick replies only, rather
 *     than showing an attachment button that does nothing.
 *   - **Order-context header.** A channel carries no order reference on the
 *     public resource, so there is nothing to tap through to.
 *
 * Read receipts are shown where the API gives them: `receipts` on each message.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Image, ScrollView, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro } from '../ui/Text';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import {
    useChatChannel,
    useSendMessage,
    myParticipant,
    channelTitle,
    headingNamesEveryone,
    otherParticipants,
    type ChatChannelRecord,
    type FeedEntry,
} from '../data';
import { formatClock } from '../format';
import { useUploadFile, type UploadedFile } from '../data/useFiles';
import type { ChatAttachment } from '../data/useChat';
import type { CapturedPhoto } from '../../components/CameraCapture';

/* VisionCamera initialises its native module at import; load it only when the driver asks for a photo. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

const isImage = (a: ChatAttachment) => String(a.content_type ?? '').startsWith('image/');

/** G2's quick replies — the three things a driver says most. */
const QUICK_REPLY_KEYS = ['onMyWay', 'runningLate', 'arrived'] as const;

function SystemLine({ text, at }: { text: string; at?: string }) {
    return (
        <YStack alignItems="center" paddingVertical={space[2]} gap={2}>
            <Micro textAlign="center">{text}</Micro>
            {at ? <Micro tabular>{formatClock(at)}</Micro> : null}
        </YStack>
    );
}

function Bubble({
    content,
    attachments,
    author,
    at,
    mine,
    readBy,
    t,
    testID,
}: {
    content: string;
    attachments?: ChatAttachment[];
    author?: string;
    at?: string;
    mine: boolean;
    readBy: number;
    t: (key: string, options?: Record<string, unknown>) => string;
    testID?: string;
}) {
    return (
        <YStack alignItems={mine ? 'flex-end' : 'flex-start'} paddingVertical={space[1]} testID={testID}>
            {/* Only the other side needs naming — the driver knows who they are. */}
            {!mine && author ? <Micro paddingHorizontal={space[2]}>{author}</Micro> : null}

            <YStack
                maxWidth="82%"
                paddingHorizontal={space[3]}
                paddingVertical={space[2]}
                borderRadius={radius.hero}
                backgroundColor={mine ? '$primary' : '$surfaceRaised'}
                borderWidth={mine ? 0 : 1}
                borderColor="$border"
            >
                {attachments?.length ? (
                    <YStack gap={space[2]} paddingBottom={content ? space[2] : 0}>
                        {attachments.map((a, i) =>
                            isImage(a) && a.url ? (
                                <Image key={a.id ?? i} source={{ uri: a.url }} style={{ width: 220, height: 165, borderRadius: radius.compact }} accessibilityLabel={a.filename ?? t('conversation.attachment')} testID={`attachment-${a.id ?? i}`} />
                            ) : (
                                <Micro key={a.id ?? i} color={mine ? '$onPrimary' : '$textSecondary'} testID={`attachment-${a.id ?? i}`}>
                                    📎 {a.filename ?? t('conversation.attachment')}
                                </Micro>
                            )
                        )}
                    </YStack>
                ) : null}
                {content ? (
                    <Body fontSize={15} color={mine ? '$onPrimary' : '$textPrimary'}>
                        {content}
                    </Body>
                ) : null}
            </YStack>

            <XStack gap={space[2]} paddingHorizontal={space[2]} paddingTop={2} alignItems="center">
                {at ? <Micro tabular>{formatClock(at)}</Micro> : null}
                {mine && readBy > 0 ? <Micro tone="brand">{t('conversation.readBy', { count: readBy })}</Micro> : null}
            </XStack>
        </YStack>
    );
}

export function ConversationScreen({
    channelId,
    channel: seed,
    userId,
}: {
    channelId?: string;
    channel?: ChatChannelRecord | null;
    userId?: string;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const listRef = useRef<FlatList<FeedEntry>>(null);

    const { channel, isLoading, isBlocked, error, reload } = useChatChannel(channelId, seed);
    const me = myParticipant(channel, userId);
    const { send, isSending, queued, error: sendError, clearError } = useSendMessage(channelId, me?.id);

    const [draft, setDraft] = useState('');
    const [pending, setPending] = useState<UploadedFile[]>([]);
    const [camera, setCamera] = useState(false);
    const [attachNotice, setAttachNotice] = useState<'needs-connection' | 'failed' | null>(null);
    const { upload, isUploading } = useUploadFile();

    /*
     * Photos upload first (`POST files/base64`) and the message carries their
     * ids. An upload cannot queue — the message needs the id — so without a
     * connection the driver is told photos will not go, and text still does.
     */
    const attach = useCallback(
        async (taken: CapturedPhoto[]) => {
            setCamera(false);
            setAttachNotice(null);
            for (const photo of taken) {
                if (!photo.base64) continue;
                const outcome = await upload({ base64: photo.base64, fileName: `photo-${Date.now()}.jpg`, contentType: 'image/jpeg', fileType: 'image' });
                if (outcome.kind === 'uploaded') setPending((prev) => [...prev, outcome.file]);
                else setAttachNotice(outcome.kind === 'needs-connection' ? 'needs-connection' : 'failed');
            }
        },
        [upload]
    );

    const entries = useMemo(() => {
        const feed = channel?.feed ?? [];
        // Oldest first, so the newest sits at the bottom where a chat belongs.
        return [...feed].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
    }, [channel]);

    const submit = useCallback(
        async (text: string) => {
            const sent = await send(text, pending.map((f) => f.id));
            if (sent) {
                setDraft('');
                setPending([]);
                // Cheapest correct refresh: the feed is assembled server-side.
                await reload();
            }
        },
        [send, reload, pending]
    );

    const renderItem = useCallback(
        ({ item }: { item: FeedEntry }) => {
            if (item.type === 'log') {
                // `content` still carries "{subject.0.name}" placeholders.
                const text = item.data.resolved_content ?? item.data.content ?? '';
                return text ? <SystemLine text={text} at={item.created_at ?? item.data.created_at} /> : null;
            }

            const mine = !!userId && item.data.sender?.user === userId;
            return (
                <Bubble
                    content={item.data.content ?? ''}
                    attachments={item.data.attachments}
                    author={item.data.sender?.name}
                    at={item.created_at ?? item.data.created_at}
                    mine={mine}
                    readBy={(item.data.receipts ?? []).length}
                    t={t}
                    testID={`${mine ? 'mine' : 'theirs'}-${item.data.id}`}
                />
            );
        },
        [t, userId]
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
    /*
     * When the heading already names everyone, a "3 other people" line beneath
     * spends a row restating it. Containment rather than equality, because the
     * server's own channel titles sometimes include the viewer and sometimes
     * do not — "Ron, Charlotte Thomas" and "Charlotte Thomas" should both
     * count as already having said who is here.
     */
    const heading = channelTitle(channel, userId, t('inbox.untitled'));
    const alreadyNamed = headingNamesEveryone(heading, others);
    const canSend = !!me && (draft.trim().length > 0 || pending.length > 0) && !isUploading;

    return (
        <YStack flex={1} backgroundColor="$background" testID="conversation">
            <YStack paddingHorizontal={space[4]} paddingTop={space[2]} gap={space[2]}>
                <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                    {heading}
                </Body>
                <XStack gap={space[2]} alignItems="center">
                    {/*
                     * The heading already lists everyone by name when the
                     * channel has no title of its own, so counting them again
                     * underneath ("Emma, Daniel, Olivia" / "3 other people")
                     * spends a line saying nothing new. The count earns its
                     * place only when the heading is a title instead.
                     */}
                    {alreadyNamed ? null : (
                        <Caption testID="participant-summary">{t('conversation.participants', { count: others.length })}</Caption>
                    )}
                    {others.some((p) => p.is_online) ? <Micro tone="success">{t('conversation.someoneOnline')}</Micro> : null}
                </XStack>
                {!isOnline ? <Banner tone="neutral" message={t('conversation.offlineNotice')} testID="conversation-offline" /> : null}
                {/* Without a participant record the API rejects every send. */}
                {!me ? <Banner tone="warning" message={t('conversation.notAParticipant')} testID="not-participant" /> : null}
            </YStack>

            <FlatList
                ref={listRef}
                data={entries}
                keyExtractor={(e, i) => e.data?.id ?? String(i)}
                renderItem={renderItem}
                contentContainerStyle={{ padding: space[4], gap: space[1] }}
                testID="conversation-feed"
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                ListEmptyComponent={
                    <YStack paddingVertical={space[5]}>
                        <Micro textAlign="center" testID="conversation-empty">
                            {t('conversation.emptyBody')}
                        </Micro>
                    </YStack>
                }
            />

            <YStack paddingHorizontal={space[4]} paddingBottom={space[3]} gap={space[2]}>
                {queued ? <Banner tone="neutral" message={t('conversation.queued')} testID="send-queued" /> : null}
                {sendError ? (
                    <ErrorState
                        title={t('conversation.sendFailed')}
                        body={sendError === 'missing-participant' ? t('conversation.notAParticipant') : sendError}
                        onRetry={clearError}
                        retryLabel={t('common.dismiss')}
                        testID="send-error"
                    />
                ) : null}

                {/*
                  * Scrolls rather than dividing the width three ways: at equal
                  * widths "Running 10 min late" truncated to "Runnin…", and a
                  * translation can be longer still. Content-sized buttons in a
                  * scroller keep every label whole in every locale.
                  */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: space[2], paddingEnd: space[4] }}
                    testID="quick-replies"
                >
                    {QUICK_REPLY_KEYS.map((key) => (
                        <Button
                            key={key}
                            variant="secondary"
                            disabled={!me || isSending}
                            onPress={() => submit(t(`conversation.quick.${key}`))}
                            testID={`quick-${key}`}
                        >
                            {t(`conversation.quick.${key}`)}
                        </Button>
                    ))}
                </ScrollView>

                {attachNotice ? (
                    <Banner
                        tone={attachNotice === 'needs-connection' ? 'neutral' : 'danger'}
                        message={attachNotice === 'needs-connection' ? t('conversation.attachmentsNeedConnection') : t('conversation.attachmentFailed')}
                        action={{ label: t('common.dismiss'), onPress: () => setAttachNotice(null) }}
                        testID={`attach-${attachNotice}`}
                    />
                ) : null}
                {pending.length ? (
                    <XStack gap={space[2]} alignItems="center" flexWrap="wrap" testID="composer-attachments">
                        {pending.map((f) => (
                            <XStack key={f.id} gap={space[1]} alignItems="center">
                                {f.url ? <Image source={{ uri: f.url }} style={{ width: 44, height: 44, borderRadius: radius.compact - 2 }} /> : null}
                                <Button variant="ghost" height={32} paddingHorizontal={space[2]} onPress={() => setPending((prev) => prev.filter((p) => p.id !== f.id))} testID={`remove-attachment-${f.id}`}>
                                    {t('conversation.removeAttachment')}
                                </Button>
                            </XStack>
                        ))}
                        <Micro tabular>{t('conversation.attachedCount', { count: pending.length })}</Micro>
                    </XStack>
                ) : null}
                {camera ? (
                    <View style={{ height: 300 }} testID="composer-camera">
                        {(() => {
                            const Camera = lazyCamera();
                            return <Camera onDone={(taken) => void attach(taken)} />;
                        })()}
                    </View>
                ) : null}
                <XStack gap={space[2]} alignItems="flex-end">
                    <Button variant="secondary" disabled={!me || isUploading} loading={isUploading} onPress={() => setCamera((v) => !v)} testID="attach-photo">
                        {t('conversation.attachPhoto')}
                    </Button>
                    <YStack flex={1}>
                        <Field
                            value={draft}
                            onChangeText={setDraft}
                            placeholder={t('conversation.composerPlaceholder')}
                            multiline
                            disabled={!me}
                            testID="composer"
                        />
                    </YStack>
                    <Button disabled={!canSend} loading={isSending} onPress={() => submit(draft)} testID="send">
                        {t('conversation.send')}
                    </Button>
                </XStack>
            </YStack>
        </YStack>
    );
}

export default ConversationScreen;
