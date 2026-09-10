/**
 * Inspection record — R2 frame E4's detail, carrying E5's defect view.
 *
 * Read-only. Item results grouped by area with the defects first, the odometer
 * and timestamps, and the identifiers of whatever the server opened from the
 * failures — the defect record (an Issue) and the work order. Those are the
 * server's config-driven consequences; the app shows that they happened.
 */
import { useMemo } from 'react';
import { Image, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { endAlign } from '../i18n/direction';
import { useSync } from '../shell';
import { useInspectionSubmission, severityRank, type InspectionSubmissionRecord } from '../data';
import { formatDateTime, formatNumber } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface InspectionDetailScreenProps {
    submissionId: string;
    seed?: InspectionSubmissionRecord | null;
}

export function InspectionDetailScreen({ submissionId, seed }: InspectionDetailScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { submission, isLoading, failed, error, retry } = useInspectionSubmission(submissionId, seed);

    const results = useMemo(() => submission?.item_results ?? [], [submission?.item_results]);
    const defects = useMemo(() => results.filter((r) => !r.passed && r.status !== 'not_applicable').sort((a, b) => severityRank(b.severity) - severityRank(a.severity)), [results]);
    const others = useMemo(() => results.filter((r) => r.passed || r.status === 'not_applicable'), [results]);

    if (isLoading && !submission) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="inspection-detail-loading">
                <Skeleton height={100} />
                <Skeleton height={220} />
            </YStack>
        );
    }
    if (!submission) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="inspection-detail-error" />
            </YStack>
        );
    }

    const failures = Number(submission.failed_items ?? 0) || defects.length;
    const rows: { key: string; label: string; value: string }[] = [
        { key: 'submitted', label: t('inspection.detail.submitted'), value: formatDateTime(submission.submitted_at) },
        ...(submission.started_at ? [{ key: 'started', label: t('inspection.detail.started'), value: formatDateTime(submission.started_at) }] : []),
        ...(submission.odometer != null ? [{ key: 'odometer', label: t('inspection.detail.odometer'), value: `${formatNumber(submission.odometer)} km` }] : []),
        ...(submission.source ? [{ key: 'source', label: t('inspection.detail.source'), value: String(submission.source) }] : []),
    ];

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }} testID="inspection-detail">
            <Surface hero padded>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                        <Caption>{submission.form_name ?? t('inspection.title')}</Caption>
                        <StatusPill
                            status={failures > 0 || submission.has_failures ? 'failed' : 'completed'}
                            label={failures > 0 || submission.has_failures ? t('inspection.resultDefects', { count: failures || 1 }) : t('inspection.resultPassed')}
                            size="sm"
                        />
                    </XStack>
                    {submission.queued ? <Micro tone="brand">{t('inspection.queuedShort')}</Micro> : <Identifier value={submission.id} boxed={false} />}
                    <Micro>{[submission.vehicle_name ?? submission.vehicle?.name, submission.vehicle?.plate_number].filter(Boolean).join(' · ')}</Micro>
                    {submission.meta?.unsafe ? <Banner tone="danger" message={t('inspection.unsafeShort')} testID="inspection-detail-unsafe" /> : null}
                </YStack>
            </Surface>

            <Surface>
                {rows.map((row, i) => (
                    <YStack key={row.key}>
                        {i > 0 ? <Divider /> : null}
                        <XStack padding={space[3]} justifyContent="space-between" gap={space[3]} testID={`inspection-detail-${row.key}`}>
                            <Caption>{row.label}</Caption>
                            <Body fontSize={15} textAlign={endAlign()} flexShrink={1} tabular>
                                {row.value}
                            </Body>
                        </XStack>
                    </YStack>
                ))}
                {submission.issue?.id ? (
                    <>
                        <Divider />
                        <YStack padding={space[3]} gap={2} testID="inspection-detail-issue">
                            <Caption>{t('inspection.detail.linkedIssue')}</Caption>
                            <Identifier value={submission.issue.id} boxed={false} accessory={submission.issue.status ? <StatusPill status={submission.issue.status} size="sm" /> : undefined} />
                        </YStack>
                    </>
                ) : null}
                {submission.work_order?.id ? (
                    <>
                        <Divider />
                        <YStack padding={space[3]} gap={2} testID="inspection-detail-work-order">
                            <Caption>{t('inspection.detail.linkedWorkOrder')}</Caption>
                            <Identifier value={submission.work_order.id} boxed={false} accessory={submission.work_order.status ? <StatusPill status={submission.work_order.status} size="sm" /> : undefined} />
                        </YStack>
                    </>
                ) : null}
            </Surface>

            {defects.length ? (
                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.detail.defectsTitle')}</Caption>
                    <Surface testID="inspection-detail-defects">
                        {defects.map((r, i) => (
                            <YStack key={r.id ?? r.item_key ?? i}>
                                {i > 0 ? <Divider /> : null}
                                <YStack padding={space[3]} gap={2}>
                                    <XStack justifyContent="space-between" gap={space[2]}>
                                        <Body fontSize={14} fontWeight="700" flex={1}>
                                            {r.label}
                                        </Body>
                                        {r.severity ? <Micro tone="danger">{t(`inspection.defect.severity.${r.severity}`, { defaultValue: String(r.severity) }).toUpperCase()}</Micro> : null}
                                    </XStack>
                                    {r.category ? <Micro>{r.category}</Micro> : null}
                                    {r.comments ? <Secondary fontSize={13}>{r.comments}</Secondary> : null}
                                    <Micro tabular>{t('inspection.detail.photos', { count: r.photos?.length ?? 0 })}</Micro>
                                </YStack>
                            </YStack>
                        ))}
                    </Surface>
                </YStack>
            ) : null}

            {submission.custom_field_values?.length ? (
                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.detail.valuesTitle')}</Caption>
                    <Surface testID="inspection-detail-values">
                        {submission.custom_field_values
                            .filter((v) => v.type !== 'pass-fail')
                            .map((v, i) => {
                                const raw = v.value as { url?: string; id?: string } | string | number | boolean | null | undefined;
                                const isFile = raw && typeof raw === 'object' && 'url' in raw;
                                const shown = isFile ? null : typeof raw === 'boolean' ? (raw ? t('inspection.field.yes') : t('inspection.field.no')) : raw == null ? '—' : String(raw);
                                return (
                                    <YStack key={v.custom_field ?? i}>
                                        {i > 0 ? <Divider /> : null}
                                        <XStack padding={space[3]} justifyContent="space-between" gap={space[3]} alignItems="center" testID={`inspection-detail-value-${v.custom_field ?? i}`}>
                                            <Caption flex={1}>{v.label ?? v.custom_field}</Caption>
                                            {isFile && (raw as { url?: string }).url ? (
                                                <Image source={{ uri: (raw as { url: string }).url }} style={{ width: 72, height: 54, borderRadius: 6 }} />
                                            ) : (
                                                <Body fontSize={15} textAlign={endAlign()} flexShrink={1} tabular>
                                                    {shown}
                                                </Body>
                                            )}
                                        </XStack>
                                    </YStack>
                                );
                            })}
                    </Surface>
                </YStack>
            ) : null}

            {submission.files?.length ? (
                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.detail.files')}</Caption>
                    <XStack gap={space[2]} flexWrap="wrap" testID="inspection-detail-files">
                        {submission.files.map((f) =>
                            f.url && String(f.content_type ?? '').startsWith('image/') ? (
                                <Image key={f.id} source={{ uri: f.url }} style={{ width: 96, height: 72, borderRadius: 8 }} accessibilityLabel={f.original_filename ?? f.id} />
                            ) : (
                                <Micro key={f.id}>📎 {f.original_filename ?? f.id}</Micro>
                            )
                        )}
                    </XStack>
                </YStack>
            ) : null}

            <YStack gap={space[2]}>
                <Caption paddingHorizontal={space[1]}>{t('inspection.detail.itemsTitle')}</Caption>
                {others.length ? (
                    <Surface testID="inspection-detail-items">
                        {others.map((r, i) => (
                            <YStack key={r.id ?? r.item_key ?? i}>
                                {i > 0 ? <Divider /> : null}
                                <XStack padding={space[3]} justifyContent="space-between" gap={space[3]}>
                                    <Body fontSize={14} flex={1}>
                                        {r.label}
                                    </Body>
                                    <Micro tone={r.status === 'not_applicable' ? 'muted' : 'success'}>{r.status === 'not_applicable' ? t('inspection.checklist.naRecorded') : `✓ ${t('inspection.checklist.passRecorded')}`}</Micro>
                                </XStack>
                            </YStack>
                        ))}
                    </Surface>
                ) : !defects.length ? (
                    <Secondary fontSize={13} testID="inspection-detail-no-items">{t('inspection.detail.noItems')}</Secondary>
                ) : null}
            </YStack>
        </ScrollView>
    );
}

export default InspectionDetailScreen;
