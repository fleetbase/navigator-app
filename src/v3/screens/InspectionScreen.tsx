/**
 * Inspection — start (design round 3, s37 "InspectStart"), with the history of
 * past checks under it.
 *
 * Top to bottom as the mockup has it: a close button and a quiet line saying
 * when this check is asked for; the check's name and what it involves (how many
 * checks, about how long, that it works with no signal); the vehicle, its plate
 * in full in mono, and "Not this vehicle"; the odometer now; the parts of the
 * check, numbered, with how many checks each; and "Start the check" at the foot.
 *
 * What the mockup does not show and the app still does:
 *
 *   - more than one published check for the vehicle: a row of chips to pick
 *     which one, over the title;
 *   - a check already started: the parts say how far each has got, and the
 *     button carries on from there ("Carry on · 5 of 23 done");
 *   - the history of checks below the parts, with the ones still waiting on
 *     this phone to be sent, filterable, each opening its record;
 *   - the honest states: inspections not switched on (a 404 on the list), no
 *     vehicle assigned (with a way to choose one), no checks published, a list
 *     that could not be loaded.
 *
 * The odometer typed here is kept in the draft (or in the form's own odometer
 * field when it has one), so it survives a cold start and is what the review
 * shows and sends.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack } from 'tamagui';
import { Body } from '../ui/Text';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { ChipSwitch, SectionLabel } from './jobs/parts';
import {
    useInspectionForms,
    useInspectionHistory,
    useInspectionDrafts,
    usePendingInspections,
    inspectionDrafts,
    draftProgress,
    fieldsOf,
    groupItems,
    odometerFieldOf,
    type InspectionFormRecord,
    type InspectionSubmissionRecord,
} from '../data';
import { formatDateTime, formatNumber } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { FootBar, FootButton, FieldLabel, GUTTER, InlineInput, InspectIcon, Panel, ScreenTop, cleanReading, partName, useInk } from './inspection/parts';

export interface InspectionScreenProps {
    driverId?: string;
    vehicleId?: string;
    vehicleName?: string;
    /** The plate, shown in full in mono. */
    vehiclePlate?: string;
    /** The vehicle's last recorded odometer: "Last recorded …" under the field. */
    odometerSeed?: number;
    /** Arrived from Change vehicle: the check is what stands before driving it. */
    afterSwap?: boolean;
    reloadToken?: number;
    onStart?: (form: InspectionFormRecord, vehicleId?: string) => void;
    onOpenSubmission?: (submission: InspectionSubmissionRecord) => void;
    /** "Not this vehicle", and the way to a vehicle when none is assigned. */
    onChangeVehicle?: () => void;
    onClose?: () => void;
}

type Segment = 'all' | 'pre_trip' | 'post_trip' | 'defects';
type T = (k: string, o?: Record<string, unknown>) => string;

/** Seconds a quick check takes, for "about N minutes": the mockup's 23 checks in about 3. */
const SECONDS_PER_CHECK = 8;

function segmentOf(s: InspectionSubmissionRecord): Exclude<Segment, 'all' | 'defects'> | undefined {
    const type = String(s.type ?? '').toLowerCase();
    if (type === 'pre_trip') return 'pre_trip';
    if (type === 'post_trip') return 'post_trip';
    return undefined;
}

/* -- A past check, as a row. ---------------------------------------------------------- */

