/**
 * Review & certification — R2 frame E3c.
 *
 * The last look: counts, every defect raised, the odometer, and the driver's
 * certification — a tick, and a signature when the form asks for one. Submit
 * goes through the adapter, so offline it queues with its idempotency key and
 * the driver sees "stored on device now, sent when you're back online"
 * rather than a failure. The draft is discarded only once the submit has
 * either landed or queued.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Field } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import {
    useInspectionForm,
    useInspectionDraft,
    useSubmitInspection,
    inspectionDrafts,
    draftProgress,
    isUnsafe,
    severityRank,
    fieldsOf,
    isPassFail,
    odometerFieldOf,
    signatureFieldOf,
    type InspectionFormRecord,
    type SubmitOutcome,
} from '../data';
import { toBareBase64 } from '../data/useProofCapture';
import { formatDateTime, formatDuration } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

const lazySignaturePad = () => require('react-native-signature-canvas').default as React.ComponentType<Record<string, unknown>>;

export interface InspectionReviewScreenProps {
    formId: string;
    vehicleId?: string;
    vehicleName?: string;
    driverId?: string;
    driverName?: string;
    seedForm?: InspectionFormRecord | null;
    /** Prefill from the vehicle's last reading; the driver confirms it. */
    odometerSeed?: number;
    onSubmitted?: (outcome: SubmitOutcome, form: InspectionFormRecord, unsafe: boolean) => void;
    /** Injected in tests so the certification time is stable. */
    now?: () => Date;
}

function Stat({ value, label, tone, testID }: { value: string; label: string; tone?: 'success' | 'danger' | 'primary'; testID?: string }) {
    return (
        <YStack flex={1} gap={2} testID={testID}>
            <Body fontSize={22} fontWeight="800" tabular tone={tone ?? 'primary'}>
                {value}
            </Body>
            <Micro fontSize={10}>{label}</Micro>
        </YStack>
    );
}

