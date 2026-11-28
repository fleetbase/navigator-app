/**
 * Inspection — review and sign (design round 3, s40 "InspectSign").
 *
 * The last look, top to bottom as the mockup has it: three counts (OK, Problem,
 * Skipped); each problem raised, with its level's mark, its photos and its
 * part, opening its problem view to change it; the vehicle with its plate in
 * full, the odometer, and when the check was done and how long it took; then
 * the signature, on the app's own pad (proof/SignaturePad), with the words the
 * driver is putting their name to; and "Send the check".
 *
 * Signing is the certification: a signature that passes the pad's test ticks
 * it, Clear unticks it. A form that carries its own signature field was signed
 * on the checklist, so here the driver confirms the same words with a tick.
 *
 * Submit goes through the adapter, so with no signal it queues with its
 * idempotency key and the driver is told the check is kept on the phone and
 * goes when there is signal, rather than a failure. The draft is discarded
 * only once the submit has landed or queued. When a step of an order asked for
 * the check, it is recorded against that step (`inspectionLedger`) so the
 * order goes on (or is held, if the vehicle is unsafe).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack } from 'tamagui';
import { Body } from '../ui/Text';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import {
    useInspectionForm,
    useInspectionDraft,
    useSubmitInspection,
    inspectionDrafts,
    draftProgress,
    groupsOf,
    isUnsafe,
    unsafeOnFail,
    severityRank,
    fieldsOf,
    isPassFail,
    odometerFieldOf,
    signatureFieldOf,
    type InspectionFormRecord,
    type SubmitOutcome,
} from '../data';
import { recordInspection, type InspectionOrderContext } from '../data/inspectionLedger';
import { InspectionOrderBanner } from './inspection/OrderBanner';
import { formatClock, formatDay, formatNumber } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { NO_INK, SignaturePad, isSignature, type Ink, type SignaturePadHandle } from './proof/SignaturePad';
import { FactRow, FieldLabel, FootBar, FootButton, GUTTER, InfoNote, InlineInput, InspectIcon, LevelMark, Panel, ScreenTop, cleanReading, levelOf, partName, useInk } from './inspection/parts';

/** What the result screen is told about the check, which is gone from the phone once it is sent. */
export interface InspectionFindings {
    /** The checks found unsafe, by their question. */
    unsafeItems: string[];
    /** How many photos the problems carry. */
    photos: number;
}

export interface InspectionReviewScreenProps {
    formId: string;
    vehicleId?: string;
    vehicleName?: string;
    vehiclePlate?: string;
    driverId?: string;
    driverName?: string;
    seedForm?: InspectionFormRecord | null;
    /** The vehicle's last reading: sent when the driver typed none. */
    odometerSeed?: number;
    /**
     * The order and step the inspection is for, when a step of an order needs
     * it. The submission carries the link, and once it has landed or queued it
     * is recorded against the step (`inspectionLedger`) so the order goes on.
     */
    orderContext?: InspectionOrderContext | null;
    onSubmitted?: (outcome: SubmitOutcome, form: InspectionFormRecord, unsafe: boolean, findings: InspectionFindings) => void;
    /** Back to the checklist. */
    onBack?: () => void;
    /** A problem, opened again to change it. */
    onEditDefect?: (fieldId: string) => void;
    /** Injected in tests so the certification time is stable. */
    now?: () => Date;
}