function HistoryRow({ submission, first, onPress, t }: { submission: InspectionSubmissionRecord; first: boolean; onPress?: () => void; t: T }) {
    const ink = useInk();
    const failures = Number(submission.failed_items ?? 0) || 0;
    const defects = failures > 0 || Boolean(submission.has_failures);
    const unsafe = Boolean(submission.meta?.unsafe);
    const look = submission.queued
        ? { fill: '$surfaceRaised', radius: 14, glyph: null, icon: 'clock' as const, word: t('inspection.history.waiting'), tone: 'secondary' as const }
        : unsafe
          ? { fill: '$danger', radius: 4, glyph: '×', icon: null, word: t('inspection.history.unsafe'), tone: 'danger' as const }
          : defects
            ? { fill: '$warning', radius: 9, glyph: '!', icon: null, word: t('inspection.history.problems', { count: failures || 1 }), tone: 'warning' as const }
            : { fill: '$success', radius: 14, glyph: null, icon: 'check' as const, word: t('inspection.history.passed'), tone: 'success' as const };
    const title = submission.form_name ?? (submission.type ? t(`inspection.type.${submission.type}`, { defaultValue: String(submission.type) }) : t('inspection.title'));
    const when = formatDateTime((submission.submitted_at ?? submission.created_at) as string);
    const vehicle = submission.vehicle_name ?? submission.vehicle?.name;
    return (
        <XStack
            alignItems="center"
            gap={12}
            minHeight={64}
            paddingVertical={10}
            borderTopWidth={first ? 0 : 1}
            borderColor="$border"
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            accessibilityRole={onPress ? 'button' : 'text'}
            accessibilityLabel={[title, look.word, when, vehicle].filter(Boolean).join('. ')}
            testID={`inspection-row-${submission.id}`}
        >
            <YStack width={28} height={28} borderRadius={look.radius} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={look.fill as never}>
                {look.icon ? (
                    <InspectIcon name={look.icon} size={14} strokeWidth={look.icon === 'check' ? 3.4 : 2.6} color={ink(look.icon === 'check' ? 'background' : 'textSecondary')} />
                ) : (
                    <Body fontSize={14} lineHeight={18} fontWeight="800" color="$background">
                        {look.glyph}
                    </Body>
                )}
            </YStack>
            <YStack flex={1} minWidth={0} gap={2}>
                <Body fontSize={16} lineHeight={21} fontWeight="800" numberOfLines={1}>
                    {title}
                </Body>
                <Body fontSize={13} lineHeight={18} tabular tone="secondary" numberOfLines={1}>
                    {[when, vehicle].filter(Boolean).join(' · ')}
                </Body>
            </YStack>
            <Body flexShrink={0} fontSize={13} lineHeight={18} fontWeight="800" tone={look.tone} testID={unsafe ? `inspection-unsafe-${submission.id}` : undefined}>
                {look.word}
            </Body>
            {onPress ? <InspectIcon name="chevron" size={16} strokeWidth={2.4} color={ink('textSecondary')} /> : null}
        </XStack>
    );
}

/* -- The screen. ------------------------------------------------------------------------- */

