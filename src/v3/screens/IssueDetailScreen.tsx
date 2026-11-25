/**
 * One issue — R2 frame F3, in the round 3 look.
 *
 * What was reported, how urgent, where it stands, and when it was filed and
 * resolved.
 *
 * F3 asks for "the status timeline". `GET issues/{id}/timeline` is registered
 * only under the console's `int/v1` prefix, so a driver token cannot read it;
 * the screen shows the current status with the two dates the record carries and
 * leaves the history out rather than drawing an empty one. Photos attached to
 * an issue are not shown for the same kind of reason: the public resource
 * returns `files` only when the relation is loaded, and the public endpoints
 * never load it.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { headingOf, type IssueRecord } from '../data';
import { formatDateTime } from '../format';
import { isRealPoint } from '../data/useOrderTimeline';
import { Card, FactRow, Icon, Screen, Section, Tag } from './me/parts';
import { typeOf } from './me/issueTaxonomy';
import { PriorityChip, categoryText, statusLabel, typeLabel } from './me/issueParts';

export function IssueDetailScreen({ issue }: { issue: IssueRecord }) {
    const { t } = useTranslation();
    const point = isRealPoint(issue.location) ? (issue.location!.coordinates as number[]) : undefined;

    /*
     * `headingOf` already tells us when it fell back to the report text for the
     * heading. Ignoring that printed the same sentence twice — once as the
     * title, once under "What you reported".
     */
    const { heading, usedReport } = headingOf(issue);

    const rows: { key: string; labelKey: string; value: string; mono?: boolean }[] = [];
    const push = (key: string, labelKey: string, value?: string, mono?: boolean) => {
        if (value) rows.push({ key, labelKey, value, mono });
    };
    push('type', 'issueDetail.type', typeLabel(issue.type, t));
    push('category', 'issueDetail.category', categoryText(issue.category, t));
    push('vehicle', 'issueDetail.vehicle', issue.vehicle_name ?? undefined);
    push('reporter', 'issueDetail.reporter', issue.reporter_name ?? undefined);
    push('assignee', 'issueDetail.assignee', issue.assignee_name ?? undefined);
    /*
     * Raw coordinates, presented as coordinates. The label used to read
     * "Reported at", which a driver reads as a *time*, above a pair of numbers
     * no one can place. There is no reverse-geocode on this payload, so the
     * honest move is to name the value for what it is rather than dress it up.
     */
    if (point) push('location', 'issueDetail.location', `${point[1].toFixed(4)}, ${point[0].toFixed(4)}`, true);

    return (
        <Screen testID="issue-detail">
            <Card gap={space[3]}>
                <XStack alignItems="flex-start" gap={space[3]}>
                    <YStack width={40} height={40} borderRadius={12} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                        <Icon name={typeOf(issue.type)?.icon ?? 'issue'} size={20} />
                    </YStack>
                    <YStack flex={1} gap={4} minWidth={0}>
                        <Body fontSize={20} lineHeight={26} fontWeight="800">
                            {heading || t('issues.untitled')}
                        </Body>
                        {issue.issue_id ? (
                            <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable>
                                {issue.issue_id}
                            </Body>
                        ) : null}
                    </YStack>
                </XStack>
                <XStack gap={6} flexWrap="wrap">
                    <PriorityChip priority={issue.priority} t={t} testID="issue-priority" />
                    <Tag testID={issue.status ? 'issue-status' : 'issue-untriaged'}>{statusLabel(issue.status, t)}</Tag>
                </XStack>
            </Card>

            {issue.report && !usedReport ? (
                <Section title={t('issueDetail.report')}>
                    <Card>
                        <Body fontSize={16} lineHeight={23}>
                            {issue.report}
                        </Body>
                    </Card>
                </Section>
            ) : null}

            {rows.length ? (
                <Card flush testID="issue-rows">
                    {rows.map((row, i) => (
                        <FactRow key={row.key} first={i === 0} label={t(row.labelKey)} value={row.value} mono={row.mono} testID={`issue-row-${row.key}`} />
                    ))}
                </Card>
            ) : null}

            <Section title={t('issueDetail.history')}>
                <Card gap={space[2]}>
                    <Secondary fontSize={14} tabular testID="issue-filed">
                        {issue.created_at ? t('issueDetail.filed', { when: formatDateTime(issue.created_at) }) : t('issueDetail.filedUnknown')}
                    </Secondary>
                    {issue.resolved_at ? (
                        <Secondary fontSize={14} tone="success" tabular testID="issue-resolved">
                            {t('issueDetail.resolved', { when: formatDateTime(issue.resolved_at) })}
                        </Secondary>
                    ) : null}
                </Card>
            </Section>
        </Screen>
    );
}

export default IssueDetailScreen;
