/**
 * Inspections hub — R2 frames E4 (history) and the entry to E3a, with the E2
 * inspection-required gate folded in as a banner when arriving from a
 * vehicle swap.
 *
 * Three honest states an instance can be in: the feature is not enabled on
 * the server (404 on the list) — the not-enabled body, not an error; no
 * vehicle assigned — nothing to inspect; forms published — the checks for
 * this vehicle, any draft in progress to resume, and the history below.
 */
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { Segmented } from '../ui/Field';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { chevron } from '../i18n/direction';
import { useSync } from '../shell';
import {
    useInspectionForms,
    useInspectionHistory,
    useInspectionDrafts,
    usePendingInspections,
    draftProgress,
    fieldsOf,
    type InspectionFormRecord,
    type InspectionSubmissionRecord,
} from '../data';
import { formatDateTime } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';

export interface InspectionScreenProps {
    driverId?: string;
    vehicleId?: string;
    vehicleName?: string;
    /** Arrived from Change vehicle: the E2 gate banner. */
    afterSwap?: boolean;
    reloadToken?: number;
    onStart?: (form: InspectionFormRecord, vehicleId?: string) => void;
    onOpenSubmission?: (submission: InspectionSubmissionRecord) => void;
}

type Segment = 'all' | 'pre_trip' | 'post_trip' | 'defects';

function segmentOf(s: InspectionSubmissionRecord): Exclude<Segment, 'all' | 'defects'> | undefined {
    const type = String(s.type ?? '').toLowerCase();
    if (type === 'pre_trip') return 'pre_trip';
    if (type === 'post_trip') return 'post_trip';
    return undefined;
}

