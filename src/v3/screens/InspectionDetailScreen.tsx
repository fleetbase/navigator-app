/**
 * A past check — its record, read-only. Drawn with the round 3 inspection
 * pieces (s40's facts card and problem rows, s41's records) so the history
 * reads as the same thing the driver filed.
 *
 * The outcome as a mark, a word and a colour; when, the odometer and where it
 * came from; the identifiers of whatever the server opened from the problems
 * (the defect record, the work order), in full in mono; the problems first,
 * then the other answers, the files, and the checks that passed.
 */
import { useMemo } from 'react';
import { Image } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack } from 'tamagui';
import { Body } from '../ui/Text';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useInspectionSubmission, severityRank, type InspectionSubmissionRecord } from '../data';
import { formatDateTime, formatNumber } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { Eyebrow, FactRow, GUTTER, InspectIcon, LevelMark, Panel, StatusChip, levelOf, useInk } from './inspection/parts';

export interface InspectionDetailScreenProps {
    submissionId: string;
    seed?: InspectionSubmissionRecord | null;
}

const statusWords = (status?: string | null) => {
    const plain = String(status ?? '').replace(/[_-]+/g, ' ').trim();
    return plain ? plain[0].toUpperCase() + plain.slice(1) : '';
};

export function InspectionDetailScreen({ submissionId, seed }: InspectionDetailScreenProps) {
    const { t } = useTranslation();
    const ink = useInk();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { submission, isLoading, failed, error, retry } = useInspectionSubmission(submissionId, seed);

    const results = useMemo(() => submission?.item_results ?? [], [submission?.item_results]);
    const defects = useMemo(() => results.filter((r) => !r.passed && r.status !== 'not_applicable').sort((a, b) => severityRank(b.severity) - severityRank(a.severity)), [results]);
    const others = useMemo(() => results.filter((r) => r.passed || r.status === 'not_applicable'), [results]);

    if (isLoading && !submission) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={GUTTER} gap={12} testID="inspection-detail-loading">
                <Skeleton height={100} />
                <Skeleton height={220} />
            </YStack>
        );
    }
    if (!submission) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={GUTTER} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="inspection-detail-error" />
            </YStack>
        );
    }

    const failures = Number(submission.failed_items ?? 0) || defects.length;
    const unsafe = Boolean(submission.meta?.unsafe);
    const outcome = submission.queued
        ? { word: t('inspection.history.waiting'), tone: 'secondary' as const, fill: '$surfaceRaised', radius: 14, glyph: null, icon: 'clock' as const }
        : unsafe
          ? { word: t('inspection.history.unsafe'), tone: 'danger' as const, fill: '$danger', radius: 4, glyph: '×', icon: null }
          : failures > 0 || submission.has_failures
            ? { word: t('inspection.history.problems', { count: failures || 1 }), tone: 'warning' as const, fill: '$warning', radius: 9, glyph: '!', icon: null }
            : { word: t('inspection.history.passed'), tone: 'success' as const, fill: '$success', radius: 14, glyph: null, icon: 'check' as const };
    const vehicle = [submission.vehicle_name ?? submission.vehicle?.name].filter(Boolean).join('');

    return (
        <ScrollView style={screen} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 32, gap: 14 }} testID="inspection-detail">
            <YStack gap={8}>
                <Body fontSize={26} lineHeight={31} fontWeight="800" letterSpacing={-0.4} accessibilityRole="header">
                    {submission.form_name ?? t('inspection.title')}
                </Body>
                <XStack alignItems="center" gap={10}>
                    <YStack width={28} height={28} borderRadius={outcome.radius} alignItems="center" justifyContent="center" backgroundColor={outcome.fill as never}>
                        {outcome.icon ? (
                            <InspectIcon name={outcome.icon} size={14} strokeWidth={outcome.icon === 'check' ? 3.4 : 2.6} color={ink(outcome.icon === 'check' ? 'background' : 'textSecondary')} />
                        ) : (
                            <Body fontSize={14} lineHeight={18} fontWeight="800" color="$background">
                                {outcome.glyph}
                            </Body>
                        )}
                    </YStack>
                    <Body fontSize={16} lineHeight={21} fontWeight="800" tone={outcome.tone} testID={unsafe ? 'inspection-detail-unsafe' : undefined}>
                        {unsafe ? `${outcome.word} · ${t('inspection.unsafeShort')}` : outcome.word}
                    </Body>
                </XStack>
            </YStack>

            <Panel padding={0} paddingHorizontal={14} paddingVertical={4}>
                <FactRow first label={t('inspection.review.vehicle')}>
                    <Body flexShrink={1} textAlign="right" fontSize={15} lineHeight={20} fontWeight="800">
                        {vehicle || '—'}
                        {submission.vehicle?.plate_number ? (
                            <>
                                {' · '}
                                <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                                    {submission.vehicle.plate_number}
                                </Body>
                            </>
                        ) : null}
                    </Body>
                </FactRow>
                <FactRow label={t('inspection.detail.submitted')} testID="inspection-detail-submitted">
                    <Body fontSize={15} lineHeight={20} fontWeight="800" tabular>
                        {formatDateTime(submission.submitted_at)}
                    </Body>
                </FactRow>
                {submission.started_at ? (
                    <FactRow label={t('inspection.detail.started')} testID="inspection-detail-started">
                        <Body fontSize={15} lineHeight={20} fontWeight="800" tabular>
                            {formatDateTime(submission.started_at)}
                        </Body>
                    </FactRow>
                ) : null}
                {submission.odometer != null ? (
                    <FactRow label={t('inspection.detail.odometer')} testID="inspection-detail-odometer">
                        <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">{`${formatNumber(submission.odometer)} km`}</Body>
                    </FactRow>
                ) : null}
                {submission.source ? (
                    <FactRow label={t('inspection.detail.source')} testID="inspection-detail-source">
                        <Body fontSize={15} lineHeight={20} fontWeight="800">
                            {String(submission.source)}
                        </Body>
                    </FactRow>
                ) : null}
            </Panel>

            {submission.queued || submission.issue?.id || submission.work_order?.id ? (
                <Panel gap={12}>
                    {submission.queued ? (
                        <Body fontSize={14} lineHeight={20} tone="secondary">
                            {t('inspection.result.keptBody')}
                        </Body>
                    ) : null}
                    {!submission.queued ? (
                        <YStack gap={2}>
                            <Eyebrow>{t('inspection.result.record')}</Eyebrow>
                            <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                                {submission.id}
                            </Body>
                        </YStack>
                    ) : null}
                    {submission.issue?.id ? (
                        <XStack alignItems="center" gap={12} testID="inspection-detail-issue">
                            <YStack flex={1} gap={2}>
                                <Eyebrow>{t('inspection.detail.linkedIssue')}</Eyebrow>
                                <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                                    {submission.issue.id}
                                </Body>
                            </YStack>
                            {submission.issue.status ? <StatusChip label={statusWords(submission.issue.status)} /> : null}
                        </XStack>
                    ) : null}
                    {submission.work_order?.id ? (
                        <XStack alignItems="center" gap={12} testID="inspection-detail-work-order">
                            <YStack flex={1} gap={2}>
                                <Eyebrow>{t('inspection.detail.linkedWorkOrder')}</Eyebrow>
                                <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                                    {submission.work_order.id}
                                </Body>
                            </YStack>
                            {submission.work_order.status ? <StatusChip label={statusWords(submission.work_order.status)} /> : null}
                        </XStack>
                    ) : null}
                </Panel>
            ) : (
                <Panel>
                    <YStack gap={2}>
                        <Eyebrow>{t('inspection.result.record')}</Eyebrow>
                        <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                            {submission.id}
                        </Body>
                    </YStack>
                </Panel>
            )}

            {defects.length ? (
                <YStack gap={8} testID="inspection-detail-defects">
                    <Eyebrow>{t('inspection.detail.defectsTitle')}</Eyebrow>
                    {defects.map((r, i) => {
                        const level = levelOf({ severity: r.severity });
                        return (
                            <Panel key={r.id ?? r.item_key ?? i} tone={level === 'unsafe' ? 'danger' : level === 'repair' ? 'warning' : undefined}>
                                <XStack alignItems="flex-start" gap={12}>
                                    <LevelMark level={level} />
                                    <YStack flex={1} minWidth={0} gap={2}>
                                        <Body fontSize={16} lineHeight={21} fontWeight="800">
                                            {r.label}
                                        </Body>
                                        <Body fontSize={13} lineHeight={18} tone="secondary">
                                            {[t(`inspection.defect.level.${level}.name`), t('inspection.detail.photos', { count: r.photos?.length ?? 0 }), r.category].filter(Boolean).join(' · ')}
                                        </Body>
                                        {r.comments ? (
                                            <Body fontSize={14} lineHeight={20} marginTop={4}>
                                                {r.comments}
                                            </Body>
                                        ) : null}
                                    </YStack>
                                </XStack>
                            </Panel>
                        );
                    })}
                </YStack>
            ) : null}

            {submission.custom_field_values?.some((v) => v.type !== 'pass-fail') ? (
                <YStack gap={8}>
                    <Eyebrow>{t('inspection.detail.valuesTitle')}</Eyebrow>
                    <Panel padding={0} paddingHorizontal={14} paddingVertical={4} testID="inspection-detail-values">
                        {submission.custom_field_values
                            .filter((v) => v.type !== 'pass-fail')
                            .map((v, i) => {
                                const raw = v.value as { url?: string; id?: string } | string | number | boolean | null | undefined;
                                const isFile = raw && typeof raw === 'object' && 'url' in raw;
                                const shown = isFile ? null : typeof raw === 'boolean' ? (raw ? t('inspection.field.yes') : t('inspection.field.no')) : raw == null ? '—' : String(raw);
                                return (
                                    <FactRow key={v.custom_field ?? i} first={i === 0} label={String(v.label ?? v.custom_field ?? '')} testID={`inspection-detail-value-${v.custom_field ?? i}`}>
                                        {isFile && (raw as { url?: string }).url ? (
                                            <Image source={{ uri: (raw as { url: string }).url }} style={{ width: 72, height: 54, borderRadius: 8 }} />
                                        ) : (
                                            <Body fontSize={15} lineHeight={20} fontWeight="800" textAlign="right" flexShrink={1} tabular>
                                                {shown}
                                            </Body>
                                        )}
                                    </FactRow>
                                );
                            })}
                    </Panel>
                </YStack>
            ) : null}

            {submission.files?.length ? (
                <YStack gap={8}>
                    <Eyebrow>{t('inspection.detail.files')}</Eyebrow>
                    <XStack gap={8} flexWrap="wrap" testID="inspection-detail-files">
                        {submission.files.map((f) =>
                            f.url && String(f.content_type ?? '').startsWith('image/') ? (
                                <Image key={f.id} source={{ uri: f.url }} style={{ width: 96, height: 72, borderRadius: 12 }} accessibilityLabel={f.original_filename ?? f.id} />
                            ) : (
                                <XStack key={f.id} alignItems="center" gap={6} height={36} paddingHorizontal={12} borderRadius={12} backgroundColor="$surfaceRaised">
                                    <InspectIcon name="file" size={14} color={ink('textSecondary')} />
                                    <Body fontSize={13} lineHeight={17} fontWeight="700" tone="secondary" numberOfLines={1}>
                                        {f.original_filename ?? f.id}
                                    </Body>
                                </XStack>
                            )
                        )}
                    </XStack>
                </YStack>
            ) : null}

            <YStack gap={8}>
                <Eyebrow>{t('inspection.detail.itemsTitle')}</Eyebrow>
                {others.length ? (
                    <Panel padding={0} paddingHorizontal={14} paddingVertical={4} testID="inspection-detail-items">
                        {others.map((r, i) => {
                            const na = r.status === 'not_applicable';
                            return (
                                <XStack key={r.id ?? r.item_key ?? i} alignItems="center" gap={12} minHeight={46} paddingVertical={8} borderTopWidth={i ? 1 : 0} borderColor="$border">
                                    <Body flex={1} fontSize={15} lineHeight={20}>
                                        {r.label}
                                    </Body>
                                    <XStack alignItems="center" gap={6} flexShrink={0}>
                                        {na ? null : <InspectIcon name="check" size={14} strokeWidth={3.2} color={ink('successText')} />}
                                        <Body fontSize={13} lineHeight={17} fontWeight="800" tone={na ? 'secondary' : 'success'}>
                                            {na ? t('inspection.checklist.naRecorded') : t('inspection.checklist.ok')}
                                        </Body>
                                    </XStack>
                                </XStack>
                            );
                        })}
                    </Panel>
                ) : !defects.length ? (
                    <Body fontSize={14} lineHeight={20} tone="secondary" testID="inspection-detail-no-items">
                        {t('inspection.detail.noItems')}
                    </Body>
                ) : null}
            </YStack>
        </ScrollView>
    );
}

export default InspectionDetailScreen;
