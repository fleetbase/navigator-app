/**
 * New conversation — R2 frame G3.
 *
 * `GET /v1/chat-channels/available-participants` returns everyone in the
 * organisation who can be added. There is no bulk add route, so the channel is
 * created first and participants are added one at a time — which means a
 * partial failure leaves a real channel with some of the people in it. The
 * screen reports that honestly rather than pretending the whole thing failed.
 */
import { useCallback, useMemo, useState } from 'react';
import { FlatList } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { humanizeTerm } from '../data';
import { useAvailableParticipants, useCreateChannel, personUserId, type ChatChannelRecord, type ChatParticipant } from '../data';

function Avatar({ name }: { name?: string }) {
    const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <YStack width={36} height={36} borderRadius={radius.pill} backgroundColor="$primary" alignItems="center" justifyContent="center">
            <Body fontSize={15} fontWeight="800" color="$onPrimary">
                {initial}
            </Body>
        </YStack>
    );
}

export function NewConversationScreen({
    userId,
    onCreated,
    onCancel,
}: {
    userId?: string;
    onCreated?: (channel: ChatChannelRecord) => void;
    onCancel?: () => void;
}) {
    const { t } = useTranslation();
    const { people, isLoading, failed, retry } = useAvailableParticipants();
    const { create, isCreating, error } = useCreateChannel();

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Record<string, ChatParticipant>>({});

    const candidates = useMemo(() => {
        // Never offer the driver a conversation with themselves.
        const everyone = (people ?? []).filter((p) => !userId || personUserId(p) !== userId);
        const needle = query.trim().toLowerCase();
        if (!needle) return everyone;
        return everyone.filter((p) => [p.name, p.email, p.username].some((f) => f?.toLowerCase().includes(needle)));
    }, [people, query, userId]);

    const chosen = Object.values(selected);

    const toggle = useCallback((person: ChatParticipant) => {
        const key = personUserId(person) ?? person.id;
        setSelected((current) => {
            const next = { ...current };
            if (next[key]) delete next[key];
            else next[key] = person;
            return next;
        });
    }, []);

    const start = useCallback(async () => {
        const name = chosen.map((p) => p.name).filter(Boolean).join(', ');
        const created = await create(
            name || t('newConversation.untitledName'),
            chosen.map(personUserId).filter((u): u is string => !!u)
        );
        if (created) onCreated?.(created);
    }, [chosen, create, onCreated, t]);

    const renderItem = useCallback(
        ({ item, index }: { item: ChatParticipant; index: number }) => {
            const key = personUserId(item) ?? item.id;
            const isSelected = !!selected[key];
            return (
                <YStack>
                    {index > 0 ? <Divider /> : null}
                    <XStack
                        padding={space[3]}
                        gap={space[3]}
                        alignItems="center"
                        onPress={() => toggle(item)}
                        pressStyle={{ opacity: 0.7 }}
                        testID={`person-${key}`}
                    >
                        <Avatar name={item.name} />
                        <YStack flex={1} gap={2}>
                            <Body fontSize={15} fontWeight={isSelected ? '800' : '600'}>
                                {item.name ?? item.username ?? item.email}
                            </Body>
                            <XStack gap={space[2]} alignItems="center">
                                {item.type ? <Micro tone="brand" testID={`role-${key}`}>{humanizeTerm(item.type)}</Micro> : null}
                                {item.email ? <Micro numberOfLines={1} flexShrink={1}>{item.email}</Micro> : null}
                            </XStack>
                        </YStack>
                        {item.is_online ? <Micro tone="success">{t('newConversation.online')}</Micro> : null}
                        {isSelected ? (
                            <Body fontSize={17} tone="brand" testID={`selected-${key}`}>
                                ✓
                            </Body>
                        ) : null}
                    </XStack>
                </YStack>
            );
        },
        [selected, t, toggle]
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="people-loading">
                <Skeleton height={56} />
                <Skeleton height={56} />
                <Skeleton height={56} />
            </YStack>
        );
    }

    if (failed) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="people-error">
                <ErrorState title={t('newConversation.loadFailed')} body={t('newConversation.loadFailedBody')} onRetry={retry} retryLabel={t('common.retry')} />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="new-conversation">
            <YStack paddingHorizontal={space[4]} paddingTop={space[3]} gap={space[3]}>
                <Field value={query} onChangeText={setQuery} placeholder={t('newConversation.searchPlaceholder')} autoCapitalize="none" testID="people-search" />
                <Caption testID="selected-count">{t('newConversation.selected', { count: chosen.length })}</Caption>
            </YStack>

            <FlatList
                data={candidates}
                keyExtractor={(p) => personUserId(p) ?? p.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: space[4] }}
                ListHeaderComponent={candidates.length ? <Surface height={0} /> : null}
                ListEmptyComponent={
                    <EmptyState
                        testID="people-empty"
                        title={query ? t('newConversation.noMatchesTitle') : t('newConversation.noneTitle')}
                        body={query ? t('newConversation.noMatchesBody', { query }) : t('newConversation.noneBody')}
                    />
                }
            />

            {error ? <YStack paddingHorizontal={space[4]}><ErrorState title={t('newConversation.createFailed')} body={error} testID="create-error" /></YStack> : null}

            <XStack gap={space[2]} paddingHorizontal={space[4]} paddingBottom={space[3]}>
                <Button flex={1} variant="ghost" onPress={onCancel} testID="cancel-conversation">
                    {t('common.cancel')}
                </Button>
                <Button flex={2} disabled={chosen.length === 0} loading={isCreating} onPress={start} testID="start-conversation">
                    {t('newConversation.start')}
                </Button>
            </XStack>
        </YStack>
    );
}

export default NewConversationScreen;
