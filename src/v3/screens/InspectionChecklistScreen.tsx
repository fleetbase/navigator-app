/**
 * Inspection — the checklist (design round 3, s38 "InspectList") and recording
 * a problem (s39 "InspectDefect").
 *
 * The check is walked a part at a time: the form's groups are its parts. The
 * header says which part ("PART 3 OF 5", its name), that every answer is kept
 * on the phone, and draws a bar of the parts, each as wide as its share of the
 * checks. Under it, one card per check: the question, a line of help, and OK
 * or Problem. The first check still to answer is outlined. At the foot, how
 * many are answered in this part and the way on, which says why it cannot be
 * pressed yet ("Answer each check to go on").
 *
 * The form is groups of typed fields, not only pass/fail ones, and each field
 * renders its own control in its card: a yes or no, a choice, a number with
 * its unit, a date, text, a photo, a signature. Every answer goes into the
 * persisted draft as it is given, so a cold start loses nothing; the screen
 * holds no answers of its own.
 *
 * Problem opens the problem view in place of the list: how bad it is (three
 * levels over the four severities: minor, needs repair, unsafe), photos, and
 * what the driver saw. A level, a photo where the check or the level asks for
 * one, and a note where the check asks for one are needed to save it; the
 * button says which is missing. Nothing is sent from here: the review sends.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Modal, View, type LayoutChangeEvent, type ScrollView as RNScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from '../ui/Scroll';
import { XStack, YStack } from 'tamagui';
import { Body } from '../ui/Text';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import {
    useInspectionForm,
    useInspectionDraft,
    inspectionDrafts,
    groupItems,
    draftProgress,
    fieldsOf,
    isPassFail,
    isAnswered,
    photoRequiredFor,
    commentRequiredFor,
    type InspectionFormRecord,
    type InspectionField,
    type InspectionFieldGroup,
    type ItemAnswer,
    type FieldValue,
    type Severity,
} from '../data';
import type { InspectionOrderContext } from '../data/inspectionLedger';
import { InspectionOrderBanner } from './inspection/OrderBanner';
import type { CapturedPhoto } from '../../components/CameraCapture';
import { useScreenStyle } from '../ui/useScreenStyle';
import { NO_INK, SignaturePad, isSignature, type Ink, type SignaturePadHandle } from './proof/SignaturePad';
import {
    FieldLabel,
    FootBar,
    FootButton,
    GUTTER,
    HeaderButton,
    InlineInput,
    InspectIcon,
    LEVELS,
    LevelMark,
    PartBar,
    SavedPill,
    ScreenTop,
    levelBorder,
    levelOf,
    partName,
    severityFor,
    useInk,
    type Level,
} from './inspection/parts';

/* Native modules load only when a field asks for them. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

export interface InspectionChecklistScreenProps {
    formId: string;
    vehicleId?: string;
    vehicleName?: string;
    seedForm?: InspectionFormRecord | null;
    /** The order and step the inspection is for, when a step of an order needs it. */
    orderContext?: InspectionOrderContext | null;
    /** Opens the problem view of this field (the review's "edit this problem"). */
    editField?: string;
    /** Changes each time `editField` is asked for again. */
    editNonce?: number;
    /** Leave: the draft persists. */
    onPause?: () => void;
    onReview?: (formId: string, vehicleId?: string) => void;
}

type T = (k: string, o?: Record<string, unknown>) => string;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/;
/** Typed answers are kept this long after the last key, as well as when the field is left. */
const TYPING_COMMIT_MS = 600;

const photoUri = (base64: string) => (base64.startsWith('data:') || base64.startsWith('file:') ? base64 : `data:image/jpeg;base64,${base64}`);

const hintOf = (field: InspectionField) => field.description || field.help_text || (field.meta?.instructions ? String(field.meta.instructions) : undefined);

/* -- The camera, over everything. ----------------------------------------------- */

function CameraModal({ visible, onClose, onDone, t }: { visible: boolean; onClose: () => void; onDone: (photos: string[]) => void; t: T }) {
    const insets = useSafeAreaInsets();
    if (!visible) return null;
    const Camera = lazyCamera();
    return (
        <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
            <YStack flex={1} backgroundColor="$background" paddingTop={insets.top} testID="inspection-camera">
                <XStack paddingHorizontal={GUTTER} paddingVertical={8}>
                    <HeaderButton icon="close" label={t('inspection.defect.cameraClose')} onPress={onClose} testID="inspection-camera-close" />
                </XStack>
                <View style={{ flex: 1, paddingBottom: insets.bottom }}>
                    <Camera onDone={(taken) => onDone(taken.map((p) => p.base64 ?? '').filter(Boolean))} />
                </View>
            </YStack>
        </Modal>
    );
}

