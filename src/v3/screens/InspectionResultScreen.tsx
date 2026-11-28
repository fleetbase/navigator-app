/**
 * Inspection — the result (design round 3, s41 "InspectResult", the unsafe
 * outcome), and its two calmer siblings drawn the same way: problems that
 * leave the vehicle drivable, and a clean pass.
 *
 * A band across the top in the outcome's colour, with its own mark and shape
 * (a red square ×, an amber !, a green round ✓, so colour is never the only
 * sign), what it means in words, and what to do. Under it, "What happens now":
 * the check sent (or kept on the phone, to go when there is signal), what the
 * server opened from it (a repair job, a defect record), and what is left to
 * the driver. Then the records themselves, their identifiers in full in mono,
 * and the actions: another vehicle and the chat when it is unsafe, back to the
 * order when a step of an order asked for the check.
 *
 * Only what the server answered is claimed. A queued check has no record, no
 * repair job and no defect record yet, and the screen says it is waiting
 * rather than inventing them.
 */
import { useEffect } from 'react';
import { BackHandler } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { ScrollView } from '../ui/Scroll';
import { Body } from '../ui/Text';
import { useTranslation } from '../i18n/useTranslation';
import type { InspectionSubmissionRecord } from '../data';
import type { InspectionOrderContext } from '../data/inspectionLedger';
import { InspectionOrderBanner } from './inspection/OrderBanner';
import { formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { Eyebrow, FootBar, FootButton, GUTTER, InfoNote, InspectIcon, Panel, StatusChip, StepRow, useInk } from './inspection/parts';

export interface InspectionResultScreenProps {
    submission: InspectionSubmissionRecord;
    vehicleName?: string;
    /** Decided at review time from the draft; the server's own flag agrees once it answers. */
    unsafe?: boolean;
    /** The checks found unsafe, by their question, as the review knew them. */
    unsafeItems?: string[];
    /** How many photos the problems carried. */
    photos?: number;
    /**
     * The order and step the inspection was for. Done goes back to the order,
     * which takes the step by itself, unless the vehicle was found unsafe: then
     * the step is held, and this screen says so.
     */
    orderContext?: InspectionOrderContext | null;
    onChooseVehicle?: () => void;
    onMessageDispatch?: () => void;
    onDone?: () => void;
}

type Kind = 'unsafe' | 'defects' | 'passed';

const LOOK: Record<Kind, { fill: string; border: string; mark: string; radius: number; icon: 'close' | 'alert' | 'check'; tone: 'danger' | 'warning' | 'success' }> = {
    unsafe: { fill: '$dangerFill', border: '$dangerBorder', mark: '$danger', radius: 12, icon: 'close', tone: 'danger' },
    defects: { fill: '$warningFill', border: '$warningBorder', mark: '$warning', radius: 18, icon: 'alert', tone: 'warning' },
    passed: { fill: '$successFill', border: '$successBorder', mark: '$success', radius: 32, icon: 'check', tone: 'success' },
};

/** "in_progress" → "In progress": a server status in words. */
const statusWords = (status?: string | null) => {
    const plain = String(status ?? '').replace(/[_-]+/g, ' ').trim();
    return plain ? plain[0].toUpperCase() + plain.slice(1) : '';
};

function statusTone(status?: string | null): 'brand' | 'success' | 'warning' | 'muted' {
    const s = String(status ?? '').toLowerCase();
    if (['closed', 'resolved', 'completed', 'done', 'canceled', 'cancelled'].includes(s)) return 'success';
    if (['in_progress', 'started', 'pending', 'on_hold'].includes(s)) return 'warning';
    return s ? 'brand' : 'muted';
}

function RecordRow({ label, id, note, status, first, testID }: { label: string; id: string; note?: string; status?: string | null; first?: boolean; testID?: string }) {
    return (
        <XStack alignItems="center" gap={12} paddingTop={first ? 0 : 12} marginTop={first ? 0 : 12} borderTopWidth={first ? 0 : 1} borderColor="$border" testID={testID}>
            <YStack flex={1} minWidth={0} gap={2}>
                <Eyebrow>{label}</Eyebrow>
                {/* In full, never cut: it is what dispatch and the workshop will ask for. */}
                <Body fontFamily="$mono" fontSize={17} lineHeight={22} fontWeight="600">
                    {id}
                </Body>
                {note ? (
                    <Body fontSize={13} lineHeight={18} tone="secondary">
                        {note}
                    </Body>
                ) : null}
            </YStack>
            {status ? <StatusChip label={statusWords(status)} tone={statusTone(status)} /> : null}
        </XStack>
    );
}

export function InspectionResultScreen({ submission, vehicleName, unsafe, unsafeItems = [], photos = 0, orderContext, onChooseVehicle, onMessageDispatch, onDone }: InspectionResultScreenProps) {
    const { t } = useTranslation();
    const ink = useInk();
    const screen = useScreenStyle();
    const failures = Number(submission.failed_items ?? 0) || 0;
    const hasDefects = failures > 0 || Boolean(submission.has_failures);
    const outOfService = Boolean(unsafe ?? submission.meta?.unsafe);
    const vehicle = vehicleName ?? submission.vehicle_name ?? submission.vehicle?.name ?? t('vehicle.unnamed');
    const kind: Kind = outOfService ? 'unsafe' : hasDefects ? 'defects' : 'passed';
    const look = LOOK[kind];
    const queued = Boolean(submission.queued);
    const at = formatClock(submission.submitted_at);
    const step = orderContext ? orderContext.activityLabel || orderContext.activityCode : '';

    const title = kind === 'unsafe' ? t('inspection.result.unsafeTitle') : kind === 'defects' ? t('inspection.result.defectsTitle', { count: failures || 1 }) : t('inspection.result.passedTitle');
    const body =
        kind === 'unsafe'
            ? unsafeItems.length
                ? t('inspection.result.unsafeBodyItems', { items: unsafeItems.join(', '), vehicle })
                : t('inspection.result.unsafeBody', { vehicle })
            : t(`inspection.result.${kind}Body`);

    // The check is gone from the phone once sent: back is the way out, never the review again.
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onDone?.();
            return true;
        });
        return () => sub.remove();
    }, [onDone]);

    const photoNote = photos > 0 ? t('inspection.result.withPhotos', { count: photos }) : undefined;

    return (
        <YStack flex={1} backgroundColor="$background" testID={`inspection-result-${kind}`}>
            <ScrollView style={screen} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* The band: the outcome, its mark, and what it means. */}
                <YStack paddingTop={20} paddingHorizontal={GUTTER} paddingBottom={22} gap={14} backgroundColor={look.fill as never} borderBottomWidth={1} borderColor={look.border as never} accessible accessibilityRole="header" accessibilityLabel={`${t(`inspection.result.${kind}Eyebrow`)}. ${title}. ${body}`}>
                    <YStack width={64} height={64} borderRadius={look.radius} alignItems="center" justifyContent="center" backgroundColor={look.mark as never}>
                        <InspectIcon name={look.icon} size={34} strokeWidth={3} color={ink('background')} />
                    </YStack>
                    <YStack gap={6}>
                        <Eyebrow tone={look.tone}>{t(`inspection.result.${kind}Eyebrow`)}</Eyebrow>
                        <Body fontSize={32} lineHeight={36} fontWeight="800" letterSpacing={-0.64}>
                            {title}
                        </Body>
                        <Body fontSize={16} lineHeight={24} tone="secondary">
                            {body}
                        </Body>
                    </YStack>
                </YStack>

                <YStack paddingTop={18} paddingHorizontal={GUTTER} gap={14}>
                    <InspectionOrderBanner order={orderContext} t={t} />

                    <Eyebrow>{t('inspection.result.whatNow')}</Eyebrow>
                    <Panel gap={16} testID="result-what-now">
                        {queued ? (
                            <StepRow waiting done={false} title={t('inspection.result.keptTitle')} body={t('inspection.result.keptBody')} at={at} testID="result-queued" />
                        ) : (
                            <StepRow done title={t('inspection.result.sentTitle')} body={t('inspection.result.sentBody')} at={at} testID="result-sent" />
                        )}
                        {!queued && submission.work_order?.id ? (
                            <StepRow done title={t('inspection.result.repairOpenTitle')} body={t('inspection.result.repairOpenBody')} at={at} />
                        ) : !queued && submission.issue?.id ? (
                            <StepRow done title={t('inspection.result.defectOpenTitle')} body={t('inspection.result.defectOpenBody')} at={at} />
                        ) : null}
                        {orderContext && kind === 'unsafe' ? (
                            <StepRow done={false} title={t('inspection.forOrder.heldTitle')} body={t('inspection.forOrder.blocked', { step })} testID="result-order-blocked" />
                        ) : orderContext && queued ? (
                            <StepRow waiting done={false} title={t('inspection.forOrder.waitingTitle')} body={t('inspection.forOrder.waitsToSend', { step })} testID="result-order-waiting" />
                        ) : orderContext ? (
                            <StepRow done={false} title={t('inspection.forOrder.goesOnTitle')} body={t('inspection.forOrder.goesOn', { step })} testID="result-order-goes-on" />
                        ) : null}
                        {kind === 'unsafe' && onChooseVehicle ? <StepRow done={false} title={t('inspection.result.pickTitle')} body={t('inspection.result.pickBody')} /> : null}
                    </Panel>

                    {!queued && (submission.work_order?.id || submission.issue?.id || submission.id) ? (
                        <Panel testID="result-records">
                            {submission.work_order?.id ? <RecordRow first label={t('inspection.result.repairOpened')} id={submission.work_order.id} note={photoNote} status={submission.work_order.status} testID="result-work-order" /> : null}
                            {submission.issue?.id ? (
                                <RecordRow first={!submission.work_order?.id} label={t('inspection.result.defectRecord')} id={submission.issue.id} note={submission.work_order?.id ? undefined : photoNote} status={submission.issue.status} testID="result-issue" />
                            ) : null}
                            <RecordRow first={!submission.work_order?.id && !submission.issue?.id} label={t('inspection.result.record')} id={submission.id} testID="result-record" />
                        </Panel>
                    ) : null}

                    {kind === 'unsafe' && onChooseVehicle ? <InfoNote>{t('inspection.result.waypointsStay')}</InfoNote> : null}
                </YStack>
            </ScrollView>

            <FootBar testID="result-actions">
                {kind === 'unsafe' ? (
                    <>
                        {onChooseVehicle ? <FootButton label={t('inspection.result.chooseVehicle')} onPress={onChooseVehicle} testID="result-choose-vehicle" /> : null}
                        {onMessageDispatch ? <FootButton kind="secondary" label={t('inspection.result.openChat')} onPress={onMessageDispatch} testID="result-message-dispatch" /> : null}
                        <XStack height={48} alignItems="center" justifyContent="center" onPress={onDone} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" testID="result-done">
                            <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary">
                                {orderContext ? t('inspection.forOrder.backToOrder') : t('inspection.result.done')}
                            </Body>
                        </XStack>
                    </>
                ) : (
                    <FootButton label={orderContext ? t('inspection.forOrder.backToOrder') : t('inspection.result.done')} onPress={onDone} testID="result-done" />
                )}
            </FootBar>
        </YStack>
    );
}

export default InspectionResultScreen;