export function InspectionScreen({ driverId, vehicleId, vehicleName, afterSwap, reloadToken = 0, onStart, onOpenSubmission }: InspectionScreenProps) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const forms = useInspectionForms(vehicleId, reloadToken);
    const history = useInspectionHistory({ driver: driverId }, reloadToken);
    const drafts = useInspectionDrafts();
    const pending = usePendingInspections();
    const [segment, setSegment] = useState<Segment>('all');

    const segments = useMemo(
        () => [
            { value: 'all' as const, label: t('inspection.segmentAll') },
            { value: 'pre_trip' as const, label: t('inspection.segmentPreTrip') },
            { value: 'post_trip' as const, label: t('inspection.segmentPostTrip') },
            { value: 'defects' as const, label: t('inspection.segmentDefects') },
        ],
        [t]
    );

    const rows = useMemo(() => {
        const all = [...pending, ...history.submissions];
        return all.filter((s) => {
            if (segment === 'all') return true;
            if (segment === 'defects') return Boolean(s.has_failures) || Number(s.failed_items) > 0;
            return segmentOf(s) === segment;
        });
    }, [history.submissions, pending, segment]);

    const notEnabled = forms.notEnabled && (history.notEnabled || !history.submissions.length);

    return (
        <YStack flex={1} backgroundColor="$background" testID="inspection-hub">
            <ScrollView
                style={screen}
                contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: space[7] }}
                refreshControl={<RefreshControl refreshing={history.isRefreshing} onRefresh={history.refresh} />}
            >
                {afterSwap && !notEnabled ? (
                    <Banner tone="brand" message={t('inspection.afterSwapTitle')} meta={t('inspection.afterSwapBody')} testID="inspection-gate" />
                ) : null}

                {notEnabled ? (
                    <EmptyState title={t('notEnabled.title')} body={t('inspection.notEnabledBody')} testID="inspection-not-enabled" />
                ) : !vehicleId ? (
                    <EmptyState title={t('inspection.title')} body={t('inspection.noVehicle')} testID="inspection-no-vehicle" />
                ) : (
                    <YStack gap={space[2]}>
                        <XStack justifyContent="space-between" alignItems="baseline" paddingHorizontal={space[1]}>
                            <Caption>{t('inspection.dueTitle')}</Caption>
                            {vehicleName ? <Micro>{vehicleName}</Micro> : null}
                        </XStack>
                        {forms.isLoading ? (
                            <Skeleton height={72} />
                        ) : forms.failed && !forms.notEnabled ? (
                            <FailureState error={forms.error} isOnline={isOnline} onRetry={forms.retry} t={t} testID="inspection-forms-error" />
                        ) : forms.forms.length ? (
                            <Surface testID="inspection-forms">
                                {forms.forms.map((form, i) => {
                                    const draft = drafts.find((d) => d.formId === form.id && d.vehicleId === vehicleId);
                                    const progress = draft ? draftProgress(form, draft) : undefined;
                                    const kind = [
                                        form.type ? t(`inspection.type.${form.type}`, { defaultValue: String(form.type) }) : null,
                                        form.frequency ? t(`inspection.frequency.${form.frequency}`, { defaultValue: String(form.frequency) }) : null,
                                        t('inspection.itemCount', { count: fieldsOf(form).length || form.item_count || 0 }),
                                    ]
                                        .filter(Boolean)
                                        .join(' · ');
                                    return (
                                        <YStack key={form.id}>
                                            {i > 0 ? <Divider /> : null}
                                            <XStack padding={space[3]} gap={space[3]} alignItems="center" testID={`inspection-form-${form.id}`}>
                                                <YStack flex={1} gap={2} minWidth={0}>
                                                    <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                                                        {form.name ?? form.id}
                                                    </Body>
                                                    <Micro>{kind}</Micro>
                                                    {progress ? (
                                                        <Micro tone="brand" tabular testID={`inspection-draft-${form.id}`}>
                                                            {t('inspection.inProgress', { answered: progress.answered, total: progress.total })}
                                                        </Micro>
                                                    ) : null}
                                                </YStack>
                                                {onStart ? (
                                                    <Button variant={progress ? 'primary' : 'secondary'} height={40} paddingHorizontal={space[3]} onPress={() => onStart(form, vehicleId)} testID={`inspection-start-${form.id}`}>
                                                        {progress ? t('inspection.resume') : t('inspection.start')}
                                                    </Button>
                                                ) : null}
                                            </XStack>
                                        </YStack>
                                    );
                                })}
                            </Surface>
                        ) : (
                            <Secondary fontSize={13} testID="inspection-no-forms">{t('inspection.noForms')}</Secondary>
                        )}
                    </YStack>
                )}

                {!notEnabled ? (
                    <YStack gap={space[2]}>
                        <XStack justifyContent="space-between" alignItems="baseline" paddingHorizontal={space[1]}>
                            <Caption>{t('inspection.historyTitle')}</Caption>
                            <Micro tabular>{t('inspection.historyCount', { count: rows.length })}</Micro>
                        </XStack>
                        <Segmented options={segments} value={segment} onChange={setSegment} testID="inspection-segment" />
                        {history.isLoading ? (
                            <Skeleton height={140} />
                        ) : history.failed && !history.notEnabled && !history.submissions.length ? (
                            <FailureState error={history.error} isOnline={isOnline} onRetry={history.retry} t={t} testID="inspection-history-error" />
                        ) : rows.length ? (
                            <Surface testID="inspection-history">
                                {rows.map((s, i) => {
                                    const failures = Number(s.failed_items ?? 0) || 0;
                                    const unsafe = Boolean(s.meta?.unsafe);
                                    return (
                                        <YStack key={s.id}>
                                            {i > 0 ? <Divider /> : null}
                                            <XStack
                                                padding={space[3]}
                                                gap={space[3]}
                                                alignItems="center"
                                                onPress={onOpenSubmission ? () => onOpenSubmission(s) : undefined}
                                                pressStyle={onOpenSubmission ? { opacity: 0.7 } : undefined}
                                                accessibilityRole={onOpenSubmission ? 'button' : 'text'}
                                                testID={`inspection-row-${s.id}`}
                                            >
                                                <YStack flex={1} gap={space[1]} minWidth={0}>
                                                    <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                                                        {s.queued ? (
                                                            <Micro tone="brand">{t('inspection.queuedShort')}</Micro>
                                                        ) : (
                                                            <Identifier value={s.id} boxed={false} />
                                                        )}
                                                        <StatusPill
                                                            status={failures > 0 || s.has_failures ? 'failed' : 'completed'}
                                                            label={failures > 0 || s.has_failures ? t('inspection.resultDefects', { count: failures || 1 }) : t('inspection.resultPassed')}
                                                            size="sm"
                                                        />
                                                    </XStack>
                                                    <Micro tabular>
                                                        {[formatDateTime(s.submitted_at ?? s.created_at as string), s.type ? t(`inspection.type.${s.type}`, { defaultValue: String(s.type) }) : null, s.vehicle_name ?? s.vehicle?.name]
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </Micro>
                                                    {unsafe ? (
                                                        <Micro tone="danger" testID={`inspection-unsafe-${s.id}`}>
                                                            {t('inspection.unsafeShort')}
                                                        </Micro>
                                                    ) : null}
                                                </YStack>
                                                {onOpenSubmission ? <Secondary fontSize={17}>{chevron()}</Secondary> : null}
                                            </XStack>
                                        </YStack>
                                    );
                                })}
                            </Surface>
                        ) : (
                            <EmptyState title={t('inspection.historyEmptyTitle')} body={t('inspection.historyEmptyBody')} testID="inspection-history-empty" />
                        )}
                    </YStack>
                ) : null}
            </ScrollView>

            {!notEnabled && vehicleId && forms.forms.length === 1 && onStart ? (
                <YStack padding={space[4]} borderTopWidth={1} borderColor="$border" backgroundColor="$surface">
                    <Button onPress={() => onStart(forms.forms[0], vehicleId)} testID="inspection-start-primary">
                        {drafts.some((d) => d.formId === forms.forms[0].id && d.vehicleId === vehicleId) ? t('inspection.resume') : t('inspection.startNew')}
                    </Button>
                </YStack>
            ) : null}
        </YStack>
    );
}

export default InspectionScreen;
