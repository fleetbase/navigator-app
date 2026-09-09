/**
 * Pre-trip checklist — R2 frames E3a (checklist, offline) and E3b (defect
 * capture), on one screen: the list by area with progress, the current item
 * with Pass / Defect / Not applicable, and the defect sheet that opens in
 * place when Defect is chosen.
 *
 * Every answer is written to the persisted draft the moment it is given, so
 * a phone call, a cold start or a flat battery loses nothing (E3a is drawn
 * offline for exactly this reason). The screen owns no answer state of its
 * own — it renders the draft.
 *
 * A defect needs a severity, a note, and a photo at high severity or above
 * (E3b: "required for high and above"). Nothing is sent from here; submit
 * is the review screen's job.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Field } from '../ui/Field';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation } from '../shell';
import {
    useInspectionForm,
    useInspectionDraft,
    inspectionDrafts,
    groupItems,
    draftProgress,
    nextUnanswered,
    photoRequiredFor,
    defectComplete,
    formatLatLng,
    SEVERITIES,
    type InspectionFormRecord,
    type InspectionFormItem,
    type ItemAnswer,
    type Severity,
} from '../data';
import type { CapturedPhoto } from '../../components/CameraCapture';
import { formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

/* VisionCamera initialises its native module at import; load it only when a photo is asked for. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

export interface InspectionChecklistScreenProps {
    formId: string;
    vehicleId?: string;
    vehicleName?: string;
    seedForm?: InspectionFormRecord | null;
    /** Save and pause — the draft persists; just leave. */
    onPause?: () => void;
    onReview?: (formId: string, vehicleId?: string) => void;
}

function DefectSheet({
    item,
    answer,
    form,
    onChange,
    onSave,
    onCancel,
    t,
}: {
    item: InspectionFormItem;
    answer: ItemAnswer;
    form: InspectionFormRecord;
    onChange: (a: ItemAnswer) => void;
    onSave: () => void;
    onCancel: () => void;
    t: (k: string, o?: Record<string, unknown>) => string;
}) {
    const position = useDeviceLocation();
    const [camera, setCamera] = useState(false);
    const needsPhoto = photoRequiredFor(answer.severity, form.settings);
    const complete = defectComplete(answer, form.settings);

    return (
        <Surface level="sheet" hero padded testID="defect-sheet">
            <YStack gap={space[4]}>
                <YStack gap={2}>
                    <Heading fontSize={17}>{t('inspection.defect.title')}</Heading>
                    <Micro>{[item.category, item.label].filter(Boolean).join(' · ')}</Micro>
                </YStack>

                <YStack gap={space[2]}>
                    <Caption>{t('inspection.defect.severityLabel')}</Caption>
                    <XStack gap={space[2]} flexWrap="wrap">
                        {SEVERITIES.map((s) => {
                            const selected = answer.severity === s;
                            return (
                                <YStack
                                    key={s}
                                    flexBasis="47%"
                                    flexGrow={1}
                                    padding={space[3]}
                                    borderRadius={radius.compact}
                                    borderWidth={selected ? 1.5 : 1}
                                    borderColor={selected ? '$primary' : '$border'}
                                    backgroundColor={selected ? '$primaryFill' : '$surface'}
                                    onPress={() => onChange({ ...answer, severity: s })}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    testID={`defect-severity-${s}`}
                                >
                                    <Body fontSize={14} fontWeight="700" tone={selected ? 'brand' : 'primary'}>
                                        {t(`inspection.defect.severity.${s}`)}
                                    </Body>
                                    <Micro>{t(`inspection.defect.severityHint.${s}`)}</Micro>
                                </YStack>
                            );
                        })}
                    </XStack>
                </YStack>

                <YStack gap={space[2]}>
                    <Caption>{needsPhoto ? t('inspection.defect.photoLabel') : t('inspection.defect.photoOptional')}</Caption>
                    <XStack gap={space[2]} alignItems="center" flexWrap="wrap">
                        <Micro tabular testID="defect-photo-count">
                            {t('inspection.checklist.photoCount', { count: answer.photos.length })}
                        </Micro>
                        <Button variant="secondary" height={40} paddingHorizontal={space[3]} onPress={() => setCamera((v) => !v)} testID="defect-add-photo">
                            {camera ? t('inspection.defect.photoDone') : answer.photos.length ? t('inspection.defect.addAngle') : t('inspection.defect.addPhoto')}
                        </Button>
                    </XStack>
                    {camera ? (
                        <View style={{ height: 320 }} testID="defect-camera">
                            {(() => {
                                const Camera = lazyCamera();
                                return (
                                    <Camera
                                        onDone={(taken) => {
                                            onChange({ ...answer, photos: [...answer.photos, ...taken.map((p) => p.base64 ?? '').filter(Boolean)] });
                                            setCamera(false);
                                        }}
                                    />
                                );
                            })()}
                        </View>
                    ) : null}
                    <YStack gap={2}>
                        <Micro>{t('inspection.defect.autoAttached')}</Micro>
                        <Identifier value={`${formatLatLng(position) ?? t('inspection.defect.noPosition')} · ${formatClock(new Date().toISOString())}`} boxed={false} />
                    </YStack>
                </YStack>

                <YStack gap={space[2]}>
                    <Caption>{t('inspection.defect.notesLabel')}</Caption>
                    <Field
                        multiline
                        placeholder={t('inspection.defect.notesPlaceholder')}
                        value={answer.comments ?? ''}
                        onChangeText={(comments) => onChange({ ...answer, comments })}
                        testID="defect-notes"
                    />
                </YStack>

                <XStack
                    gap={space[3]}
                    alignItems="center"
                    onPress={() => onChange({ ...answer, unsafe: !answer.unsafe })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: Boolean(answer.unsafe) }}
                    testID="defect-unsafe"
                >
                    <YStack
                        width={24}
                        height={24}
                        borderRadius={6}
                        borderWidth={1.5}
                        borderColor={answer.unsafe ? '$dangerText' : '$border'}
                        backgroundColor={answer.unsafe ? '$dangerFill' : '$surface'}
                        alignItems="center"
                        justifyContent="center"
                    >
                        {answer.unsafe ? (
                            <Micro tone="danger" fontSize={14}>
                                ✓
                            </Micro>
                        ) : null}
                    </YStack>
                    <YStack flex={1}>
                        <Body fontSize={14} fontWeight="700">
                            {t('inspection.defect.unsafe')}
                        </Body>
                        <Micro>{t('inspection.defect.unsafeHint')}</Micro>
                    </YStack>
                </XStack>

                <Micro>{t('inspection.defect.pipeline')}</Micro>
                {!complete ? <Micro tone="warning" testID="defect-incomplete">{t('inspection.defect.incomplete')}</Micro> : null}

                <XStack gap={space[2]}>
                    <Button flex={1} variant="secondary" onPress={onCancel} testID="defect-cancel">
                        {t('common.cancel')}
                    </Button>
                    <Button flex={1} disabled={!complete} onPress={onSave} testID="defect-save">
                        {t('inspection.defect.save')}
                    </Button>
                </XStack>
            </YStack>
        </Surface>
    );
}

