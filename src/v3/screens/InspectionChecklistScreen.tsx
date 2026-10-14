/**
 * Inspection — R2 frames E3a (checklist, offline) and E3b (defect capture),
 * second cut: the form is groups of typed fields, not a list of pass/fail
 * items. Each field renders its own control — pass/fail keeps the defect
 * sheet, a meter field a numeric entry with its unit, a choice its options,
 * a photo the camera, a signature the pad — and every answer is written to
 * the persisted draft the moment it is given, so a cold start loses nothing.
 * The screen owns no answer state of its own; it renders the draft.
 *
 * A defect needs a severity, a note when the field asks for one, and a
 * photo when the field asks for one (E3b). Nothing is sent from here; submit
 * is the review screen's job.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Field, Segmented } from '../ui/Field';
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
    fieldsOf,
    isPassFail,
    isAnswered,
    photoRequiredFor,
    commentRequiredFor,
    defectComplete,
    formatLatLng,
    SEVERITIES,
    type InspectionFormRecord,
    type InspectionField,
    type ItemAnswer,
    type FieldValue,
    type Severity,
} from '../data';
import { toBareBase64 } from '../data/useProofCapture';
import type { CapturedPhoto } from '../../components/CameraCapture';
import { formatClock } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

/* Native modules load only when a field asks for them. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;
const lazySignaturePad = () => require('react-native-signature-canvas').default as React.ComponentType<Record<string, unknown>>;

export interface InspectionChecklistScreenProps {
    formId: string;
    vehicleId?: string;
    vehicleName?: string;
    seedForm?: InspectionFormRecord | null;
    /** Save and pause — the draft persists; just leave. */
    onPause?: () => void;
    onReview?: (formId: string, vehicleId?: string) => void;
}

type T = (k: string, o?: Record<string, unknown>) => string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/;

/** What an answered field shows in its row. */
function summaryOf(field: InspectionField, draft: ReturnType<typeof useInspectionDraft>, t: T): { text: string; tone: 'success' | 'danger' | 'muted' } | undefined {
    if (isPassFail(field)) {
        const a = draft?.answers[field.id];
        if (a === undefined) return undefined;
        if (a.passed === true) return { text: t('inspection.checklist.passRecorded'), tone: 'success' };
        if (a.passed === null) return { text: t('inspection.checklist.naRecorded'), tone: 'muted' };
        return {
            text: `${t('inspection.checklist.defectRecorded', { severity: t(`inspection.defect.severity.${a.severity ?? 'medium'}`) })} · ${t('inspection.checklist.photoCount', { count: a.photos.length })}`,
            tone: 'danger',
        };
    }
    const v = draft?.values?.[field.id];
    if (v === undefined || v === null || v === '') return undefined;
    if (field.type === 'boolean') return { text: v ? t('inspection.field.yes') : t('inspection.field.no'), tone: 'success' };
    if (field.type === 'file-upload') return { text: t('inspection.field.photoTaken'), tone: 'success' };
    if (field.type === 'signature') return { text: t('inspection.field.signed'), tone: 'success' };
    if (field.type === 'number') return { text: `${v}${field.meta?.unit ? ` ${field.meta.unit}` : ''}`, tone: 'success' };
    return { text: String(v), tone: 'success' };
}

/* -- E3b: the defect sheet ------------------------------------------------ */

function DefectSheet({ field, answer, onChange, onSave, onCancel, t }: { field: InspectionField; answer: ItemAnswer; onChange: (a: ItemAnswer) => void; onSave: () => void; onCancel: () => void; t: T }) {
    const position = useDeviceLocation();
    const [camera, setCamera] = useState(false);
    const needsPhoto = photoRequiredFor(field, answer.severity);
    const needsComment = commentRequiredFor(field);
    const complete = defectComplete(answer, field);

    return (
        <Surface level="sheet" hero padded testID="defect-sheet">
            <YStack gap={space[4]}>
                <YStack gap={2}>
                    <Heading fontSize={17}>{t('inspection.defect.title')}</Heading>
                    <Micro>{field.label}</Micro>
                    {field.meta?.instructions ? <Secondary fontSize={13}>{String(field.meta.instructions)}</Secondary> : null}
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
                    <Caption>{needsComment ? t('inspection.defect.notesLabel') : t('inspection.defect.notesOptional')}</Caption>
                    <Field multiline placeholder={t('inspection.defect.notesPlaceholder')} value={answer.comments ?? ''} onChangeText={(comments) => onChange({ ...answer, comments })} testID="defect-notes" />
                </YStack>

                <XStack gap={space[3]} alignItems="center" onPress={() => onChange({ ...answer, unsafe: !answer.unsafe })} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(answer.unsafe) }} testID="defect-unsafe">
                    <YStack width={24} height={24} borderRadius={6} borderWidth={1.5} borderColor={answer.unsafe ? '$dangerText' : '$border'} backgroundColor={answer.unsafe ? '$dangerFill' : '$surface'} alignItems="center" justifyContent="center">
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

