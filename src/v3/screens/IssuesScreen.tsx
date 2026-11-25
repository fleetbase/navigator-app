/**
 * Issues — design round 3 (`IssueList.dc.html`).
 *
 * What the driver has reported and what became of it. Open ones first, because
 * those are the ones still waiting on somebody; resolved ones a tap away.
 *
 * The filter works on what is loaded (the newest fifty of this driver's
 * issues); the server has no "open" filter, since open is every status that is
 * not one of the closing ones — see `isOpenIssue`.
 *
 * Each card says how urgent it is with the server's own word for the priority
 * (low, medium, high, critical) and a mark whose shape changes with it, the
 * status as dispatch last set it, and what it is about.
 *
 * Not shown: the order an issue is about. `POST /v1/issues` validates `order`
 * and then drops it, and the public resource only returns the order to the
 * console, so an issue cannot be tied to a tracking number from here.
 */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { FlatList } from '../ui/Scroll';
import { Body, Secondary } from '../ui/Text';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useIssues, headingOf, type IssueRecord } from '../data';
import { useScreenStyle } from '../ui/useScreenStyle';
import { BigButton } from '../onboarding/AuthScaffold';
import { BottomBar, Card, Chip, Icon, Tag } from './me/parts';
import { isOpenIssue, typeOf } from './me/issueTaxonomy';
import { PriorityChip, statusLabel, typeLabel, whenFiled } from './me/issueParts';

type Filter = 'open' | 'resolved' | 'all';

function IssueCard({ issue, onPress, t }: { issue: IssueRecord; onPress?: () => void; t: (key: string, options?: Record<string, unknown>) => string }) {
    const { heading, usedReport } = headingOf(issue);
    // The vehicle by name when the issue is about one; otherwise the kind of issue.
    const about = issue.vehicle_name ?? typeLabel(issue.type, t);
    return (
        <Card gap={10} onPress={onPress} pressStyle={onPress ? { opacity: 0.8 } : undefined} accessibilityRole={onPress ? 'button' : 'text'} testID={`issue-${issue.id}`}>
            <XStack alignItems="flex-start" gap={space[3]}>
                <YStack width={40} height={40} borderRadius={12} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                    <Icon name={typeOf(issue.type)?.icon ?? 'issue'} size={20} />
                </YStack>
                <YStack flex={1} gap={2} minWidth={0}>
                    <Body fontSize={16} fontWeight="800" numberOfLines={2}>
                        {heading || t('issues.untitled')}
                    </Body>
                    {issue.issue_id ? (
                        <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable>
                            {issue.issue_id}
                        </Body>
                    ) : null}
                </YStack>
                <Secondary fontSize={13} tabular numberOfLines={1}>
                    {whenFiled(issue.created_at, t)}
                </Secondary>
            </XStack>
            {/* Omitted when the heading already is the report. */}
            {issue.report && !usedReport ? (
                <Secondary fontSize={14} lineHeight={20} numberOfLines={2}>
                    {issue.report}
                </Secondary>
            ) : null}
            <XStack gap={6} flexWrap="wrap">
                <PriorityChip priority={issue.priority} t={t} testID={`priority-${issue.id}`} />
                {/*
                  * A freshly filed issue can come back with no status until the
                  * record is read again; it says so in words rather than
                  * showing an empty pill.
                  */}
                <Tag testID={issue.status ? `status-${issue.id}` : `untriaged-${issue.id}`}>{statusLabel(issue.status, t)}</Tag>
                {about ? <Tag>{about}</Tag> : null}
            </XStack>
        </Card>
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
    const screen = useScreenStyle();
    const { issues, isLoading, isRefreshing, failed, error, refresh, retry } = useIssues(driverId, reloadToken);
    const [filter, setFilter] = useState<Filter>('open');

    const all = issues ?? [];
    const openCount = useMemo(() => all.filter(isOpenIssue).length, [all]);
    const shown = useMemo(() => (filter === 'all' ? all : all.filter((issue) => isOpenIssue(issue) === (filter === 'open'))), [all, filter]);

    const renderItem = useCallback(({ item }: { item: IssueRecord }) => <IssueCard issue={item} t={t} onPress={onOpenIssue ? () => onOpenIssue(item) : undefined} />, [onOpenIssue, t]);

    const action = onCreate ? (
        <BottomBar>
            <BigButton onPress={onCreate} icon={<Icon name="plus" size={20} color="onPrimary" strokeWidth={2.8} />} testID="issue-add">
                {t('issues.report')}
            </BigButton>
        </BottomBar>
    ) : null;

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[2]} testID="issues-loading">
                <Skeleton height={36} width={220} borderRadius={18} />
                <Skeleton height={118} borderRadius={18} />
                <Skeleton height={118} borderRadius={18} />
            </YStack>
        );
    }

    if (failed && !issues) {
        /*
         * A failed *read* must not take away an unrelated *write*. Filing this
         * is queueable — that is the whole point of the offline layer — and a
         * driver who cannot see the list is often exactly the one who needs to
         * record something now and let it send later.
         */
        return (
            <YStack flex={1} backgroundColor="$background" testID="issues-error">
                <YStack flex={1} padding={space[4]} justifyContent="center">
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="issues-error" />
                </YStack>
                {action}
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="issues-screen">
            {all.length ? (
                <XStack gap={space[2]} paddingHorizontal={space[4]} paddingBottom={space[3]} paddingTop={space[1]} accessibilityRole="tablist" testID="issue-filters">
                    <Chip label={openCount > 0 ? t('me.issue.filterOpenCount', { count: openCount }) : t('me.issue.filterOpen')} selected={filter === 'open'} onPress={() => setFilter('open')} testID="issue-filter-open" />
                    <Chip label={t('me.issue.filterResolved')} selected={filter === 'resolved'} onPress={() => setFilter('resolved')} testID="issue-filter-resolved" />
                    <Chip label={t('me.issue.filterAll')} selected={filter === 'all'} onPress={() => setFilter('all')} testID="issue-filter-all" />
                </XStack>
            ) : null}
            <FlatList
                style={screen}
                data={shown}
                keyExtractor={(i) => i.id}
                renderItem={renderItem}
                ItemSeparatorComponent={() => <YStack height={space[2]} />}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingBottom: space[3] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListEmptyComponent={
                    <YStack flex={1} justifyContent="center">
                        {all.length ? (
                            // There are issues, just none under this filter.
                            <Secondary center testID="issues-none-in-filter">
                                {filter === 'open' ? t('me.issue.noneOpen') : t('me.issue.noneResolved')}
                            </Secondary>
                        ) : (
                            <EmptyState testID="issues-empty" title={t('issues.emptyTitle')} body={t('issues.emptyBody')} />
                        )}
                    </YStack>
                }
            />
            {action}
        </YStack>
    );
}

export default IssuesScreen;