/* -- Two big choices side by side: OK / Problem, Yes / No. ----------------------- */

function ChoiceButton({ label, icon, on, tone, onPress, testID }: { label: string; icon?: 'check' | 'alert'; on: boolean; tone: 'success' | 'danger' | 'brand'; onPress: () => void; testID?: string }) {
    const ink = useInk();
    const fill = on ? (tone === 'success' ? '$successFill' : tone === 'danger' ? '$dangerFill' : '$primaryFill') : '$surfaceRaised';
    const border = on ? (tone === 'success' ? '$success' : tone === 'danger' ? '$danger' : '$primary') : '$border';
    const text = on ? (tone === 'success' ? 'successText' : tone === 'danger' ? 'dangerText' : 'primary') : 'textPrimary';
    return (
        <XStack
            flex={1}
            flexBasis={0}
            alignItems="center"
            justifyContent="center"
            gap={8}
            height={52}
            borderRadius={14}
            borderWidth={on ? 1.5 : 1}
            borderColor={border as never}
            backgroundColor={fill as never}
            onPress={onPress}
            pressStyle={{ opacity: 0.75 }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            testID={testID}
        >
            {icon ? <InspectIcon name={icon} size={18} strokeWidth={3} color={ink(text)} /> : null}
            <Body fontSize={16} lineHeight={21} fontWeight="800" color={`$${text}` as never} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

/* -- A typed field's control, inside its card. ------------------------------------ */

function TypedInput({ field, value, onCommit, t }: { field: InspectionField; value: FieldValue | undefined; onCommit: (v: FieldValue) => void; t: T }) {
    const [text, setText] = useState(value == null ? '' : String(value));
    const isNumber = field.type === 'number';
    const isDate = field.type === 'date-picker';
    const isDateTime = field.type === 'date-time-input';
    const clean = isNumber ? text.replace(/[\s,]/g, '') : text.trim();
    const valid = clean === '' ? false : isNumber ? Number.isFinite(Number(clean)) : isDate ? DATE_RE.test(clean) : isDateTime ? DATETIME_RE.test(clean) : true;
    const latest = useRef({ clean, valid, value, onCommit });
    latest.current = { clean, valid, value, onCommit };

    const commit = useCallback(() => {
        const { clean: c, valid: ok, value: held, onCommit: save } = latest.current;
        if (c === '') {
            if (held != null && held !== '') save(null);
            return;
        }
        if (!ok) return;
        const next = isNumber ? Number(c) : c;
        if (String(next) !== String(held ?? '')) save(next);
    }, [isNumber]);

    useEffect(() => {
        const timer = setTimeout(commit, TYPING_COMMIT_MS);
        return () => clearTimeout(timer);
    }, [text, commit]);

    const error = text.trim() !== '' && !valid ? (isNumber ? t('inspection.field.invalidNumber') : isDate ? t('inspection.field.invalidDate') : isDateTime ? t('inspection.field.invalidDateTime') : undefined) : undefined;
    return (
        <YStack gap={6}>
            <InlineInput
                value={text}
                onChangeText={setText}
                onBlur={commit}
                onSubmitEditing={commit}
                multiline={field.type === 'textarea'}
                keyboardType={isNumber ? 'decimal-pad' : 'default'}
                returnKeyType={field.type === 'textarea' ? 'default' : 'done'}
                mono={isNumber || isDate || isDateTime}
                height={52}
                fontSize={isNumber ? 20 : 16}
                placeholder={isNumber ? t('inspection.field.numberPlaceholder') : isDate ? t('inspection.field.datePlaceholder') : isDateTime ? t('inspection.field.dateTimePlaceholder') : t('inspection.field.textPlaceholder')}
                invalid={Boolean(error)}
                accessibilityLabel={field.label}
                accessory={
                    field.meta?.unit ? (
                        <Body fontSize={15} lineHeight={20} fontWeight="700" tone="secondary">
                            {String(field.meta.unit)}
                        </Body>
                    ) : undefined
                }
                testID={`field-${isNumber ? 'number' : isDate || isDateTime ? 'date' : 'text'}-${field.id}`}
            />
            {error ? (
                <Body fontSize={13} lineHeight={18} tone="danger">
                    {error}
                </Body>
            ) : null}
        </YStack>
    );
}

function PhotoControl({ field, value, onCommit, t }: { field: InspectionField; value: FieldValue | undefined; onCommit: (v: FieldValue) => void; t: T }) {
    const ink = useInk();
    const [camera, setCamera] = useState(false);
    const photo = typeof value === 'string' && value ? value : undefined;
    return (
        <XStack gap={8} alignItems="center">
            {photo ? <Image source={{ uri: photoUri(photo) }} style={{ width: 96, height: 72, borderRadius: 12 }} accessibilityLabel={t('inspection.field.photoTaken')} /> : null}
            <YStack
                flex={1}
                height={photo ? 72 : 96}
                borderRadius={14}
                borderWidth={1.5}
                borderStyle="dashed"
                borderColor="$textMuted"
                alignItems="center"
                justifyContent="center"
                gap={6}
                onPress={() => setCamera(true)}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="button"
                testID={`field-photo-${field.id}`}
            >
                <InspectIcon name="camera" size={22} strokeWidth={2.2} color={ink('textPrimary')} />
                <Body fontSize={13} lineHeight={17} fontWeight="800">
                    {photo ? t('inspection.field.retakePhoto') : t('inspection.field.takePhoto')}
                </Body>
            </YStack>
            <CameraModal
                visible={camera}
                onClose={() => setCamera(false)}
                onDone={(taken) => {
                    setCamera(false);
                    if (taken[0]) onCommit(taken[0]);
                }}
                t={t}
            />
        </XStack>
    );
}

function SignatureControl({ field, value, onCommit, onSigning, t }: { field: InspectionField; value: FieldValue | undefined; onCommit: (v: FieldValue) => void; onSigning: (on: boolean) => void; t: T }) {
    const ink = useInk();
    const [ink_, setInk] = useState<Ink>(NO_INK);
    const pad = useRef<SignaturePadHandle>(null);
    const [again, setAgain] = useState(false);
    const signed = typeof value === 'string' && Boolean(value);

    const onInk = useCallback(
        (next: Ink) => {
            setInk(next);
            onSigning(false);
            if (!isSignature(next.strokes)) return;
            // Read once the stroke has been drawn on the hidden export surface.
            setTimeout(() => {
                void pad.current?.read().then((image) => {
                    if (image) onCommit(image);
                });
            }, 50);
        },
        [onCommit, onSigning]
    );

    if (signed && !again && !ink_.strokes.length) {
        return (
            <XStack alignItems="center" justifyContent="space-between" gap={12} minHeight={48} testID={`field-signed-${field.id}`}>
                <XStack alignItems="center" gap={8} flexShrink={1}>
                    <InspectIcon name="check" size={16} strokeWidth={3.2} color={ink('successText')} />
                    <Body fontSize={15} lineHeight={20} fontWeight="800" tone="success">
                        {t('inspection.field.signed')}
                    </Body>
                </XStack>
                <XStack height={40} paddingHorizontal={12} alignItems="center" borderRadius={12} borderWidth={1} borderColor="$border" onPress={() => setAgain(true)} pressStyle={{ opacity: 0.6 }} accessibilityRole="button" testID={`field-sign-${field.id}`}>
                    <Body fontSize={13} lineHeight={17} fontWeight="700">
                        {t('inspection.field.signAgain')}
                    </Body>
                </XStack>
            </XStack>
        );
    }

    return (
        <YStack gap={8}>
            <View style={{ height: 150 }}>
                <SignaturePad ref={pad} ink={ink_} onInk={onInk} onBegin={() => onSigning(true)} variant="upright" hint={t('inspection.field.signHere')} label={t('inspection.field.padLabel')} testID={`field-signature-pad-${field.id}`} />
            </View>
            {ink_.strokes.length ? (
                <XStack justifyContent="flex-end">
                    <Body
                        fontSize={13}
                        lineHeight={17}
                        fontWeight="800"
                        tone="brand"
                        paddingVertical={8}
                        onPress={() => {
                            setInk(NO_INK);
                            onCommit(null);
                        }}
                        accessibilityRole="button"
                        testID={`field-signature-clear-${field.id}`}
                    >
                        {t('inspection.field.clear')}
                    </Body>
                </XStack>
            ) : null}
        </YStack>
    );
}

function FieldControl({ field, value, onCommit, onSigning, t }: { field: InspectionField; value: FieldValue | undefined; onCommit: (v: FieldValue) => void; onSigning: (on: boolean) => void; t: T }) {
    switch (field.type) {
        case 'boolean':
            return (
                <XStack gap={8} testID={`field-boolean-${field.id}`}>
                    <ChoiceButton label={t('inspection.field.yes')} on={value === true} tone="brand" onPress={() => onCommit(true)} testID={`field-yes-${field.id}`} />
                    <ChoiceButton label={t('inspection.field.no')} on={value === false} tone="brand" onPress={() => onCommit(false)} testID={`field-no-${field.id}`} />
                </XStack>
            );
        case 'select':
        case 'radio-button': {
            const options = (field.options ?? []).map(String);
            return (
                <YStack gap={8} testID={`field-options-${field.id}`}>
                    {options.map((option) => {
                        const on = value === option;
                        return (
                            <XStack
                                key={option}
                                minHeight={52}
                                paddingHorizontal={14}
                                alignItems="center"
                                gap={10}
                                borderRadius={14}
                                borderWidth={on ? 1.5 : 1}
                                borderColor={on ? '$primary' : '$border'}
                                backgroundColor={on ? '$primaryFill' : '$surfaceRaised'}
                                onPress={() => onCommit(option)}
                                pressStyle={{ opacity: 0.75 }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                testID={`field-option-${field.id}-${option}`}
                            >
                                <Body flex={1} fontSize={16} lineHeight={21} fontWeight="800" tone={on ? 'brand' : 'primary'}>
                                    {option}
                                </Body>
                                {on ? <Body fontSize={16} fontWeight="800" tone="brand">✓</Body> : null}
                            </XStack>
                        );
                    })}
                </YStack>
            );
        }
        case 'file-upload':
            return <PhotoControl field={field} value={value} onCommit={onCommit} t={t} />;
        case 'signature':
            return <SignatureControl field={field} value={value} onCommit={onCommit} onSigning={onSigning} t={t} />;
        default:
            return <TypedInput field={field} value={value} onCommit={onCommit} t={t} />;
    }
}

/* -- One check, as a card. ----------------------------------------------------------- */

function CheckCard({
    field,
    draft,
    current,
    onPass,
    onProblem,
    onNotApplicable,
    onValue,
    onSigning,
    t,
}: {
    field: InspectionField;
    draft: ReturnType<typeof useInspectionDraft>;
    current: boolean;
    onPass: () => void;
    onProblem: () => void;
    onNotApplicable: () => void;
    onValue: (v: FieldValue) => void;
    onSigning: (on: boolean) => void;
    t: T;
}) {
    const hint = hintOf(field);
    const answer = isPassFail(field) ? draft?.answers[field.id] : undefined;
    const answered = isAnswered(field, draft);
    const level = answer?.passed === false ? levelOf(answer) : undefined;
    return (
        <YStack gap={12} padding={14} borderRadius={18} backgroundColor="$surface" borderWidth={current ? 1.5 : 1} borderColor={current ? '$primary' : '$border'} testID={`checklist-item-${field.id}`}>
            <YStack gap={3}>
                <Body fontSize={17} lineHeight={22} fontWeight="800">
                    {field.label}
                    {field.required === false ? (
                        <Body fontSize={14} lineHeight={22} fontWeight="700" tone="secondary">
                            {`  ${t('inspection.checklist.optional')}`}
                        </Body>
                    ) : null}
                </Body>
                {hint ? (
                    <Body fontSize={14} lineHeight={20} tone="secondary">
                        {hint}
                    </Body>
                ) : null}
            </YStack>

            {isPassFail(field) ? (
                <>
                    <XStack gap={8}>
                        <ChoiceButton label={t('inspection.checklist.ok')} icon="check" on={answer?.passed === true} tone="success" onPress={onPass} testID={`checklist-pass-${field.id}`} />
                        <ChoiceButton label={t('inspection.checklist.problem')} icon="alert" on={answer?.passed === false} tone="danger" onPress={onProblem} testID={`checklist-defect-${field.id}`} />
                    </XStack>
                    {answer?.passed === false && level ? (
                        <XStack
                            alignItems="center"
                            gap={10}
                            paddingVertical={10}
                            paddingHorizontal={12}
                            borderRadius={12}
                            backgroundColor="$dangerFill"
                            borderWidth={1}
                            borderColor="$dangerBorder"
                            onPress={onProblem}
                            pressStyle={{ opacity: 0.75 }}
                            accessibilityRole="button"
                            testID={`checklist-answer-${field.id}`}
                        >
                            <LevelMark level={level} size={24} />
                            <YStack flex={1} minWidth={0} gap={1}>
                                <Body fontSize={14} lineHeight={19} fontWeight="800" tone="danger">
                                    {`${t(`inspection.defect.level.${level}.name`)} · ${t('inspection.checklist.photoCount', { count: answer.photos.length })}`}
                                </Body>
                                {answer.comments ? (
                                    <Body fontSize={13} lineHeight={18} tone="secondary" numberOfLines={2}>
                                        {answer.comments}
                                    </Body>
                                ) : null}
                            </YStack>
                            <Body fontSize={13} lineHeight={17} fontWeight="800" tone="danger">
                                {t('inspection.checklist.edit')}
                            </Body>
                        </XStack>
                    ) : answer?.passed === null ? (
                        <Body fontSize={13} lineHeight={18} fontWeight="700" tone="secondary" testID={`checklist-answer-${field.id}`}>
                            {t('inspection.checklist.naMarked')}
                        </Body>
                    ) : current && !answered ? (
                        <Body alignSelf="flex-start" fontSize={13} lineHeight={17} fontWeight="700" tone="secondary" paddingVertical={6} onPress={onNotApplicable} accessibilityRole="button" testID={`checklist-na-${field.id}`}>
                            {t('inspection.checklist.notApplicable')}
                        </Body>
                    ) : null}
                </>
            ) : (
                <FieldControl field={field} value={draft?.values?.[field.id]} onCommit={onValue} onSigning={onSigning} t={t} />
            )}
        </YStack>
    );
}

/* -- s39: recording a problem. ---------------------------------------------------------- */

function DefectView({ field, answer, onChange, onSave, onCancel, t }: { field: InspectionField; answer: ItemAnswer; onChange: (a: ItemAnswer) => void; onSave: () => void; onCancel: () => void; t: T }) {
    const ink = useInk();
    const [camera, setCamera] = useState(false);
    const [gridWidth, setGridWidth] = useState(0);
    const alwaysUnsafe = field.meta?.unsafe_on_fail === true;
    const level = alwaysUnsafe ? 'unsafe' : answer.severity ? levelOf(answer) : undefined;
    const needsPhoto = photoRequiredFor(field, answer.severity);
    const needsComment = commentRequiredFor(field);
    const missing = !answer.severity ? 'level' : needsPhoto && !answer.photos.length ? 'photo' : needsComment && !(answer.comments ?? '').trim() ? 'note' : null;
    const tile = gridWidth > 0 ? Math.floor((gridWidth - 16) / 3) : 0;
    const hint = hintOf(field);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            onCancel();
            return true;
        });
        return () => sub.remove();
    }, [onCancel]);

    const pick = (next: Level) => onChange({ ...answer, severity: severityFor(next, answer.severity), unsafe: next === 'unsafe' });

    return (
        <YStack flex={1} backgroundColor="$background" testID="defect-sheet">
            <ScreenTop backLabel={t('inspection.defect.back')} onBack={onCancel} eyebrow={t('inspection.defect.eyebrow')} eyebrowTone="danger" title={field.label} titleSize={19} />
            <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
                {hint ? (
                    <Body fontSize={14} lineHeight={20} tone="secondary" marginTop={-6}>
                        {hint}
                    </Body>
                ) : null}

                <YStack gap={8} accessibilityRole="radiogroup">
                    <FieldLabel>{t('inspection.defect.howBad')}</FieldLabel>
                    {(alwaysUnsafe ? (['unsafe'] as Level[]) : LEVELS).map((option) => {
                        const on = level === option;
                        return (
                            <XStack
                                key={option}
                                alignItems="center"
                                gap={12}
                                paddingVertical={12}
                                paddingHorizontal={14}
                                borderRadius={16}
                                borderWidth={on ? 1.5 : 1}
                                borderColor={on ? (levelBorder(option) as never) : '$border'}
                                backgroundColor={on ? '$surfaceRaised' : '$surface'}
                                onPress={() => pick(option)}
                                pressStyle={{ opacity: 0.8 }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                testID={`defect-level-${option}`}
                            >
                                <LevelMark level={option} />
                                <YStack flex={1} minWidth={0} gap={1}>
                                    <Body fontSize={16} lineHeight={21} fontWeight="800">
                                        {t(`inspection.defect.level.${option}.name`)}
                                    </Body>
                                    <Body fontSize={13} lineHeight={18} tone="secondary">
                                        {t(`inspection.defect.level.${option}.what`)}
                                    </Body>
                                </YStack>
                                {on ? <InspectIcon name="check" size={20} strokeWidth={3} color={ink('textPrimary')} /> : null}
                            </XStack>
                        );
                    })}
                    {alwaysUnsafe ? (
                        <Body fontSize={13} lineHeight={18} tone="secondary">
                            {t('inspection.defect.alwaysUnsafe')}
                        </Body>
                    ) : null}
                </YStack>

                <YStack gap={8}>
                    <FieldLabel>{needsPhoto ? t('inspection.defect.photosRequired') : t('inspection.defect.photosOptional')}</FieldLabel>
                    <XStack flexWrap="wrap" gap={8} onLayout={(e: LayoutChangeEvent) => setGridWidth(e.nativeEvent.layout.width)} testID="defect-photos">
                        {tile
                            ? answer.photos.map((photo, i) => (
                                  <Image key={i} source={{ uri: photoUri(photo) }} style={{ width: tile, height: 96, borderRadius: 14 }} accessibilityLabel={t('inspection.defect.photo', { index: i + 1 })} />
                              ))
                            : null}
                        <YStack
                            width={tile || '31%'}
                            height={96}
                            borderRadius={14}
                            borderWidth={1.5}
                            borderStyle="dashed"
                            borderColor="$textMuted"
                            alignItems="center"
                            justifyContent="center"
                            gap={6}
                            onPress={() => setCamera(true)}
                            pressStyle={{ opacity: 0.7 }}
                            accessibilityRole="button"
                            testID="defect-add-photo"
                        >
                            <InspectIcon name="camera" size={22} strokeWidth={2.2} color={ink('textPrimary')} />
                            <Body fontSize={13} lineHeight={17} fontWeight="800">
                                {t('inspection.defect.addPhoto')}
                            </Body>
                        </YStack>
                    </XStack>
                </YStack>

                <YStack gap={8}>
                    <FieldLabel>{needsComment ? t('inspection.defect.whatDidYouSee') : t('inspection.defect.whatOptional')}</FieldLabel>
                    <InlineInput
                        multiline
                        value={answer.comments ?? ''}
                        onChangeText={(comments) => onChange({ ...answer, comments })}
                        placeholder={t('inspection.defect.notesPlaceholder')}
                        accessibilityLabel={t('inspection.defect.whatDidYouSee')}
                        testID="defect-notes"
                    />
                </YStack>
            </ScrollView>

            <FootBar testID="defect-actions">
                {missing ? (
                    <FootButton kind="off" label={t(missing === 'level' ? 'inspection.defect.needLevel' : missing === 'photo' ? 'inspection.defect.needPhoto' : 'inspection.defect.needNote')} testID="defect-save" />
                ) : (
                    <FootButton label={t('inspection.defect.saveAndCarryOn')} onPress={onSave} testID="defect-save" />
                )}
            </FootBar>

            <CameraModal
                visible={camera}
                onClose={() => setCamera(false)}
                onDone={(taken) => {
                    setCamera(false);
                    if (taken.length) onChange({ ...answer, photos: [...answer.photos, ...taken] });
                }}
                t={t}
            />
        </YStack>
    );
}

/* -- The screen. --------------------------------------------------------------------------- */

export function InspectionChecklistScreen({ formId, vehicleId, seedForm, orderContext, editField, editNonce, onPause, onReview }: InspectionChecklistScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { form, isLoading, failed, error, retry } = useInspectionForm(formId, seedForm);
    const draft = useInspectionDraft(formId, vehicleId);
    const scroll = useRef<RNScrollView>(null);

    const groups = useMemo(() => groupItems(form, draft), [form, draft]);
    const progress = useMemo(() => draftProgress(form, draft), [form, draft]);
    const fields = useMemo(() => fieldsOf(form), [form]);

    const [partIndex, setPartIndex] = useState<number | null>(null);
    const [editing, setEditing] = useState<{ fieldId: string; answer: ItemAnswer } | null>(null);
    const [signing, setSigning] = useState(false);

    // The draft exists from the first look, so a check left at once is still resumable.
    useEffect(() => {
        if (form && !draft) inspectionDrafts.start(formId, vehicleId);
    }, [form, draft, formId, vehicleId]);

    const partOf = useCallback((fieldId: string) => groups.findIndex(({ group }) => group.fields.some((f) => f.id === fieldId)), [groups]);
    const requiredLeft = (group: InspectionFieldGroup) => group.fields.some((f) => f.required !== false && !isAnswered(f, draft));

    // Opens on the first part with a check still to answer (a resumed check carries on where it was).
    useEffect(() => {
        if (partIndex !== null || !groups.length) return;
        const open = groups.findIndex(({ group }) => requiredLeft(group));
        const any = groups.findIndex(({ group }) => group.fields.some((f) => !isAnswered(f, draft)));
        setPartIndex(open >= 0 ? open : any >= 0 ? any : groups.length - 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, partIndex]);

    const openDefect = useCallback(
        (field: InspectionField) => {
            const existing = draft?.answers[field.id];
            const fieldSeverity = field.meta?.severity as Severity | undefined;
            const alwaysUnsafe = field.meta?.unsafe_on_fail === true;
            setEditing({
                fieldId: field.id,
                answer:
                    existing?.passed === false
                        ? existing
                        : alwaysUnsafe
                          ? { passed: false, severity: fieldSeverity === 'critical' ? 'critical' : 'high', unsafe: true, comments: '', photos: [] }
                          : // No level until the driver picks one: the mockup's question is asked, not answered for them.
                            { passed: false, comments: '', photos: [] },
            });
        },
        [draft]
    );

    // The review's "this problem": its part, and its problem view; saved or not, back to the review.
    const backToReview = useRef(false);
    useEffect(() => {
        if (!editField || !form) return;
        const field = fields.find((f) => f.id === editField);
        if (!field) return;
        const index = partOf(field.id);
        if (index >= 0) setPartIndex(index);
        if (isPassFail(field)) {
            backToReview.current = true;
            openDefect(field);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editField, editNonce, form]);

    const current = partIndex !== null ? groups[partIndex] : undefined;
    const goToPart = useCallback((index: number) => {
        setPartIndex(index);
        scroll.current?.scrollTo({ y: 0, animated: false });
    }, []);
    const back = useCallback(() => {
        if (partIndex && partIndex > 0) goToPart(partIndex - 1);
        else onPause?.();
    }, [partIndex, goToPart, onPause]);

    // Android's back walks the parts back, as the header's does.
    useEffect(() => {
        if (editing) return undefined;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (partIndex && partIndex > 0) {
                goToPart(partIndex - 1);
                return true;
            }
            return false;
        });
        return () => sub.remove();
    }, [editing, partIndex, goToPart]);

    const closeDefect = useCallback(() => {
        setEditing(null);
        if (!backToReview.current) return;
        backToReview.current = false;
        if (draftProgress(form, inspectionDrafts.get(formId, vehicleId)).complete) onReview?.(formId, vehicleId);
    }, [form, formId, vehicleId, onReview]);

    if (isLoading && !form) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={GUTTER} gap={12} testID="checklist-loading">
                <Skeleton height={64} />
                <Skeleton height={160} />
                <Skeleton height={160} />
            </YStack>
        );
    }
    if (!form) {
        return (
            <YStack flex={1} backgroundColor="$background">
                <ScreenTop backLabel={t('common.back')} onBack={onPause} title={t('inspection.title')} />
                <YStack flex={1} padding={GUTTER} justifyContent="center">
                    <FailureState error={failed ? error : { message: 'not found', status: 404 }} isOnline={isOnline} onRetry={retry} t={t} testID="checklist-error" />
                </YStack>
            </YStack>
        );
    }

    if (editing) {
        const field = fields.find((f) => f.id === editing.fieldId);
        if (field) {
            return (
                <DefectView
                    field={field}
                    answer={editing.answer}
                    onChange={(answer) => setEditing({ fieldId: field.id, answer })}
                    onSave={() => {
                        inspectionDrafts.answer(formId, vehicleId, field.id, editing.answer);
                        closeDefect();
                    }}
                    onCancel={closeDefect}
                    t={t}
                />
            );
        }
    }

    const total = groups.length;
    const index = partIndex ?? 0;
    const part = current?.group;
    const partFields = part?.fields ?? [];
    const answeredHere = current?.answered ?? 0;
    const currentField = partFields.find((f) => !isAnswered(f, draft));
    const partDone = part ? !requiredLeft(part) : false;
    const last = index >= total - 1;
    const firstOpen = groups.findIndex(({ group }) => requiredLeft(group));

    let next: React.ReactNode;
    if (!fields.length) {
        next = null;
    } else if (!partDone) {
        next = <FootButton flex={1} kind="off" label={t('inspection.checklist.answerEach')} testID="checklist-next" />;
    } else if (!last) {
        next = <FootButton flex={1} label={t('inspection.checklist.nextPart', { name: partName(groups[index + 1].group, t) })} onPress={() => goToPart(index + 1)} testID="checklist-next" />;
    } else if (progress.complete) {
        next = <FootButton flex={1} label={t('inspection.checklist.nextReview')} onPress={() => onReview?.(formId, vehicleId)} testID="checklist-review" />;
    } else {
        next = <FootButton flex={1} label={t('inspection.checklist.goToPart', { index: firstOpen + 1 })} onPress={() => goToPart(Math.max(0, firstOpen))} testID="checklist-next" />;
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-checklist">
            <ScreenTop
                backLabel={index > 0 ? t('inspection.checklist.backToPart', { index }) : t('inspection.checklist.leave')}
                onBack={back}
                eyebrow={total ? t('inspection.checklist.partOf', { index: index + 1, total }) : undefined}
                title={part ? partName(part, t) : (form.name ?? t('inspection.title'))}
                aside={<SavedPill label={isOnline ? t('inspection.checklist.savedOnPhone') : t('inspection.checklist.savedNoSignal')} offline={!isOnline} testID="checklist-progress" />}
                divided
            >
                {total > 1 ? (
                    <PartBar
                        parts={groups.map(({ group, answered }) => ({ size: group.fields.length, answered, done: group.fields.length > 0 && !requiredLeft(group), name: group.name }))}
                        current={index}
                        onPick={goToPart}
                        label={(i) => t('inspection.checklist.partLabel', { index: i + 1, name: partName(groups[i].group, t) })}
                    />
                ) : null}
            </ScreenTop>

            <ScrollView ref={scroll} style={screen} scrollEnabled={!signing} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 14, paddingBottom: 24, gap: 10 }}>
                <InspectionOrderBanner order={orderContext} t={t} />
                {!fields.length ? (
                    <Body fontSize={15} lineHeight={21} tone="warning" testID="checklist-empty">
                        {t('inspection.checklist.empty')}
                    </Body>
                ) : null}
                {partFields.map((field) => (
                    <CheckCard
                        key={field.id}
                        field={field}
                        draft={draft}
                        current={field.id === currentField?.id}
                        onPass={() => inspectionDrafts.answer(formId, vehicleId, field.id, { passed: true, photos: [] })}
                        onProblem={() => openDefect(field)}
                        onNotApplicable={() => inspectionDrafts.answer(formId, vehicleId, field.id, { passed: null, photos: [] })}
                        onValue={(v) => inspectionDrafts.setValue(formId, vehicleId, field.id, v)}
                        onSigning={setSigning}
                        t={t}
                    />
                ))}
            </ScrollView>

            {fields.length ? (
                <FootBar row divided testID="checklist-actions">
                    <Body flexShrink={0} fontSize={14} lineHeight={19} fontWeight="700" tabular tone="secondary" testID="checklist-count">
                        {t('inspection.checklist.answered', { answered: answeredHere, total: partFields.length })}
                    </Body>
                    {next}
                </FootBar>
            ) : null}
        </YStack>
    );
}

export default InspectionChecklistScreen;