export function InspectionScreen({ driverId, vehicleId, vehicleName, vehiclePlate, odometerSeed, afterSwap, reloadToken = 0, onStart, onOpenSubmission, onChangeVehicle, onClose }: InspectionScreenProps) {
    const { t } = useTranslation();
    const ink = useInk();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const forms = useInspectionForms(vehicleId, reloadToken);
    const history = useInspectionHistory({ driver: driverId }, reloadToken);
    const drafts = useInspectionDrafts();
    const pending = usePendingInspections();
    const [segment, setSegment] = useState<Segment>('all');
    const [pickedId, setPickedId] = useState<string | undefined>();

    /* -- Which check. ------------------------------------------------------------------------ */

    const form = useMemo(() => {
        const list = forms.forms;
        return list.find((f) => f.id === pickedId) ?? list.find((f) => drafts.some((d) => d.formId === f.id && d.vehicleId === vehicleId)) ?? list[0];
    }, [forms.forms, pickedId, drafts, vehicleId]);
    const draft = form ? drafts.find((d) => d.formId === form.id && d.vehicleId === vehicleId) : undefined;
    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const parts = useMemo(() => groupItems(form, draft), [form, draft]);
    const checkCount = useMemo(() => fieldsOf(form).length || Number(form?.item_count ?? 0), [form]);
    const minutes = Math.max(1, Math.round((checkCount * SECONDS_PER_CHECK) / 60));

    /* -- The odometer: kept in the draft as it is typed. ------------------------------------------ */

    const meterField = useMemo(() => odometerFieldOf(form), [form]);
    const unit = String(meterField?.meta?.unit ?? 'km');
    const stored = meterField ? draft?.values?.[meterField.id] : draft?.odometer;
    const [reading, setReading] = useState(stored == null ? '' : String(stored));
    const typed = useRef(false);
    // Another check picked, or the draft read back: the field shows what is kept for it.
    useEffect(() => {
        if (!typed.current) setReading(stored == null ? '' : String(stored));
    }, [stored, form?.id]);
    const readingInvalid = reading !== '' && !Number.isFinite(Number(cleanReading(reading)));
    const commitReading = () => {
        typed.current = false;
        if (!form) return;
        const value = cleanReading(reading);
        if (value === '' || !Number.isFinite(Number(value))) {
            // Cleared: nothing kept, so the review falls back to the vehicle's last reading.
            if (value === '' && draft) {
                if (meterField) inspectionDrafts.setValue(form.id, vehicleId, meterField.id, null);
                else inspectionDrafts.patch(form.id, vehicleId, { odometer: '' });
            }
            return;
        }
        if (meterField) inspectionDrafts.setValue(form.id, vehicleId, meterField.id, Number(value));
        else inspectionDrafts.patch(form.id, vehicleId, { odometer: value });
    };

    /* -- History. -------------------------------------------------------------------------- */

    const segments = useMemo(
        () => [
            { value: 'all' as const, label: t('inspection.segmentAll') },
            { value: 'pre_trip' as const, label: t('inspection.segmentPreTrip') },
            { value: 'post_trip' as const, label: t('inspection.segmentPostTrip') },
            { value: 'defects' as const, label: t('inspection.segmentDefects') },
        ],
        [t]
    );
    const allRows = useMemo(() => [...pending, ...history.submissions], [history.submissions, pending]);
    const rows = useMemo(
        () =>
            allRows.filter((s) => {
                if (segment === 'all') return true;
                if (segment === 'defects') return Boolean(s.has_failures) || Number(s.failed_items) > 0;
                return segmentOf(s) === segment;
            }),
        [allRows, segment]
    );

    const notEnabled = forms.notEnabled && (history.notEnabled || !history.submissions.length);
    const canStart = !notEnabled && Boolean(vehicleId) && Boolean(form) && Boolean(onStart);

    const quiet = afterSwap
        ? t('inspection.begin.beforeDriving')
        : form
          ? [form.type ? t(`inspection.type.${form.type}`, { defaultValue: String(form.type) }) : null, form.frequency ? t(`inspection.frequency.${form.frequency}`, { defaultValue: String(form.frequency) }) : null].filter(Boolean).join(' · ') || t('inspection.title')
          : t('inspection.title');

    const intro = [form?.description?.trim() || t('inspection.begin.walkRound'), checkCount ? t('inspection.begin.howLong', { count: checkCount, minutes }) : null, t('inspection.begin.noSignal')].filter(Boolean).join(' ');

    /* -- The body, by state. ---------------------------------------------------------------- */

    let body: React.ReactNode;
    if (notEnabled) {
        body = <EmptyState title={t('notEnabled.title')} body={t('inspection.notEnabledBody')} testID="inspection-not-enabled" />;
    } else if (!vehicleId) {
        body = (
            <YStack gap={6}>
                <Body fontSize={30} lineHeight={34} fontWeight="800" letterSpacing={-0.6} accessibilityRole="header">
                    {t('inspection.begin.noVehicleTitle')}
                </Body>
                <Body fontSize={16} lineHeight={24} tone="secondary" testID="inspection-no-vehicle">
                    {t('inspection.noVehicle')}
                </Body>
            </YStack>
        );
    } else if (forms.isLoading) {
        body = (
            <YStack gap={16} testID="inspection-forms-loading">
                <Skeleton height={76} />
                <Skeleton height={76} />
                <Skeleton height={250} />
            </YStack>
        );
    } else if (forms.failed && !forms.notEnabled && !forms.forms.length) {
        body = <FailureState error={forms.error} isOnline={isOnline} onRetry={forms.retry} t={t} testID="inspection-forms-error" />;
    } else if (!form) {
        body = (
            <YStack gap={6}>
                <Body fontSize={30} lineHeight={34} fontWeight="800" letterSpacing={-0.6} accessibilityRole="header">
                    {t('inspection.title')}
                </Body>
                <Body fontSize={16} lineHeight={24} tone="secondary" testID="inspection-no-forms">
                    {t('inspection.noForms')}
                </Body>
            </YStack>
        );
    } else {
        body = (
            <>
                {forms.forms.length > 1 ? (
                    <ScrollView horizontal style={{ marginHorizontal: -GUTTER, flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: GUTTER }}>
                        <XStack testID="inspection-forms">
                            <ChipSwitch options={forms.forms.map((f) => ({ value: f.id, label: f.name ?? f.id }))} value={form.id} onChange={(id) => setPickedId(id)} label={t('inspection.begin.whichCheck')} testID="inspection-form" />
                        </XStack>
                    </ScrollView>
                ) : null}

                <YStack gap={6} testID={`inspection-form-${form.id}`}>
                    <Body fontSize={30} lineHeight={34} fontWeight="800" letterSpacing={-0.6} accessibilityRole="header">
                        {form.name ?? t('inspection.title')}
                    </Body>
                    <Body fontSize={16} lineHeight={24} tone="secondary">
                        {intro}
                    </Body>
                </YStack>

                {/* The vehicle: its name, its plate in full, and the way to say it is the wrong one. */}
                <XStack alignItems="center" gap={12} padding={14} borderRadius={18} backgroundColor="$surface" borderWidth={1} borderColor="$border" testID="inspection-vehicle">
                    <YStack width={48} height={48} borderRadius={14} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised">
                        <InspectIcon name="truck" size={24} strokeWidth={2} color={ink('textSecondary')} />
                    </YStack>
                    <YStack flex={1} minWidth={0} gap={2}>
                        <Body fontSize={17} lineHeight={22} fontWeight="800" numberOfLines={1}>
                            {vehicleName ?? t('vehicle.unnamed')}
                        </Body>
                        {vehiclePlate ? (
                            <Body fontFamily="$mono" fontSize={14} lineHeight={18} fontWeight="600" tone="secondary">
                                {vehiclePlate}
                            </Body>
                        ) : null}
                    </YStack>
                    {onChangeVehicle ? (
                        <XStack
                            height={40}
                            paddingHorizontal={12}
                            flexShrink={0}
                            alignItems="center"
                            borderRadius={12}
                            borderWidth={1}
                            borderColor="$border"
                            onPress={onChangeVehicle}
                            pressStyle={{ opacity: 0.6 }}
                            hitSlop={{ top: 4, bottom: 4 }}
                            accessibilityRole="button"
                            testID="inspection-not-this-vehicle"
                        >
                            <Body fontSize={13} lineHeight={17} fontWeight="700" numberOfLines={1}>
                                {t('inspection.begin.notThisVehicle')}
                            </Body>
                        </XStack>
                    ) : null}
                </XStack>

                {/* The odometer now. */}
                <YStack gap={8}>
                    <FieldLabel>{t('inspection.begin.odometer')}</FieldLabel>
                    <InlineInput
                        value={reading}
                        onChangeText={(text) => {
                            typed.current = true;
                            setReading(text);
                        }}
                        onBlur={commitReading}
                        onSubmitEditing={commitReading}
                        keyboardType="numeric"
                        returnKeyType="done"
                        mono
                        fontSize={24}
                        placeholder={odometerSeed != null ? String(odometerSeed) : undefined}
                        invalid={readingInvalid}
                        accessibilityLabel={t('inspection.begin.odometer')}
                        accessory={
                            <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary">
                                {unit}
                            </Body>
                        }
                        testID="inspection-odometer"
                    />
                    {readingInvalid ? (
                        <Body fontSize={13} lineHeight={18} tone="danger">
                            {t('inspection.review.odometerInvalid')}
                        </Body>
                    ) : odometerSeed != null ? (
                        <Body fontSize={13} lineHeight={18} tabular tone="secondary" testID="inspection-odometer-last">
                            {t('inspection.begin.lastRecorded', { reading: formatNumber(odometerSeed), unit })}
                        </Body>
                    ) : null}
                </YStack>

                {/* The parts, numbered: how many checks each, or how far it has got. */}
                {parts.length ? (
                    <Panel padding={0} paddingHorizontal={14} paddingVertical={4} testID="inspection-parts">
                        {parts.map(({ group, answered }, i) => {
                            const done = group.fields.length > 0 && answered === group.fields.length;
                            return (
                                <XStack key={group.id ?? `${group.name}-${i}`} alignItems="center" gap={12} minHeight={50} borderTopWidth={i ? 1 : 0} borderColor="$border" testID={`inspection-part-${i + 1}`}>
                                    <YStack width={28} height={28} borderRadius={9} alignItems="center" justifyContent="center" backgroundColor={done ? '$success' : '$surfaceRaised'}>
                                        {done ? (
                                            <InspectIcon name="check" size={14} strokeWidth={3.4} color={ink('background')} />
                                        ) : (
                                            <Body fontSize={13} lineHeight={17} fontWeight="800" tabular tone="secondary">
                                                {i + 1}
                                            </Body>
                                        )}
                                    </YStack>
                                    <Body flex={1} fontSize={16} lineHeight={21} fontWeight="700" numberOfLines={1}>
                                        {partName(group, t)}
                                    </Body>
                                    <Body fontSize={14} lineHeight={19} tabular tone={done ? 'success' : answered ? 'brand' : 'secondary'}>
                                        {answered && !done ? t('inspection.begin.partProgress', { answered, total: group.fields.length }) : t('inspection.begin.checkCount', { count: group.fields.length })}
                                    </Body>
                                </XStack>
                            );
                        })}
                    </Panel>
                ) : null}
            </>
        );
    }

    /* -- Past checks. ---------------------------------------------------------------------- */

    const historyBlock = notEnabled ? null : (
        <YStack gap={10} paddingTop={8} testID="inspection-history-section">
            <XStack alignItems="baseline" justifyContent="space-between" gap={12}>
                <SectionLabel>{t('inspection.history.title')}</SectionLabel>
                {allRows.length ? (
                    <Body fontSize={13} lineHeight={17} fontWeight="700" tabular tone="secondary">
                        {t('inspection.historyCount', { count: rows.length })}
                    </Body>
                ) : null}
            </XStack>
            {allRows.length ? <ChipSwitch options={segments} value={segment} onChange={setSegment} label={t('inspection.history.title')} testID="inspection-segment" /> : null}
            {history.isLoading && !allRows.length ? (
                <Skeleton height={140} />
            ) : history.failed && !history.notEnabled && !allRows.length ? (
                <FailureState error={history.error} isOnline={isOnline} onRetry={history.retry} t={t} testID="inspection-history-error" />
            ) : rows.length ? (
                <Panel padding={0} paddingHorizontal={14} paddingVertical={2} testID="inspection-history">
                    {rows.map((s, i) => (
                        <HistoryRow key={s.id} submission={s} first={i === 0} onPress={onOpenSubmission ? () => onOpenSubmission(s) : undefined} t={t} />
                    ))}
                </Panel>
            ) : (
                <Body fontSize={14} lineHeight={20} tone="secondary" testID="inspection-history-empty">
                    {allRows.length ? t('inspection.history.noneOfThese') : t('inspection.historyEmptyBody')}
                </Body>
            )}
        </YStack>
    );

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-hub">
            <ScreenTop icon="close" backLabel={t('common.close')} onBack={onClose} quiet={quiet} testID="inspection-start-top" />
            <ScrollView
                style={screen}
                contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 24, gap: 16 }}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={history.isRefreshing} onRefresh={history.refresh} />}
            >
                {body}
                {historyBlock}
            </ScrollView>

            {canStart && form ? (
                <FootBar testID="inspection-start-actions">
                    <FootButton
                        label={progress.answered > 0 ? t('inspection.begin.carryOn', { answered: progress.answered, total: progress.total }) : t('inspection.begin.cta')}
                        onPress={() => {
                            commitReading();
                            onStart?.(form, vehicleId);
                        }}
                        testID="inspection-start-primary"
                    />
                </FootBar>
            ) : !notEnabled && !vehicleId && onChangeVehicle ? (
                <FootBar>
                    <FootButton label={t('inspection.begin.chooseVehicle')} onPress={onChangeVehicle} testID="inspection-choose-vehicle" />
                </FootBar>
            ) : null}
        </YStack>
    );
}

export default InspectionScreen;