/* -- The current field's control ----------------------------------------- */

function FieldControl({ field, value, onCommit, t }: { field: InspectionField; value: FieldValue | undefined; onCommit: (v: FieldValue) => void; t: T }) {
    const [text, setText] = useState(value == null ? '' : String(value));
    const [camera, setCamera] = useState(false);
    const [signing, setSigning] = useState(false);
    const signatureRef = useRef<{ readSignature: () => void } | null>(null);

    switch (field.type) {
        case 'boolean':
            return (
                <Segmented
                    options={[
                        { value: 'yes', label: t('inspection.field.yes') },
                        { value: 'no', label: t('inspection.field.no') },
                    ]}
                    value={value === true ? 'yes' : value === false ? 'no' : ('' as 'yes' | 'no')}
                    onChange={(v) => onCommit(v === 'yes')}
                    testID={`field-boolean-${field.id}`}
                />
            );
        case 'select':
        case 'radio-button': {
            const options = (field.options ?? []).map(String);
            return (
                <YStack gap={space[2]} testID={`field-options-${field.id}`}>
                    {options.map((option) => {
                        const selected = value === option;
                        return (
                            <XStack
                                key={option}
                                minHeight={48}
                                paddingHorizontal={space[3]}
                                alignItems="center"
                                borderRadius={radius.compact}
                                borderWidth={selected ? 1.5 : 1}
                                borderColor={selected ? '$primary' : '$border'}
                                backgroundColor={selected ? '$primaryFill' : '$surface'}
                                onPress={() => onCommit(option)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                testID={`field-option-${field.id}-${option}`}
                            >
                                <Body fontSize={15} fontWeight="700" tone={selected ? 'brand' : 'primary'}>
                                    {option}
                                </Body>
                            </XStack>
                        );
                    })}
                </YStack>
            );
        }
        case 'number': {
            const invalid = text !== '' && !Number.isFinite(Number(text));
            return (
                <YStack gap={space[2]}>
                    <Field
                        value={text}
                        onChangeText={setText}
                        keyboardType="decimal-pad"
                        tabular
                        placeholder={t('inspection.field.numberPlaceholder')}
                        accessory={field.meta?.unit ? <Micro>{String(field.meta.unit)}</Micro> : undefined}
                        error={invalid ? t('inspection.field.invalidNumber') : undefined}
                        testID={`field-number-${field.id}`}
                    />
                    <Button disabled={text === '' || invalid} onPress={() => onCommit(Number(text))} testID={`field-save-${field.id}`}>
                        {t('inspection.field.save')}
                    </Button>
                </YStack>
            );
        }
        case 'date-picker':
        case 'date-time-input': {
            const isDateTime = field.type === 'date-time-input';
            const ok = isDateTime ? DATETIME_RE.test(text) : DATE_RE.test(text);
            return (
                <YStack gap={space[2]}>
                    <Field
                        value={text}
                        onChangeText={setText}
                        tabular
                        placeholder={isDateTime ? t('inspection.field.dateTimePlaceholder') : t('inspection.field.datePlaceholder')}
                        error={text !== '' && !ok ? (isDateTime ? t('inspection.field.invalidDateTime') : t('inspection.field.invalidDate')) : undefined}
                        testID={`field-date-${field.id}`}
                    />
                    <Button disabled={!ok} onPress={() => onCommit(text)} testID={`field-save-${field.id}`}>
                        {t('inspection.field.save')}
                    </Button>
                </YStack>
            );
        }
        case 'file-upload':
            return (
                <YStack gap={space[2]}>
                    {camera ? (
                        <View style={{ height: 320 }} testID={`field-camera-${field.id}`}>
                            {(() => {
                                const Camera = lazyCamera();
                                return (
                                    <Camera
                                        onDone={(taken) => {
                                            const first = taken.map((p) => p.base64 ?? '').find(Boolean);
                                            setCamera(false);
                                            if (first) onCommit(first);
                                        }}
                                    />
                                );
                            })()}
                        </View>
                    ) : null}
                    {value ? <Micro tone="success">✓ {t('inspection.field.photoTaken')}</Micro> : null}
                    <Button variant={value ? 'secondary' : 'primary'} onPress={() => setCamera((v) => !v)} testID={`field-photo-${field.id}`}>
                        {value ? t('inspection.field.retakePhoto') : t('inspection.field.takePhoto')}
                    </Button>
                </YStack>
            );
        case 'signature':
            return (
                <YStack gap={space[2]}>
                    {signing ? (
                        <>
                            <View style={{ height: 220 }} testID={`field-signature-pad-${field.id}`}>
                                {(() => {
                                    const SignaturePad = lazySignaturePad();
                                    return (
                                        <SignaturePad
                                            ref={signatureRef}
                                            onOK={(data: string) => {
                                                setSigning(false);
                                                onCommit(toBareBase64(data));
                                            }}
                                            webStyle=".m-signature-pad--footer { display: none; }"
                                        />
                                    );
                                })()}
                            </View>
                            <Button variant="secondary" onPress={() => signatureRef.current?.readSignature()} testID={`field-signature-done-${field.id}`}>
                                {t('common.done')}
                            </Button>
                        </>
                    ) : (
                        <>
                            {value ? <Micro tone="success">✓ {t('inspection.field.signed')}</Micro> : null}
                            <Button variant={value ? 'secondary' : 'primary'} onPress={() => setSigning(true)} testID={`field-sign-${field.id}`}>
                                {value ? t('inspection.field.clear') : t('inspection.field.sign')}
                            </Button>
                        </>
                    )}
                </YStack>
            );
        default:
            return (
                <YStack gap={space[2]}>
                    <Field value={text} onChangeText={setText} multiline={field.type === 'textarea'} placeholder={t('inspection.field.textPlaceholder')} testID={`field-text-${field.id}`} />
                    <Button disabled={!text.trim()} onPress={() => onCommit(text.trim())} testID={`field-save-${field.id}`}>
                        {t('inspection.field.save')}
                    </Button>
                </YStack>
            );
    }
}

export function InspectionChecklistScreen({ formId, vehicleId, vehicleName, seedForm, onPause, onReview }: InspectionChecklistScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { form, isLoading, failed, error, retry } = useInspectionForm(formId, seedForm);
    const draft = useInspectionDraft(formId, vehicleId);

    const [selectedId, setSelectedId] = useState<string | undefined>();
    const [editing, setEditing] = useState<ItemAnswer | null>(null);

    const groups = useMemo(() => groupItems(form, draft), [form, draft]);
    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const fields = useMemo(() => fieldsOf(form), [form]);
    // By id, never by identity: `groupsOf` builds fresh field objects on every call.
    const current = useMemo(() => {
        const wanted = selectedId ?? nextUnanswered(form, draft)?.id;
        return fields.find((f) => f.id === wanted) ?? fields[fields.length - 1];
    }, [fields, selectedId, form, draft]);
    const currentIndex = current ? fields.findIndex((f) => f.id === current.id) : -1;

    const advance = useCallback(
        (from: InspectionField, nextDraft: ReturnType<typeof useInspectionDraft>) => {
            const next = fieldsOf(form).find((f) => f.id !== from.id && !isAnswered(f, nextDraft));
            setSelectedId(next?.id);
        },
        [form]
    );

    const recordAnswer = useCallback(
        (field: InspectionField, answer: ItemAnswer) => {
            inspectionDrafts.answer(formId, vehicleId, field.id, answer);
            advance(field, inspectionDrafts.get(formId, vehicleId));
        },
        [advance, formId, vehicleId]
    );

    const recordValue = useCallback(
        (field: InspectionField, value: FieldValue) => {
            inspectionDrafts.setValue(formId, vehicleId, field.id, value);
            advance(field, inspectionDrafts.get(formId, vehicleId));
        },
        [advance, formId, vehicleId]
    );

    const pass = useCallback(() => current && recordAnswer(current, { passed: true, photos: [] }), [current, recordAnswer]);
    const notApplicable = useCallback(() => current && recordAnswer(current, { passed: null, photos: [] }), [current, recordAnswer]);
    const openDefect = useCallback(() => {
        if (!current) return;
        const existing = draft?.answers[current.id];
        setEditing(existing?.passed === false ? existing : { passed: false, severity: ((current.meta?.severity as Severity | undefined) ?? 'medium') as Severity, comments: '', photos: [] });
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

                {!fields.length ? <Banner tone="warning" message={t('inspection.checklist.empty')} testID="checklist-empty" /> : null}

                {groups.map(({ group, answered }) => (
                    <YStack key={group.id ?? group.name} gap={space[2]} testID={`checklist-group-${group.name}`}>
                        <XStack justifyContent="space-between" paddingHorizontal={space[1]}>
                            <Caption>{t('inspection.checklist.groupProgress', { category: group.name.toUpperCase(), answered, total: group.fields.length })}</Caption>
                            {answered === group.fields.length ? <Micro tone="success">✓</Micro> : null}
                        </XStack>
                        <Surface>
                            {group.fields.map((field, i) => {
                                const isCurrent = field.id === current?.id;
                                const summary = summaryOf(field, draft, t);
                                const a = isPassFail(field) ? draft?.answers[field.id] : undefined;
                                return (
                                    <YStack key={field.id}>
                                        {i > 0 ? <Divider /> : null}
                                        <YStack
                                            padding={space[3]}
                                            gap={2}
                                            backgroundColor={isCurrent ? '$primaryFill' : undefined}
                                            onPress={() => {
                                                setSelectedId(field.id);
                                                setEditing(null);
                                            }}
                                            pressStyle={{ opacity: 0.8 }}
                                            accessibilityRole="button"
                                            testID={`checklist-item-${field.id}`}
                                        >
                                            <XStack justifyContent="space-between" gap={space[2]}>
                                                <Body fontSize={14} fontWeight={isCurrent ? '800' : '600'} flex={1}>
                                                    {field.label}
                                                </Body>
                                                {!isPassFail(field) ? <Micro>{t(`inspection.field.type.${field.type}`, { defaultValue: String(field.type) })}</Micro> : null}
                                            </XStack>
                                            {summary ? (
                                                <Micro tone={summary.tone} testID={`checklist-answer-${field.id}`}>
                                                    {summary.text}
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
                        field={current}
                        answer={editing}
                        onChange={setEditing}
                        onSave={() => {
                            recordAnswer(current, editing);
                            setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        t={t}
                    />
                ) : current ? (
                    <Surface hero padded active testID="checklist-current">
                        <YStack gap={space[3]}>
                            <Micro>
                                {t('inspection.checklist.itemOfType', {
                                    index: currentIndex + 1,
                                    total: fields.length,
                                    type: t(`inspection.field.type.${current.type}`, { defaultValue: String(current.type) }).toUpperCase(),
                                })}
                            </Micro>
                            <Body fontSize={17} fontWeight="800">
                                {current.label}
                            </Body>
                            {current.description || current.help_text ? <Secondary fontSize={13}>{current.description ?? current.help_text}</Secondary> : null}
                            {isPassFail(current) ? (
                                <>
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
                                </>
                            ) : (
                                <FieldControl key={current.id} field={current} value={draft?.values?.[current.id]} onCommit={(v) => recordValue(current, v)} t={t} />
                            )}
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
                    <Button flex={1} onPress={() => setSelectedId(nextUnanswered(form, draft)?.id)} disabled={!nextUnanswered(form, draft)} testID="checklist-next">
                        {t('inspection.checklist.nextItem')}
                    </Button>
                )}
            </XStack>
        </YStack>
    );
}

export default InspectionChecklistScreen;
