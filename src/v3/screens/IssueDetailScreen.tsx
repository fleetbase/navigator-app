/**
 * Issue detail — R2 frame F3.
 *
 * F3 asks for "the status timeline". `GET issues/{id}/timeline` is registered
 * only under the console's `int/v1` prefix, so a driver token cannot read it;
 * the screen shows the current status and when it was filed and resolved, and
 * says the history is not available rather than leaving a gap where a timeline
 * was promised.
 */
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { headingOf, humanizeTerm, type IssueRecord } from '../data';
import { isRealPoint } from '../data/useOrderTimeline';

export function IssueDetailScreen({ issue }: { issue: IssueRecord }) {
    const { t } = useTranslation();
    const point = isRealPoint(issue.location) ? (issue.location!.coordinates as number[]) : undefined;

    const rows: { key: string; labelKey: string; value: string }[] = [];
    const push = (key: string, labelKey: string, value?: string) => {
        if (value) rows.push({ key, labelKey, value });
    };
    push('type', 'issueDetail.type', humanizeTerm(issue.type));
    push('category', 'issueDetail.category', humanizeTerm(issue.category));
    push('vehicle', 'issueDetail.vehicle', issue.vehicle_name ?? undefined);
    push('reporter', 'issueDetail.reporter', issue.reporter_name ?? undefined);
    push('assignee', 'issueDetail.assignee', issue.assignee_name ?? undefined);
    if (point) push('location', 'issueDetail.location', `${point[1].toFixed(4)}, ${point[0].toFixed(4)}`);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="issue-detail">
            <Surface hero padded>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                        <Caption>{t('issueDetail.title')}</Caption>
                        <XStack gap={space[2]} alignItems="center">
                            {issue.priority ? (
                                <StatusPill status={issue.priority} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="issue-priority" />
                            ) : null}
                            {issue.status ? (
                                <StatusPill status={issue.status} t={(k, fb) => t(k, { defaultValue: fb })} testID="issue-status" />
                            ) : (
                                <Micro testID="issue-untriaged">{t('issues.untriaged')}</Micro>
                            )}
                        </XStack>
                    </XStack>
                    <Body fontSize={17} fontWeight="800">
                        {headingOf(issue).heading || t('issues.untitled')}
                    </Body>
                    {issue.issue_id ? <Identifier value={issue.issue_id} boxed={false} /> : null}
                </YStack>
            </Surface>

            {issue.report ? (
                <YStack gap={space[2]}>
                    <Caption>{t('issueDetail.report')}</Caption>
                    <Surface padded="compact">
                        <Secondary>{issue.report}</Secondary>
                    </Surface>
                </YStack>
            ) : null}

            {rows.length ? (
                <Surface testID="issue-rows">
                    {rows.map((row, i) => (
                        <YStack key={row.key}>
                            {i > 0 ? <Divider /> : null}
                            <XStack padding={space[3]} justifyContent="space-between" alignItems="center" gap={space[3]} testID={`issue-row-${row.key}`}>
                                <Caption>{t(row.labelKey)}</Caption>
                                <Body fontSize={15} textAlign="right" flexShrink={1}>
                                    {row.value}
                                </Body>
                            </XStack>
                        </YStack>
                    ))}
                </Surface>
            ) : null}

            <YStack gap={space[2]}>
                <Caption>{t('issueDetail.history')}</Caption>
                <Micro testID="issue-filed">
                    {issue.created_at ? t('issueDetail.filed', { when: new Date(issue.created_at).toLocaleString() }) : t('issueDetail.filedUnknown')}
                </Micro>
                {issue.resolved_at ? (
                    <Micro testID="issue-resolved">{t('issueDetail.resolved', { when: new Date(issue.resolved_at).toLocaleString() })}</Micro>
                ) : null}
                <Banner tone="neutral" message={t('issueDetail.timelineUnavailable')} testID="issue-timeline-unavailable" />
            </YStack>
        </ScrollView>
    );
}

export default IssueDetailScreen;