export function InspectionChecklistScreen({ formId, vehicleId, vehicleName, seedForm, onPause, onReview }: InspectionChecklistScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { form, isLoading, failed, error, retry } = useInspectionForm(formId, seedForm);
    const draft = useInspectionDraft(formId, vehicleId);

    const [selectedKey, setSelectedKey] = useState<string | undefined>();
    const [editing, setEditing] = useState<ItemAnswer | null>(null);

    const groups = useMemo(() => groupItems(form, draft), [form, draft]);
    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const items = useMemo(() => form?.items ?? [], [form?.items]);
    const current = useMemo(() => items.find((i) => i.key === selectedKey) ?? nextUnanswered(form, draft) ?? items[items.length - 1], [items, selectedKey, form, draft]);
    const currentIndex = current ? items.indexOf(current) : -1;

    const record = useCallback(
        (item: InspectionFormItem, answer: ItemAnswer) => {
            inspectionDrafts.answer(formId, vehicleId, item.key, answer);
            const next = nextUnanswered(form, { ...(draft ?? { formId, vehicleId, startedAt: '', answers: {} }), answers: { ...(draft?.answers ?? {}), [item.key]: answer } });
            setSelectedKey(next?.key);
        },
        [draft, form, formId, vehicleId]
    );

    const pass = useCallback(() => current && record(current, { passed: true, photos: [] }), [current, record]);
    const notApplicable = useCallback(() => current && record(current, { passed: null, photos: [] }), [current, record]);
    const openDefect = useCallback(() => {
        if (!current) return;
        const existing = draft?.answers[current.key];
        setEditing(existing?.passed === false ? existing : { passed: false, severity: (current.severity as Severity) ?? 'medium', comments: '', photos: [] });
    }, [current, draft]);

    if (isLoading && !form) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="checklist-loading">
                <Skeleton height={64} />
                <Skeleton height={220} />
            </YStack>
        );
    }
    if (!form) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center">
                <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="checklist-error" />
            </YStack>
        );
    }

    // Draft exists from the first render, so a paused inspection is resumable.
    if (!draft) inspectionDrafts.start(formId, vehicleId);

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-checklist">
            <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: space[7] }}>
                <YStack gap={2}>
                    <Heading fontSize={20}>{form.name ?? t('inspection.title')}</Heading>
                    <Micro>{[vehicleName, t('inspection.checklist.template', { name: form.name ?? form.id })].filter(Boolean).join(' · ')}</Micro>
                </YStack>

                <Banner tone="neutral" message={isOnline ? t('inspection.checklist.savedOnDevice') : t('inspection.checklist.offline')} meta={t('inspection.checklist.progress', { answered: progress.answered, total: progress.total })} testID="checklist-progress" />

                {!items.length ? <Banner tone="warning" message={t('inspection.checklist.empty')} testID="checklist-empty" /> : null}

                {groups.map((group) => (
                    <YStack key={group.category} gap={space[2]} testID={`checklist-group-${group.category}`}>
                        <XStack justifyContent="space-between" paddingHorizontal={space[1]}>
                            <Caption>{t('inspection.checklist.groupProgress', { category: group.category.toUpperCase(), answered: group.answered, total: group.items.length })}</Caption>
                            {group.answered === group.items.length ? <Micro tone="success">✓</Micro> : null}
                        </XStack>
                        <Surface>
                            {group.items.map((item, i) => {
                                const a = draft?.answers[item.key];
                                const isCurrent = item.key === current?.key;
                                const summary =
                                    a === undefined
                                        ? undefined
                                        : a.passed === true
                                          ? t('inspection.checklist.passRecorded')
                                          : a.passed === null
                                            ? t('inspection.checklist.naRecorded')
                                            : `${t('inspection.checklist.defectRecorded', { severity: t(`inspection.defect.severity.${a.severity ?? 'medium'}`) })} · ${t('inspection.checklist.photoCount', { count: a.photos.length })}`;
                                return (
                                    <YStack key={item.key}>
                                        {i > 0 ? <Divider /> : null}
                                        <YStack
                                            padding={space[3]}
                                            gap={2}
                                            backgroundColor={isCurrent ? '$primaryFill' : undefined}
                                            onPress={() => {
                                                setSelectedKey(item.key);
                                                setEditing(null);
                                            }}
                                            pressStyle={{ opacity: 0.8 }}
                                            accessibilityRole="button"
                                            testID={`checklist-item-${item.key}`}
                                        >
                                            <Body fontSize={14} fontWeight={isCurrent ? '800' : '600'}>
                                                {item.label}
                                            </Body>
                                            {summary ? (
                                                <Micro tone={a?.passed === false ? 'danger' : a?.passed === true ? 'success' : 'muted'} testID={`checklist-answer-${item.key}`}>
                                                    {summary}
                                                </Micro>
                                            ) : null}
                                            {a?.passed === false && a.comments ? <Secondary fontSize={12}>“{a.comments}”</Secondary> : null}
                                        </YStack>
                                    </YStack>
                                );
                            })}
                        </Surface>
                    </YStack>
                ))}

                {editing && current ? (
                    <DefectSheet
                        item={current}
                        answer={editing}
                        form={form}
                        onChange={setEditing}
                        onSave={() => {
                            record(current, editing);
                            setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        t={t}
                    />
                ) : current ? (
                    <Surface hero padded active testID="checklist-current">
                        <YStack gap={space[3]}>
                            <Micro>{t('inspection.checklist.itemOf', { index: currentIndex + 1, total: items.length })}</Micro>
                            <Body fontSize={17} fontWeight="800">
                                {current.label}
                            </Body>
                            {current.description ? <Secondary fontSize={13}>{current.description}</Secondary> : null}
                            <XStack gap={space[2]}>
                                <Button flex={1} variant="secondary" onPress={pass} testID="checklist-pass">
                                    ✓ {t('inspection.checklist.pass')}
                                </Button>
                                <Button flex={1} variant="destructive" onPress={openDefect} testID="checklist-defect">
                                    ! {t('inspection.checklist.defect')}
                                </Button>
                            </XStack>
                            <Button variant="ghost" onPress={notApplicable} testID="checklist-na">
                                {t('inspection.checklist.notApplicable')}
                            </Button>
                        </YStack>
                    </Surface>
                ) : null}

                {!progress.complete && progress.answered > 0 ? (
                    <Micro tone="warning" testID="checklist-missing">
                        {t('inspection.checklist.missingRequired', { count: progress.missingRequired.length })}
                    </Micro>
                ) : null}
            </ScrollView>

            <XStack padding={space[4]} gap={space[2]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface" testID="checklist-actions">
                <Button flex={1} variant="secondary" onPress={onPause} testID="checklist-pause">
                    {t('inspection.checklist.saveAndPause')}
                </Button>
                {progress.complete ? (
                    <Button flex={1} onPress={() => onReview?.(formId, vehicleId)} disabled={!onReview} testID="checklist-review">
                        {t('inspection.checklist.review')}
                    </Button>
                ) : (
                    <Button flex={1} onPress={() => setSelectedKey(nextUnanswered(form, draft)?.key)} disabled={!nextUnanswered(form, draft)} testID="checklist-next">
                        {t('inspection.checklist.nextItem')}
                    </Button>
                )}
            </XStack>
        </YStack>
    );
}

export default InspectionChecklistScreen;
