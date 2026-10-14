/**
 * Submitted — R2 frame E3d, the "vehicle marked unsafe" outcome, and its two
 * calmer siblings: defects without an unsafe mark, and a clean pass.
 *
 * Identifiers for the inspection, the defect record and the work order are
 * shown in full when the server has answered; a queued submission has none
 * yet, and says so rather than inventing them.
 */
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import type { InspectionSubmissionRecord } from '../data';
import { formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface InspectionResultScreenProps {
    submission: InspectionSubmissionRecord;
    vehicleName?: string;
    /** Decided at review time from the draft; the server's own flag agrees once it answers. */
    unsafe?: boolean;
    onChooseVehicle?: () => void;
    onMessageDispatch?: () => void;
    onDone?: () => void;
}

export function InspectionResultScreen({ submission, vehicleName, unsafe, onChooseVehicle, onMessageDispatch, onDone }: InspectionResultScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const failures = Number(submission.failed_items ?? 0) || 0;
    const hasDefects = failures > 0 || Boolean(submission.has_failures);
    const outOfService = Boolean(unsafe ?? submission.meta?.unsafe);
    const vehicle = vehicleName ?? submission.vehicle_name ?? submission.vehicle?.name ?? t('vehicle.unnamed');
    const kind = outOfService ? 'unsafe' : hasDefects ? 'defects' : 'passed';

    return (
        <YStack flex={1} backgroundColor="$background" testID={`inspection-result-${kind}`}>
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}>
                <YStack gap={space[2]}>
                    <Micro tone={kind === 'unsafe' ? 'danger' : kind === 'defects' ? 'warning' : 'success'} fontSize={28}>
                        {kind === 'unsafe' ? '!' : kind === 'defects' ? '!' : '✓'}
                    </Micro>
                    <Heading fontSize={28}>
                        {kind === 'unsafe' ? t('inspection.result.unsafeTitle', { vehicle }) : kind === 'defects' ? t('inspection.result.defectsTitle') : t('inspection.result.passedTitle')}
                    </Heading>
                    <Secondary>{t(`inspection.result.${kind}Body`)}</Secondary>
                </YStack>

                <Surface padded>
                    <YStack gap={space[3]}>
                        <YStack gap={2}>
                            <Caption>{t('inspection.result.record')}</Caption>
                            {submission.queued ? <Micro tone="brand" testID="result-queued">{t('inspection.result.queued')}</Micro> : <Identifier value={submission.id} boxed={false} testID="result-record" />}
                        </YStack>
                        {submission.issue?.id ? (
                            <YStack gap={2}>
                                <Caption>{t('inspection.result.defectRecord')}</Caption>
                                <Identifier value={submission.issue.id} boxed={false} testID="result-issue" />
                            </YStack>
                        ) : null}
                        {submission.work_order?.id ? (
                            <YStack gap={2}>
                                <Caption>{t('inspection.result.workOrder')}</Caption>
                                <Identifier value={submission.work_order.id} boxed={false} testID="result-work-order" />
                            </YStack>
                        ) : null}
                        <XStack justifyContent="space-between">
                            <Micro tabular>{t('inspection.result.submittedAt', { time: formatClock(submission.submitted_at) })}</Micro>
                            {submission.queued ? <Micro tone="brand">{t('inspection.result.queued')}</Micro> : null}
                        </XStack>
                    </YStack>
                </Surface>

                {submission.queued ? <Banner tone="neutral" message={t('inspection.review.offlineNote')} /> : null}

                {kind === 'unsafe' ? (
                    <YStack gap={space[2]} testID="result-what-now">
                        <Body fontWeight="700">{t('inspection.result.whatNow')}</Body>
                        {[1, 2, 3].map((n) => (
                            <XStack key={n} gap={space[3]}>
                                <Body fontWeight="800" tabular tone="brand">
                                    {n}
                                </Body>
                                <Secondary flex={1} fontSize={14}>
                                    {t(`inspection.result.step${n}`)}
                                </Secondary>
                            </XStack>
                        ))}
                    </YStack>
                ) : null}
            </ScrollView>

            <YStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="result-actions">
                {kind === 'unsafe' && onChooseVehicle ? (
                    <Button onPress={onChooseVehicle} testID="result-choose-vehicle">
                        {t('inspection.result.chooseVehicle')}
                    </Button>
                ) : null}
                {kind === 'unsafe' && onMessageDispatch ? (
                    <Button variant="secondary" onPress={onMessageDispatch} testID="result-message-dispatch">
                        {t('inspection.result.messageDispatch')}
                    </Button>
                ) : null}
                <Button variant={kind === 'unsafe' ? 'ghost' : 'primary'} onPress={onDone} testID="result-done">
                    {t('inspection.result.done')}
                </Button>
            </YStack>
        </YStack>
    );
}

export default InspectionResultScreen;
