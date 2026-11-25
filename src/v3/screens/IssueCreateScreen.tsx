/**
 * Report an issue — design round 3 (`Issue.dc.html`).
 *
 * Four questions in the order a driver would answer them: what is it about,
 * which part, how urgent, what happened. Then, optionally, a photo.
 *
 * `POST /v1/issues` **requires** a location, so this screen cannot pretend
 * otherwise: with no fix it disables sending and says why, rather than letting
 * a driver write out a report and then bounce off server validation.
 *
 * How this differs from the mockup, and why:
 *
 *   - **Urgency is the server's four words** — low, medium, high, critical —
 *     not "Can wait / Today / Stop now". Those promise a response time nobody
 *     has agreed to, and the server would store something no console filter
 *     knows.
 *   - **"Order" is not a tile.** An issue is tied to an order by opening this
 *     screen *from* that order: the order's id is sent with the report and the
 *     screen says which order it is about. There is nothing to pick here, so
 *     opened from anywhere else no order is sent. (FleetOps before 0.7.4
 *     validates the `order` and then discards it.)
 *   - **"Sent with it" names the vehicle and the coordinates only.** The
 *     server attaches the driver's assigned vehicle itself; no odometer is
 *     sent or stored on an issue.
 *   - **Photos go up after the report**, to the file endpoint, pointed at the
 *     new issue. That needs the issue to exist, so a report queued offline
 *     goes without its photos and the screen says so beforehand.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { BottomSheetSelect } from '../ui';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import { useCreateIssue, useAttachIssuePhotos, type IssueRecord } from '../data/useIssues';
import { BigButton } from '../onboarding/AuthScaffold';
import { Icon, Screen, SectionLabel, SmallButton, Tile } from './me/parts';
import { ISSUE_CATEGORIES, ISSUE_TYPES, PRIORITIES, typeOf, type Priority } from './me/issueTaxonomy';
import { PriorityMark, priorityTone } from './me/issueParts';
import type { CapturedPhoto } from '../../components/CameraCapture';

/* VisionCamera initialises its native module at import; load it only when the driver asks for a photo. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

const PRIMARY_TYPES = ISSUE_TYPES.filter((type) => type.primary);
const OTHER_TYPES = ISSUE_TYPES.filter((type) => !type.primary);
/** Enough to show what is wrong; each one is a few megabytes of upload. */
const MAX_PHOTOS = 4;

function Question({ children }: { children: string }) {
    return (
        <Secondary fontSize={13} fontWeight="700">
            {children}
        </Secondary>
    );
}