export function InspectionReviewScreen({ formId, vehicleId, vehicleName, driverId, driverName, seedForm, odometerSeed, onSubmitted, now = () => new Date() }: InspectionReviewScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { form, isLoading, failed, error, retry } = useInspectionForm(formId, seedForm);
    const draft = useInspectionDraft(formId, vehicleId);
    const { submit, isSubmitting } = useSubmitInspection();

    const [signature, setSignature] = useState<string | null>(null);
    const [signing, setSigning] = useState(false);
    const [failedMessage, setFailedMessage] = useState<string | null>(null);
    const signatureRef = useRef<{ readSignature: () => void } | null>(null);

    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const unsafe = useMemo(() => isUnsafe(draft, form), [draft, form]);
    const defects = useMemo(
        () =>
            fieldsOf(form)
                .filter(isPassFail)
                .map((item) => ({ item, answer: draft?.answers[item.id] }))
                .filter(({ answer }) => answer?.passed === false)
                .sort((a, b) => severityRank(b.answer?.severity) - severityRank(a.answer?.severity)),
        [form, draft]
    );
    /*
     * Second cut: odometer and signature are ordinary fields when the form
     * carries them, answered on the checklist. The review only asks for what
     * the form did not — a signature the settings require, an odometer the
     * form has no meter field for.
     */
    const meterField = useMemo(() => odometerFieldOf(form), [form]);
    const signatureField = useMemo(() => signatureFieldOf(form), [form]);
    const signedOnForm = Boolean(signatureField && draft?.values?.[signatureField.id]);
    const requiresSignature = Boolean(form?.settings?.require_signature) && !signatureField;
    const meterValue = meterField ? draft?.values?.[meterField.id] : undefined;
    const odometer = meterValue != null ? String(meterValue) : (draft?.odometer ?? (odometerSeed != null ? String(odometerSeed) : ''));
    const odometerInvalid = odometer !== '' && !Number.isFinite(Number(odometer));
    const elapsedS = draft?.startedAt ? Math.max(0, (now().getTime() - new Date(draft.startedAt).getTime()) / 1000) : 0;
    const canSubmit = progress.complete && Boolean(draft?.certified) && !odometerInvalid && (!requiresSignature || Boolean(signature)) && Boolean(driverId);

    const send = useCallback(async () => {
        if (!form || !draft || !driverId) return;
        setFailedMessage(null);
        const outcome = await submit(form, { ...draft, odometer }, {
            driverId,
            vehicleId,
            location: toGeoPoint(position),
            signature: signature || driverName ? { image: signature ?? undefined, name: driverName, signed_at: now().toISOString() } : null,
            now,
        });
        if (outcome.kind === 'failed') {
            setFailedMessage(outcome.message);
            return;
        }
        onSubmitted?.(outcome, form, unsafe);
    }, [draft, driverId, driverName, form, now, odometer, onSubmitted, position, signature, submit, unsafe, vehicleId]);

    if (isLoading && !form) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="review-loading">
                <Skeleton height={100} />
                <Skeleton height={200} />
            </YStack>
        );
    }
    if (!form || !draft) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="review-error" />
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-review">
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}>
                <YStack gap={2}>
                    <Heading fontSize={20}>{t('inspection.review.title')}</Heading>
                    <Micro>{[vehicleName, t('inspection.review.summary', { answered: progress.answered, total: progress.total, defects: progress.defects })].filter(Boolean).join(' · ')}</Micro>
                </YStack>

                {!isOnline ? <Banner tone="neutral" message={t('ui.offline')} testID="review-offline" /> : null}

                <Surface hero padded>
                    <XStack gap={space[3]}>
                        <Stat value={String(progress.passed)} label={t('inspection.review.passed')} tone="success" testID="review-passed" />
                        <Stat value={String(progress.defects)} label={t('inspection.review.defects')} tone={progress.defects ? 'danger' : 'primary'} testID="review-defects" />
                        <Stat value={formatDuration(elapsedS)} label={t('inspection.review.minutes')} testID="review-minutes" />
                    </XStack>
                </Surface>

                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.review.defectsRaised')}</Caption>
                    {defects.length ? (
                        <Surface testID="review-defect-list">
                            {defects.map(({ item, answer }, i) => (
                                <YStack key={item.id}>
                                    {i > 0 ? <Divider /> : null}
                                    <YStack padding={space[3]} gap={2} testID={`review-defect-${item.id}`}>
                                        <XStack justifyContent="space-between" gap={space[2]}>
                                            <Body fontSize={14} fontWeight="700" flex={1}>
                                                {item.label}
                                            </Body>
                                            <Micro tone="danger">{t(`inspection.defect.severity.${answer?.severity ?? 'medium'}`).toUpperCase()}</Micro>
                                        </XStack>
                                        <Micro>
                                            {[answer?.comments, t('inspection.checklist.photoCount', { count: answer?.photos.length ?? 0 }), answer?.unsafe ? t('inspection.review.unsafeMark') : null]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Micro>
                                    </YStack>
                                </YStack>
                            ))}
                        </Surface>
                    ) : (
                        <Secondary fontSize={13} testID="review-no-defects">{t('inspection.review.noDefects')}</Secondary>
                    )}
                </YStack>

                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.review.odometer')}</Caption>
                    <Field
                        value={odometer}
                        onChangeText={(v) => inspectionDrafts.patch(formId, vehicleId, { odometer: v })}
                        keyboardType="numeric"
                        tabular
                        disabled={Boolean(meterField)}
                        hint={meterField ? undefined : t('inspection.review.odometerHint')}
                        error={odometerInvalid ? t('inspection.review.odometerInvalid') : undefined}
                        testID="review-odometer"
                    />
                </YStack>

                <YStack gap={space[2]}>
                    <Caption paddingHorizontal={space[1]}>{t('inspection.review.certification')}</Caption>
                    <Surface padded>
                        <XStack
                            gap={space[3]}
                            alignItems="flex-start"
                            onPress={() => inspectionDrafts.patch(formId, vehicleId, { certified: !draft.certified })}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: Boolean(draft.certified) }}
                            testID="review-certify"
                        >
                            <YStack
                                width={24}
                                height={24}
                                borderRadius={6}
                                borderWidth={1.5}
                                borderColor={draft.certified ? '$primary' : '$border'}
                                backgroundColor={draft.certified ? '$primaryFill' : '$surface'}
                                alignItems="center"
                                justifyContent="center"
                            >
                                {draft.certified ? (
                                    <Micro tone="brand" fontSize={14}>
                                        ✓
                                    </Micro>
                                ) : null}
                            </YStack>
                            <YStack flex={1} gap={2}>
                                <Body fontSize={14}>{t('inspection.review.certify')}</Body>
                                <Micro tabular>{[driverName, formatDateTime(now().toISOString())].filter(Boolean).join(' · ')}</Micro>
                            </YStack>
                        </XStack>
                        {signedOnForm ? (
                            <Micro marginTop={space[3]} tone="success" testID="review-signed-on-form">
                                ✓ {t('inspection.review.signed')}
                            </Micro>
                        ) : null}
                        {requiresSignature ? (
                            <YStack marginTop={space[3]} gap={space[2]} testID="review-signature">
                                {signature ? (
                                    <XStack justifyContent="space-between" alignItems="center">
                                        <Micro tone="success">✓ {t('inspection.review.signed')}</Micro>
                                        <Button variant="ghost" height={36} onPress={() => setSignature(null)} testID="review-signature-clear">
                                            {t('inspection.review.clearSignature')}
                                        </Button>
                                    </XStack>
                                ) : signing ? (
                                    <>
                                        <View style={{ height: 220 }}>
                                            {(() => {
                                                const SignaturePad = lazySignaturePad();
                                                return (
                                                    <SignaturePad
                                                        ref={signatureRef}
                                                        onOK={(data: string) => {
                                                            setSignature(toBareBase64(data));
                                                            setSigning(false);
                                                        }}
                                                        webStyle=".m-signature-pad--footer { display: none; }"
                                                    />
                                                );
                                            })()}
                                        </View>
                                        <Button variant="secondary" onPress={() => signatureRef.current?.readSignature()} testID="review-signature-done">
                                            {t('common.done')}
                                        </Button>
                                    </>
                                ) : (
                                    <Button variant="secondary" onPress={() => setSigning(true)} testID="review-sign">
                                        {t('inspection.review.signature')}
                                    </Button>
                                )}
                            </YStack>
                        ) : null}
                    </Surface>
                </YStack>

                {!progress.complete ? <Micro tone="warning" testID="review-incomplete">{t('inspection.review.incomplete')}</Micro> : null}
                {progress.complete && !draft.certified ? <Micro tone="warning" testID="review-needs-certification">{t('inspection.review.needsCertification')}</Micro> : null}
                {progress.complete && draft.certified && requiresSignature && !signature ? <Micro tone="warning" testID="review-needs-signature">{t('inspection.review.needsSignature')}</Micro> : null}
                {failedMessage ? <Banner tone="danger" message={`${t('inspection.review.failed')} ${failedMessage}`} testID="review-failed" /> : null}
            </ScrollView>

            <YStack padding={space[4]} gap={space[1]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="review-actions">
                <Button onPress={() => void send()} disabled={!canSubmit} loading={isSubmitting} testID="review-submit">
                    {t('inspection.review.submit')}
                </Button>
                {!isOnline ? <Micro center>{t('inspection.review.offlineNote')}</Micro> : null}
            </YStack>
        </YStack>
    );
}

export default InspectionReviewScreen;