function CountTile({ value, label, tone, testID }: { value: number; label: string; tone?: 'success' | 'warning' | 'danger'; testID?: string }) {
    const fill = tone === 'success' ? '$successFill' : tone === 'warning' ? '$warningFill' : tone === 'danger' ? '$dangerFill' : '$surface';
    const border = tone === 'success' ? '$successBorder' : tone === 'warning' ? '$warningBorder' : tone === 'danger' ? '$dangerBorder' : '$border';
    return (
        <YStack flex={1} flexBasis={0} gap={2} paddingVertical={12} paddingHorizontal={14} borderRadius={16} backgroundColor={fill as never} borderWidth={1} borderColor={border as never} accessible accessibilityLabel={`${value} ${label}`} testID={testID}>
            <Body fontSize={28} lineHeight={34} fontWeight="800" tabular tone={tone ?? 'primary'}>
                {String(value)}
            </Body>
            <Body fontSize={13} lineHeight={17} fontWeight="700" tone={tone ?? 'secondary'} numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}

export function InspectionReviewScreen({ formId, vehicleId, vehicleName, vehiclePlate, driverId, driverName, seedForm, odometerSeed, orderContext, onSubmitted, onBack, onEditDefect, now = () => new Date() }: InspectionReviewScreenProps) {
    const { t } = useTranslation();
    const ink = useInk();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const position = useDeviceLocation();
    const { form, isLoading, failed, error, retry } = useInspectionForm(formId, seedForm);
    const draft = useInspectionDraft(formId, vehicleId);
    const { submit, isSubmitting } = useSubmitInspection();

    const [signature, setSignature] = useState<string | null>(null);
    const [padInk, setPadInk] = useState<Ink>(NO_INK);
    const [signing, setSigning] = useState(false);
    const [failedMessage, setFailedMessage] = useState<string | null>(null);
    const [editingReading, setEditingReading] = useState(false);
    const pad = useRef<SignaturePadHandle>(null);

    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const unsafe = useMemo(() => isUnsafe(draft, form), [draft, form]);
    const groupOf = useMemo(() => {
        const out = new Map<string, string>();
        for (const group of groupsOf(form)) for (const field of group.fields) out.set(field.id, partName(group, t));
        return out;
    }, [form, t]);
    const defects = useMemo(
        () =>
            fieldsOf(form)
                .filter(isPassFail)
                .map((item) => ({ item, answer: draft?.answers[item.id] }))
                .filter(({ answer }) => answer?.passed === false)
                .sort((a, b) => Number(unsafeOnFail(b.item, b.answer)) - Number(unsafeOnFail(a.item, a.answer)) || severityRank(b.answer?.severity) - severityRank(a.answer?.severity)),
        [form, draft]
    );

    /*
     * Odometer and signature are ordinary fields when the form carries them,
     * answered on the checklist. Otherwise the odometer typed at the start (or
     * the vehicle's last reading) and the signature here.
     */
    const meterField = useMemo(() => odometerFieldOf(form), [form]);
    const signatureField = useMemo(() => signatureFieldOf(form), [form]);
    const signedOnForm = Boolean(signatureField && draft?.values?.[signatureField.id]);
    const padSigns = !signatureField;
    const unit = String(meterField?.meta?.unit ?? 'km');
    const meterValue = meterField ? draft?.values?.[meterField.id] : undefined;
    const typedReading = draft?.odometer ? cleanReading(draft.odometer) : '';
    const odometer = meterValue != null ? String(meterValue) : typedReading || (odometerSeed != null ? String(odometerSeed) : '');
    const odometerInvalid = odometer !== '' && !Number.isFinite(Number(odometer));
    const askReading = !meterField && (editingReading || odometerInvalid || (odometer === '' && Boolean(form?.settings?.require_odometer)));
    const [readingText, setReadingText] = useState(typedReading);

    const startedAt = draft?.startedAt;
    const elapsedMinutes = startedAt ? Math.max(1, Math.round((now().getTime() - new Date(startedAt).getTime()) / 60000)) : undefined;
    const sameDay = startedAt ? new Date(startedAt).toDateString() === now().toDateString() : false;

    const skipped = progress.notApplicable + (progress.total - progress.answered);
    const okCount = Math.max(0, progress.answered - progress.defects - progress.notApplicable);
    const certified = padSigns ? Boolean(signature) : Boolean(draft?.certified) && signedOnForm;
    const odometerMissing = Boolean(form?.settings?.require_odometer) && odometer === '';
    const blocker = !progress.complete
        ? t('inspection.review.answerFirst')
        : odometerInvalid || odometerMissing
          ? t('inspection.review.enterOdometer')
          : !certified
            ? padSigns
                ? t('inspection.review.signToSend')
                : t('inspection.review.confirmToSend')
            : !driverId
              ? t('inspection.review.noDriver')
              : null;

    const onInk = useCallback(
        (next: Ink) => {
            setPadInk(next);
            setSigning(false);
            if (!isSignature(next.strokes)) {
                setSignature(null);
                return;
            }
            setTimeout(() => {
                void pad.current?.read().then((image) => {
                    if (!image) return;
                    setSignature(image);
                    inspectionDrafts.patch(formId, vehicleId, { certified: true });
                });
            }, 50);
        },
        [formId, vehicleId]
    );

    const clearSignature = useCallback(() => {
        setPadInk(NO_INK);
        setSignature(null);
        inspectionDrafts.patch(formId, vehicleId, { certified: false });
    }, [formId, vehicleId]);

    const commitReading = useCallback(() => {
        const value = cleanReading(readingText);
        if (value !== '' && !Number.isFinite(Number(value))) return;
        inspectionDrafts.patch(formId, vehicleId, { odometer: value });
        if (value !== '') setEditingReading(false);
    }, [readingText, formId, vehicleId]);

    const send = useCallback(async () => {
        if (!form || !draft || !driverId) return;
        setFailedMessage(null);
        const findings: InspectionFindings = {
            unsafeItems: defects.filter(({ item, answer }) => unsafeOnFail(item, answer)).map(({ item }) => item.label),
            photos: defects.reduce((n, { answer }) => n + (answer?.photos.length ?? 0), 0),
        };
        const signedAt = now().toISOString();
        const outcome = await submit(form, { ...draft, odometer, certified: true }, {
            driverId,
            vehicleId,
            location: toGeoPoint(position),
            signature: signature || driverName ? { image: signature ?? undefined, name: driverName, signed_at: signedAt } : null,
            order: orderContext ? { orderId: orderContext.orderId, activityCode: orderContext.activityCode } : null,
            now,
        });
        if (outcome.kind === 'failed') {
            setFailedMessage(outcome.message);
            return;
        }
        if (orderContext) {
            /*
             * Sent: its id goes with the step. Queued: there is no id until the
             * queue has sent it, so the queue entry is kept instead and the
             * order screen waits for it, saying so.
             */
            const serverUnsafe = outcome.kind === 'sent' ? outcome.submission.meta?.unsafe : undefined;
            recordInspection(orderContext.orderId, orderContext.activityCode, {
                submissionId: outcome.kind === 'sent' ? outcome.submission.id : undefined,
                queued: outcome.kind === 'queued',
                queueId: outcome.kind === 'queued' ? outcome.queueId : undefined,
                idempotencyKey: outcome.kind === 'queued' ? outcome.idempotencyKey : undefined,
                formId,
                /*
                 * The server's own finding when it gave one, which is what the
                 * step is checked against. A checklist the server could not
                 * read that from counts a failed result as unsafe, there and
                 * here; queued, the draft's reading is all there is.
                 */
                unsafe:
                    typeof serverUnsafe === 'boolean'
                        ? serverUnsafe
                        : outcome.kind === 'sent'
                          ? unsafe || outcome.submission.result === 'failed'
                          : unsafe,
            });
        }
        onSubmitted?.(outcome, form, unsafe, findings);
    }, [defects, draft, driverId, driverName, form, formId, now, odometer, onSubmitted, orderContext, position, signature, submit, unsafe, vehicleId]);

    if (isLoading && !form) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={GUTTER} gap={12} testID="review-loading">
                <Skeleton height={88} />
                <Skeleton height={140} />
                <Skeleton height={150} />
            </YStack>
        );
    }
    if (!form || !draft) {
        return (
            <YStack flex={1} backgroundColor="$background">
                <ScreenTop backLabel={t('inspection.defect.back')} onBack={onBack} title={t('inspection.review.title')} />
                <YStack flex={1} padding={GUTTER} justifyContent="center">
                    <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="review-error" />
                </YStack>
            </YStack>
        );
    }

    const checkedText = startedAt
        ? t('inspection.review.checkedAt', {
              day: sameDay ? t('inspection.review.today') : formatDay(startedAt),
              time: formatClock(startedAt),
              minutes: elapsedMinutes ?? 1,
          })
        : '—';
    const confirmWords = driverName ? t('inspection.review.confirm', { name: driverName }) : t('inspection.review.confirmNoName');

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-review">
            <ScreenTop backLabel={t('inspection.defect.back')} onBack={onBack} title={t('inspection.review.title')} />
            <ScrollView style={screen} scrollEnabled={!signing} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 24, gap: 14 }}>
                <InspectionOrderBanner order={orderContext} t={t} />

                <XStack gap={8}>
                    <CountTile value={okCount} label={t('inspection.review.ok')} tone="success" testID="review-passed" />
                    <CountTile value={progress.defects} label={t('inspection.review.problem')} tone={progress.defects ? (unsafe ? 'danger' : 'warning') : undefined} testID="review-defects" />
                    <CountTile value={skipped} label={t('inspection.review.skipped')} testID="review-skipped" />
                </XStack>

                {defects.length ? (
                    <YStack gap={8} testID="review-defect-list">
                        {defects.map(({ item, answer }) => {
                            const level = levelOf(unsafeOnFail(item, answer) ? { unsafe: true } : answer);
                            const note = answer?.comments?.trim();
                            return (
                                <Panel
                                    key={item.id}
                                    tone={level === 'unsafe' ? 'danger' : level === 'repair' ? 'warning' : undefined}
                                    onPress={onEditDefect ? () => onEditDefect(item.id) : undefined}
                                    label={[note || item.label, t(`inspection.defect.level.${level}.name`)].join('. ')}
                                    testID={`review-defect-${item.id}`}
                                >
                                    <XStack alignItems="center" gap={12}>
                                        <LevelMark level={level} />
                                        <YStack flex={1} minWidth={0} gap={2}>
                                            <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={2}>
                                                {note || item.label}
                                            </Body>
                                            <Body fontSize={13} lineHeight={18} tone="secondary" numberOfLines={2}>
                                                {[t(`inspection.defect.level.${level}.name`), t('inspection.checklist.photoCount', { count: answer?.photos.length ?? 0 }), note ? item.label : groupOf.get(item.id)].filter(Boolean).join(' · ')}
                                            </Body>
                                        </YStack>
                                        {onEditDefect ? <InspectIcon name="chevron" size={16} strokeWidth={2.4} color={ink('textSecondary')} /> : null}
                                    </XStack>
                                </Panel>
                            );
                        })}
                    </YStack>
                ) : null}

                <Panel padding={0} paddingHorizontal={14} paddingVertical={4} testID="review-facts">
                    <FactRow label={t('inspection.review.vehicle')} first testID="review-vehicle">
                        <Body flexShrink={1} textAlign="right" fontSize={15} lineHeight={20} fontWeight="800">
                            {vehicleName ?? t('vehicle.unnamed')}
                            {vehiclePlate ? (
                                <>
                                    {' · '}
                                    <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600">
                                        {vehiclePlate}
                                    </Body>
                                </>
                            ) : null}
                        </Body>
                    </FactRow>
                    {!askReading ? (
                        <XStack
                            onPress={meterField ? undefined : () => {
                                setReadingText(odometer);
                                setEditingReading(true);
                            }}
                            accessibilityRole={meterField ? 'text' : 'button'}
                        >
                            <YStack flex={1}>
                                <FactRow label={t('inspection.review.odometerLabel')} testID="review-odometer">
                                    <Body fontFamily="$mono" fontSize={15} lineHeight={20} fontWeight="600" tabular>
                                        {odometer !== '' ? `${formatNumber(Number(odometer))} ${unit}` : '—'}
                                    </Body>
                                </FactRow>
                            </YStack>
                        </XStack>
                    ) : null}
                    <FactRow label={t('inspection.review.checked')} testID="review-minutes">
                        <Body fontSize={15} lineHeight={20} fontWeight="800" tabular textAlign="right">
                            {checkedText}
                        </Body>
                    </FactRow>
                </Panel>

                {askReading ? (
                    <YStack gap={8} testID="review-odometer">
                        <FieldLabel>{t('inspection.begin.odometer')}</FieldLabel>
                        <InlineInput
                            value={readingText}
                            onChangeText={setReadingText}
                            onBlur={commitReading}
                            onSubmitEditing={commitReading}
                            keyboardType="numeric"
                            returnKeyType="done"
                            mono
                            fontSize={24}
                            placeholder={odometerSeed != null ? String(odometerSeed) : undefined}
                            invalid={readingText !== '' && !Number.isFinite(Number(cleanReading(readingText)))}
                            accessibilityLabel={t('inspection.begin.odometer')}
                            accessory={
                                <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary">
                                    {unit}
                                </Body>
                            }
                            testID="review-odometer-input"
                        />
                        {odometerInvalid ? (
                            <Body fontSize={13} lineHeight={18} tone="danger">
                                {t('inspection.review.odometerInvalid')}
                            </Body>
                        ) : null}
                    </YStack>
                ) : null}

                {padSigns ? (
                    <YStack gap={8} testID="review-signature">
                        <FieldLabel
                            aside={
                                padInk.strokes.length ? (
                                    <Body fontSize={13} lineHeight={17} fontWeight="800" tone="brand" paddingVertical={8} onPress={clearSignature} accessibilityRole="button" testID="review-signature-clear">
                                        {t('inspection.review.clearSignature')}
                                    </Body>
                                ) : undefined
                            }
                        >
                            {t('inspection.review.signWithFinger')}
                        </FieldLabel>
                        <View style={{ height: 150 }}>
                            <SignaturePad ref={pad} ink={padInk} onInk={onInk} onBegin={() => setSigning(true)} variant="upright" hint={t('inspection.field.signHere')} label={t('inspection.review.padLabel', { name: driverName ?? '' })} testID="review-signature-pad" />
                        </View>
                        <Body fontSize={13} lineHeight={19} tone="secondary">
                            {confirmWords}
                        </Body>
                    </YStack>
                ) : (
                    <XStack
                        alignItems="flex-start"
                        gap={12}
                        padding={14}
                        borderRadius={18}
                        backgroundColor="$surface"
                        borderWidth={draft.certified ? 1.5 : 1}
                        borderColor={draft.certified ? '$primary' : '$border'}
                        onPress={() => inspectionDrafts.patch(formId, vehicleId, { certified: !draft.certified })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: Boolean(draft.certified) }}
                        testID="review-certify"
                    >
                        <YStack width={24} height={24} borderRadius={7} flexShrink={0} alignItems="center" justifyContent="center" borderWidth={1.5} borderColor={draft.certified ? '$primary' : '$textMuted'} backgroundColor={draft.certified ? '$primary' : 'transparent'}>
                            {draft.certified ? <InspectIcon name="check" size={14} strokeWidth={3.4} color={ink('onPrimary')} /> : null}
                        </YStack>
                        <YStack flex={1} gap={4}>
                            <Body fontSize={14} lineHeight={20}>
                                {confirmWords}
                            </Body>
                            <Body fontSize={13} lineHeight={18} fontWeight="700" tone={signedOnForm ? 'success' : 'warning'} testID="review-signed-on-form">
                                {signedOnForm ? t('inspection.review.signedOnChecklist') : t('inspection.review.signOnChecklist')}
                            </Body>
                        </YStack>
                    </XStack>
                )}
            </ScrollView>

            <FootBar testID="review-actions">
                {failedMessage ? <InfoNote tone="danger" testID="review-failed">{`${t('inspection.review.failed')} ${failedMessage}`}</InfoNote> : null}
                {!isOnline ? <InfoNote testID="review-offline">{orderContext ? t('inspection.forOrder.offlineNote') : t('inspection.review.offlineNote')}</InfoNote> : null}
                {blocker ? <FootButton kind="off" label={blocker} testID="review-submit" /> : <FootButton label={t('inspection.review.submit')} loading={isSubmitting} onPress={() => void send()} testID="review-submit" />}
            </FootBar>
        </YStack>
    );
}

export default InspectionReviewScreen;