export function IssueCreateScreen({
    driverId,
    initialType,
    vehicleName,
    orderId,
    orderLabel,
    onDone,
}: {
    driverId?: string;
    /** A type value to start on: `vehicle` when opened from My vehicle. */
    initialType?: string;
    /** Public id of the order this issue is about, when the screen was opened from one. */
    orderId?: string;
    /** That order's tracking number, to show the driver which one. */
    orderLabel?: string;
    /** The driver's assigned vehicle, which the server files the issue against. */
    vehicleName?: string;
    onDone?: (created: IssueRecord | null) => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const coordinates = useDeviceLocation();
    const { create, isSaving, queued, error } = useCreateIssue(driverId);
    const { attach, isUploading } = useAttachIssuePhotos();

    const [type, setType] = useState<string | null>(typeOf(initialType)?.value ?? null);
    // "Other" is chosen but no type under it picked yet.
    const [otherOpen, setOtherOpen] = useState(false);
    const [category, setCategory] = useState<string | null>(null);
    const [priority, setPriority] = useState<Priority>('medium');
    const [report, setReport] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [camera, setCamera] = useState(false);
    /** Set once the report is in but some photos are not. */
    const [sent, setSent] = useState<{ issue: IssueRecord; photosFailed: number } | null>(null);

    const categories = useMemo(() => (type ? (ISSUE_CATEGORIES[type] ?? []) : []), [type]);
    const typeIsOther = otherOpen || (!!type && !PRIMARY_TYPES.some((primary) => primary.value === type));

    const hasFix = !!coordinates;
    const canSave = hasFix && report.trim().length >= 3;

    const chooseType = (next: string) => {
        setType(next);
        // The old category rarely belongs to the new type.
        setCategory(null);
    };

    const save = useCallback(async () => {
        const point = toGeoPoint(coordinates);
        if (!point) return;
        const created = await create({ report, type: type ?? undefined, category: category ?? undefined, priority, location: point, order: orderId });
        if (!created) return;
        const photosFailed = photos.length && created.id ? await attach(created.id, photos) : 0;
        if (photosFailed > 0) setSent({ issue: created, photosFailed });
        else onDone?.(created);
    }, [coordinates, create, report, type, category, priority, orderId, photos, attach, onDone]);

    if (sent) {
        // The report itself is in; only the pictures are not. Say exactly that.
        return (
            <Screen
                testID="issue-create-sent"
                footer={
                    <BigButton onPress={() => onDone?.(sent.issue)} testID="issue-done">
                        {t('common.done')}
                    </BigButton>
                }
            >
                <YStack flex={1} justifyContent="center" gap={space[3]}>
                    <Banner tone="success" message={t('me.issue.sent')} testID="issue-sent" />
                    <Banner tone="warning" message={t('me.issue.photosFailed', { count: sent.photosFailed })} testID="issue-photos-failed" />
                </YStack>
            </Screen>
        );
    }

    return (
        <Screen
            testID="issue-create"
            footer={
                <BigButton disabled={!canSave} loading={isSaving || isUploading} onPress={save} testID="issue-save">
                    {t('me.issue.send')}
                </BigButton>
            }
        >
            {!isOnline ? <Banner tone="neutral" message={t('me.offlineWillSend')} testID="issue-create-offline" /> : null}

            {/* Said before the work, not after a rejected submit. */}
            {!hasFix ? (
                <YStack gap={space[2]} testID="needs-location">
                    <Banner tone="warning" message={t('issueCreate.needsLocation')} />
                    <Secondary fontSize={13} tone="warning">
                        {t('issueCreate.needsLocationHint')}
                    </Secondary>
                </YStack>
            ) : null}

            {orderId ? (
                <Tile flex={undefined} gap={4} paddingHorizontal={14} testID="issue-about-order">
                    <SectionLabel>{t('me.issue.aboutOrder')}</SectionLabel>
                    {/* Never truncated: the driver matches it to a label. */}
                    <Body fontFamily="$mono" fontSize={15} fontWeight="600" selectable>
                        {orderLabel ?? orderId}
                    </Body>
                </Tile>
            ) : null}

            <YStack gap={space[2]}>
                <Question>{t('me.issue.about')}</Question>
                <XStack gap={space[2]} accessibilityRole="radiogroup" testID="issue-types">
                    {[...PRIMARY_TYPES.map((item) => ({ key: item.value, label: t(`me.issue.type.${item.value}`, { defaultValue: item.label }), icon: item.icon, on: type === item.value && !otherOpen })), { key: 'other', label: t('me.issue.other'), icon: 'help' as const, on: typeIsOther }].map(
                        (tile) => (
                            <YStack
                                key={tile.key}
                                flex={1}
                                height={84}
                                alignItems="center"
                                justifyContent="center"
                                gap={space[2]}
                                borderRadius={16}
                                borderWidth={tile.on ? 1.5 : 1}
                                borderColor={tile.on ? '$primary' : '$border'}
                                backgroundColor={tile.on ? '$primaryFill' : '$surface'}
                                onPress={() => {
                                    if (tile.key === 'other') {
                                        setOtherOpen(true);
                                        if (type && PRIMARY_TYPES.some((primary) => primary.value === type)) {
                                            setType(null);
                                            setCategory(null);
                                        }
                                    } else {
                                        setOtherOpen(false);
                                        chooseType(tile.key);
                                    }
                                }}
                                pressStyle={{ opacity: 0.7 }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: tile.on }}
                                accessibilityLabel={tile.label}
                                testID={`issue-type-${tile.key}`}
                            >
                                <Icon name={tile.icon} size={24} color={tile.on ? 'primary' : 'textSecondary'} />
                                <Body fontSize={14} fontWeight="800" numberOfLines={1}>
                                    {tile.label}
                                </Body>
                            </YStack>
                        )
                    )}
                </XStack>
                {typeIsOther ? (
                    <BottomSheetSelect
                        value={type ?? undefined}
                        options={OTHER_TYPES.map((item) => ({ label: t(`me.issue.type.${item.value}`, { defaultValue: item.label }), value: item.value }))}
                        placeholder={t('issueCreate.typePlaceholder')}
                        onChange={(next) => chooseType(next as string)}
                        testID="select-type"
                    />
                ) : null}
            </YStack>

            {categories.length ? (
                <YStack gap={space[2]}>
                    <Question>{t('me.issue.whichPart')}</Question>
                    <BottomSheetSelect
                        value={category ?? undefined}
                        options={categories.map((item) => ({ label: t(`me.issue.category.${item.value}`, { defaultValue: item.label }), value: item.value }))}
                        placeholder={t('issueCreate.categoryPlaceholder')}
                        onChange={(next) => setCategory(next as string)}
                        testID="select-category"
                    />
                </YStack>
            ) : null}

            <YStack gap={space[2]}>
                <Question>{t('me.issue.howUrgent')}</Question>
                <XStack gap={space[2]} accessibilityRole="radiogroup" testID="priority-segments">
                    {PRIORITIES.map((level) => {
                        const on = priority === level;
                        const tone = priorityTone(level);
                        return (
                            <XStack
                                key={level}
                                flex={1}
                                height={52}
                                alignItems="center"
                                justifyContent="center"
                                gap={6}
                                borderRadius={14}
                                borderWidth={on ? 1.5 : 1}
                                borderColor={on ? tone.text : '$border'}
                                backgroundColor={on ? tone.fill : '$surface'}
                                onPress={() => setPriority(level)}
                                pressStyle={{ opacity: 0.7 }}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                testID={`priority-${level}`}
                            >
                                {/* The mark is always there, so the levels differ by shape before anything is picked. */}
                                <PriorityMark priority={level} size={9} />
                                <Body fontSize={14} fontWeight="800" color={on ? tone.text : '$textPrimary'} numberOfLines={1} adjustsFontSizeToFit>
                                    {t(`me.issue.priority.${level}`)}
                                </Body>
                            </XStack>
                        );
                    })}
                </XStack>
            </YStack>

            <Field
                label={t('me.issue.whatHappened')}
                value={report}
                onChangeText={setReport}
                multiline
                placeholder={t('issueCreate.reportPlaceholder')}
                hint={t('issueCreate.reportHint')}
                testID="input-report"
            />

            <XStack gap={space[2]} alignItems="stretch">
                {/* Photos need the issue's id, which only a sent report has. */}
                {isOnline ? (
                    <YStack
                        width={96}
                        minHeight={96}
                        alignItems="center"
                        justifyContent="center"
                        gap={6}
                        borderRadius={16}
                        borderWidth={1.5}
                        borderStyle="dashed"
                        borderColor="$textMuted"
                        opacity={photos.length >= MAX_PHOTOS ? 0.5 : 1}
                        onPress={photos.length >= MAX_PHOTOS ? undefined : () => setCamera((open) => !open)}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('me.issue.addPhoto')}
                        testID="issue-add-photo"
                    >
                        <Icon name="camera" size={22} color="textPrimary" />
                        <Body fontSize={13} fontWeight="800" center numberOfLines={1}>
                            {photos.length ? t('me.issue.photoCount', { count: photos.length }) : t('me.issue.addPhoto')}
                        </Body>
                    </YStack>
                ) : null}
                <Tile justifyContent="center" gap={4} paddingHorizontal={14} testID="location-note">
                    <SectionLabel>{t('me.issue.sentWithIt')}</SectionLabel>
                    {vehicleName ? (
                        <Body fontSize={14} fontWeight="700" numberOfLines={1}>
                            {vehicleName}
                        </Body>
                    ) : null}
                    {hasFix ? (
                        <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable>
                            {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}
                        </Body>
                    ) : (
                        <Secondary fontSize={13}>{t('issueCreate.noLocationAttached')}</Secondary>
                    )}
                    {!isOnline ? <Secondary fontSize={12}>{t('me.issue.photosNeedSignal')}</Secondary> : null}
                </Tile>
            </XStack>

            {photos.length ? <SmallButton alignSelf="flex-start" label={t('me.issue.removePhotos')} onPress={() => setPhotos([])} testID="issue-remove-photos" /> : null}

            {camera
                ? (() => {
                      const Camera = lazyCamera();
                      return (
                          <Camera
                              onDone={(taken) => {
                                  setPhotos((prev) => [...prev, ...taken.map((p) => p.base64 ?? '').filter(Boolean)].slice(0, MAX_PHOTOS));
                                  setCamera(false);
                              }}
                          />
                      );
                  })()
                : null}

            {queued ? <Banner tone="neutral" message={photos.length ? t('me.issue.queuedWithoutPhotos') : t('issueCreate.queued')} testID="issue-queued" /> : null}
            {error ? <ErrorState title={t('issueCreate.saveFailed')} body={error} testID="issue-create-error" /> : null}
        </Screen>
    );
}

export default IssueCreateScreen;
