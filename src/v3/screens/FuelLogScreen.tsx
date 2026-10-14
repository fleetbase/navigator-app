/**
 * Fuel log — R1 frame s09.
 *
 * Four of the frame's fields have no home on the driver-facing API, so the
 * screen shows what exists rather than collecting data the server discards:
 *
 *   - **Fuel type.** `type` is on the resource but not writable — a create that
 *     sends `"diesel"` returns `type: null`. The picker is therefore not built,
 *     rather than built and silently ineffective.
 *   - **Station name.** There is no column for it anywhere on FuelReport. The
 *     pump's *location* is storable, so that is captured instead.
 *   - **Receipt photo.** Not on the resource; needs the files association.
 *   - **Fuel-card match.** `source`, `provider` and
 *     `fuel_provider_transaction_uuid` are all `isInternalRequest()`-gated, so a
 *     driver token cannot see whether a report matched a card.
 *
 * Economy *is* delivered, derived client-side from consecutive odometer
 * readings on the same vehicle — see `computeEconomy`.
 */
import { useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { StatusPill } from '../ui/StatusPill';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { useSync } from '../shell';
import {
    useFuelReports,
    formatEconomy,
    formatVolume,
    formatOdometer,
    type Economy,
    type FuelReportRecord,
    type FuelRow,
} from '../data';
import { formatMoney, formatClock } from '../format';

function FuelRow({
    report,
    economy,
    onPress,
    t,
    units,
}: {
    report: FuelReportRecord;
    economy?: Economy;
    onPress?: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
    units: 'metric' | 'imperial';
}) {
    const economyLabel = formatEconomy(economy);

    return (
        <YStack
            padding={space[3]}
            gap={space[2]}
            onPress={onPress}
            pressStyle={onPress ? { opacity: 0.7 } : undefined}
            testID={`fuel-${report.id}`}
        >
            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Body fontSize={16} fontWeight="700" tabular>
                    {formatMoney(report.amount, report.currency ?? 'USD')}
                </Body>
                <StatusPill status={report.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} />
            </XStack>

            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Secondary fontSize={13} tabular>
                    {t('fuelLog.volumeAndOdometer', {
                        volume: formatVolume(report),
                        odometer: formatOdometer(report, units),
                    })}
                </Secondary>
                {economyLabel ? (
                    <Micro tone="brand" tabular testID={`economy-${report.id}`}>
                        {economyLabel}
                    </Micro>
                ) : null}
            </XStack>

            <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                <Micro>{report.vehicle?.name ?? t('fuelLog.noVehicle')}</Micro>
                <Micro tabular>{formatClock(report.created_at)}</Micro>
            </XStack>
        </YStack>
    );
}

export function FuelLogScreen({
    driverId,
    reloadToken,
    onOpenReport,
    onCreate,
}: {
    driverId?: string;
    /** Bumped by the navigator on focus, so a new fill shows on return. */
    reloadToken?: number;
    /** Carries the previous fill too, so detail can show economy without refetching. */
    onOpenReport?: (row: { report: FuelReportRecord; previous?: FuelReportRecord }) => void;
    onCreate?: () => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const { rows, isLoading, isRefreshing, failed, error, refresh, retry, reports } = useFuelReports(driverId, reloadToken);

    const renderItem = useCallback(
        ({ item }: { item: FuelRow }) => (
            <Surface marginBottom={space[3]}>
                <FuelRow
                    report={item.report}
                    economy={item.economy}
                    units={units}
                    t={t}
                    onPress={onOpenReport ? () => onOpenReport({ report: item.report, previous: item.previous }) : undefined}
                />
            </Surface>
        ),
        [onOpenReport, t, units]
    );

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="fuel-loading">
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
            </YStack>
        );
    }

    if (failed && !reports) {
        /*
         * A failed *read* must not take away an unrelated *write*. Filing this
         * is queueable — that is the whole point of the offline layer — and a
         * driver who cannot see the list is often exactly the one who needs to
         * record something now and let it send later.
         */
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[4]} justifyContent="center" testID="fuel-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="fuel-error" />
                {onCreate ? (
                    <Button fullWidth onPress={onCreate} testID="fuel-add">
                        {t('fuelLog.add')}
                    </Button>
                ) : null}
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="fuel-log">
            <YStack paddingHorizontal={space[4]} paddingTop={space[3]} gap={space[3]}>
                {onCreate ? (
                    <Button fullWidth onPress={onCreate} testID="fuel-add">
                        {t('fuelLog.add')}
                    </Button>
                ) : null}
            </YStack>

            <FlatList
                data={rows}
                keyExtractor={(r) => r.report.id}
                renderItem={renderItem}
                contentContainerStyle={rows.length ? { padding: space[4] } : { flexGrow: 1, padding: space[4] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListEmptyComponent={
                    <YStack flex={1} justifyContent="center">
                        <EmptyState
                            testID="fuel-empty"
                            title={t('fuelLog.emptyTitle')}
                            body={t('fuelLog.emptyBody')}
                            action={onCreate ? { label: t('fuelLog.add'), onPress: onCreate } : undefined}
                        />
                    </YStack>
                }
            />

            {rows.length ? (
                <YStack paddingHorizontal={space[4]} paddingBottom={space[3]}>
                    <Caption testID="fuel-economy-note">{t('fuelLog.economyNote')}</Caption>
                </YStack>
            ) : null}
        </YStack>
    );
}

export default FuelLogScreen;
