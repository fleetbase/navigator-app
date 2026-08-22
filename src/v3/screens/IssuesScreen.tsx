/**
 * Issues and defects — R1 frame s10.
 *
 * The list is deliberately quiet: an issue is a thing the driver has already
 * escalated, so the row leads with what it was about and its current state, not
 * with alarm colour. Priority sits beside the status rather than competing with
 * it, and neither is the loudest thing on the card.
 */
import { useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { StatusPill } from '../ui/StatusPill';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useIssues, headingOf, humanizeTerm, type IssueRecord } from '../data';
import { formatClock } from '../format';

function IssueRow({
    issue,
    onPress,
    t,
}: {
    issue: IssueRecord;
    onPress?: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}) {
    const type = humanizeTerm(issue.type);
    const { heading, usedReport } = headingOf(issue);

    return (
        <YStack padding={space[3]} gap={space[2]} onPress={onPress} pressStyle={onPress ? { opacity: 0.7 } : undefined} testID={`issue-${issue.id}`}>
            <XStack justifyContent="space-between" alignItems="flex-start" gap={space[2]}>
                <Body fontSize={15} fontWeight="700" flex={1} numberOfLines={2}>
                    {heading || t('issues.untitled')}
                </Body>
                {/*
                  * A freshly filed issue comes back with `status: null` — the
                  * public create endpoint does not default one — and a pill with
                  * no label is just an empty lozenge. The priority carries the
                  * row until dispatch triages it.
                  */}
                {issue.status ? (
                    <StatusPill status={issue.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID={`status-${issue.id}`} />
                ) : (
                    <Micro testID={`untriaged-${issue.id}`}>{t('issues.untriaged')}</Micro>
                )}
            </XStack>

            {/* Omitted when the heading already is the report. */}
            {issue.report && !usedReport ? (
                <Secondary fontSize={13} numberOfLines={2}>
                    {issue.report}
                </Secondary>
            ) : null}

            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <XStack gap={space[2]} alignItems="center" flex={1}>
                    {issue.priority ? (
                        <StatusPill status={issue.priority} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID={`priority-${issue.id}`} />
                    ) : null}
                    {type ? <Micro>{type}</Micro> : null}
                </XStack>
                <Micro tabular>{formatClock(issue.created_at)}</Micro>
            </XStack>
        </YStack>
    );
}

export function IssuesScreen({
    driverId,
    reloadToken,
    onOpenIssue,
    onCreate,
}: {
    driverId?: string;
    reloadToken?: number;
    onOpenIssue?: (issue: IssueRecord) => void;
    onCreate?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { issues, isLoading, isRefreshing, failed, error, refresh, retry } = useIssues(driverId, reloadToken);

    const renderItem = useCallback(
        ({ item }: { item: IssueRecord }) => (
            <Surface marginBottom={space[3]}>
                <IssueRow issue={item} t={t} onPress={onOpenIssue ? () => onOpenIssue(item) : undefined} />
            </Surface>
        ),
        [onOpenIssue, t]
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="issues-loading">
                <Skeleton height={96} />
                <Skeleton height={96} />
            </YStack>
        );
    }

    if (failed && !issues) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="issues-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="issues-error" />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="issues-screen">
            <YStack paddingHorizontal={space[4]} paddingTop={space[3]} gap={space[3]}>
                {onCreate ? (
                    <Button fullWidth onPress={onCreate} testID="issue-add">
                        {t('issues.report')}
                    </Button>
                ) : null}
            </YStack>

            <FlatList
                data={issues ?? []}
                keyExtractor={(i) => i.id}
                renderItem={renderItem}
                contentContainerStyle={issues?.length ? { padding: space[4] } : { flexGrow: 1, padding: space[4] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListEmptyComponent={
                    <YStack flex={1} justifyContent="center">
                        <EmptyState
                            testID="issues-empty"
                            title={t('issues.emptyTitle')}
                            body={t('issues.emptyBody')}
                            action={onCreate ? { label: t('issues.report'), onPress: onCreate } : undefined}
                        />
                    </YStack>
                }
            />
        </YStack>
    );
}

export default IssuesScreen;
