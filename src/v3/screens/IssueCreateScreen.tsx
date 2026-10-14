/**
 * Report an issue — R1 frame s10.
 *
 * `POST /v1/issues` **requires** a location, so this screen cannot pretend
 * otherwise: with no fix it disables filing and says why, rather than letting a
 * driver write out a report and then bounce off server validation. That is the
 * one case where a missing capability has to be surfaced before the work, not
 * after it.
 *
 * Category depends on type, exactly as the org's own taxonomy defines it in
 * `src/constants/IssueCategory` — picking a type narrows the categories rather
 * than offering all forty at once.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Caption, Micro } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Field, Segmented } from '../ui/Field';
import { BottomSheetSelect } from '../ui';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import { useCreateIssue, type IssueRecord } from '../data';

/**
 * The organisation's taxonomy, from the v2 constants so the two agree. Shared
 * rather than forked — this is data, not presentation.
 */
import { IssueType } from '../../constants/Enums';
import { getIssueCategories } from '../../constants/IssueCategory';
import { useScreenStyle } from '../ui/useScreenStyle';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
type Priority = (typeof PRIORITIES)[number];

const TYPE_KEYS = Object.keys(IssueType) as (keyof typeof IssueType)[];

export function IssueCreateScreen({
    driverId,
    onDone,
}: {
    driverId?: string;
    onDone?: (created: IssueRecord | null) => void;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const coordinates = useDeviceLocation();
    const { create, isSaving, queued, error } = useCreateIssue(driverId);

    const [typeKey, setTypeKey] = useState<keyof typeof IssueType | null>(null);
    const [category, setCategory] = useState<string | null>(null);
    const [priority, setPriority] = useState<Priority>('Medium');
    const [report, setReport] = useState('');

    const categories = useMemo(() => (typeKey ? getIssueCategories(typeKey) : []), [typeKey]);

    const hasFix = !!coordinates;
    const canSave = hasFix && report.trim().length >= 3;

    const save = useCallback(async () => {
        const point = toGeoPoint(coordinates);
        if (!point) return;
        const created = await create({
            report,
            type: typeKey ? IssueType[typeKey] : undefined,
            category: category ?? undefined,
            priority,
            location: point,
        });
        if (created) onDone?.(created);
    }, [coordinates, create, report, typeKey, category, priority, onDone]);

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="issue-create">
            {!isOnline ? <Banner tone="neutral" message={t('issueCreate.offlineNotice')} testID="issue-create-offline" /> : null}

            {/* Said before the work, not after a rejected submit. */}
            {!hasFix ? (
                <YStack gap={space[2]} testID="needs-location">
                    <Banner tone="warning" message={t('issueCreate.needsLocation')} />
                    <Micro tone="warning">{t('issueCreate.needsLocationHint')}</Micro>
                </YStack>
            ) : null}

            <Surface padded>
                <YStack gap={space[4]}>
                    <YStack gap={space[2]}>
                        <Caption>{t('issueCreate.type')}</Caption>
                        <BottomSheetSelect
                            value={typeKey ?? undefined}
                            options={TYPE_KEYS.map((key) => ({ label: IssueType[key], value: key }))}
                            placeholder={t('issueCreate.typePlaceholder')}
                            onChange={(next) => {
                                setTypeKey(next as keyof typeof IssueType);
                                // The old category rarely belongs to the new type.
                                setCategory(null);
                            }}
                            testID="select-type"
                        />
                    </YStack>

                    {categories.length ? (
                        <YStack gap={space[2]}>
                            <Caption>{t('issueCreate.category')}</Caption>
                            <BottomSheetSelect
                                value={category ?? undefined}
                                options={categories.map((c: string) => ({ label: c, value: c }))}
                                placeholder={t('issueCreate.categoryPlaceholder')}
                                onChange={(next) => setCategory(next as string)}
                                testID="select-category"
                            />
                        </YStack>
                    ) : null}

                    <YStack gap={space[2]}>
                        <Caption>{t('issueCreate.priority')}</Caption>
                        <Segmented
                            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
                            value={priority}
                            onChange={setPriority}
                            testID="priority-segments"
                        />
                    </YStack>

                    <Field
                        label={t('issueCreate.report')}
                        value={report}
                        onChangeText={setReport}
                        multiline
                        placeholder={t('issueCreate.reportPlaceholder')}
                        hint={t('issueCreate.reportHint')}
                        testID="input-report"
                    />
                </YStack>
            </Surface>

            {queued ? <Banner tone="neutral" message={t('issueCreate.queued')} testID="issue-queued" /> : null}
            {error ? <ErrorState title={t('issueCreate.saveFailed')} body={error} testID="issue-create-error" /> : null}

            <Micro testID="location-note">
                {hasFix
                    ? t('issueCreate.locationAttached', {
                          latitude: coordinates.latitude.toFixed(4),
                          longitude: coordinates.longitude.toFixed(4),
                      })
                    : t('issueCreate.noLocationAttached')}
            </Micro>

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={() => onDone?.(null)} testID="issue-cancel">
                    {t('common.cancel')}
                </Button>
                <Button flex={2} disabled={!canSave} loading={isSaving} onPress={save} testID="issue-save">
                    {t('issueCreate.save')}
                </Button>
            </XStack>
        </ScrollView>
    );
}

export default IssueCreateScreen;
