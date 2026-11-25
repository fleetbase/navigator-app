/**
 * Fuel log — design round 3 (`FuelList.dc.html`).
 *
 * A summary of the month on top, the fill-ups under it, and the one action —
 * log another — anchored at the bottom.
 *
 * **The month's figures are worked out in the app** from the reports this
 * screen has loaded (see `me/fuelSummary.ts`). The server stores each fill-up
 * and nothing else: no totals, no averages, no economy. They cover this
 * driver's own fill-ups, newest fifty, which is what the list asks for.
 *
 * Four things the mockup shows have no home on the driver-facing API, so they
 * are absent rather than collected and discarded:
 *
 *   - **Station name** ("Shell Wareham"). There is no column for it anywhere
 *     on FuelReport. The row leads with the vehicle instead.
 *   - **Fuel type.** `type` is on the resource but not writable — a create that
 *     sends `"diesel"` returns `type: null`.
 *   - **Receipt photo.** FuelReport has no files relation.
 *   - **Fuel-card match.** `source`, `provider` and
 *     `fuel_provider_transaction_uuid` are all `isInternalRequest()`-gated.
 */
import { useCallback, useMemo } from 'react';
import { RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { FlatList } from '../ui/Scroll';
import { Body, Secondary } from '../ui/Text';
import { EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { currentLocale } from '../i18n';
import { useSync } from '../shell';
import { useSettings } from '../settings';
import { useFuelReports, formatVolume, formatOdometer, type Economy, type FuelReportRecord, type FuelRow } from '../data';
import { formatMoney, formatNumber } from '../format';
import { describeStatus } from '../theme/status';
import { useScreenStyle } from '../ui/useScreenStyle';
import { BigButton } from '../onboarding/AuthScaffold';
import { BottomBar, Card, CARD_PAD, Icon, SectionLabel, Tile } from './me/parts';
import { economyLabel, latestReport, monthKey, summariseMonth, type MonthSummary } from './me/fuelSummary';

/** Fuel reports a driver should notice the state of; the rest is noise on a row. */
const NOTABLE = new Set(['rejected', 'canceled', 'cancelled', 'approved', 'draft']);

function dayParts(iso?: string): { day: string; month: string } {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return { day: '—', month: '' };
    return { day: String(d.getDate()).padStart(2, '0'), month: d.toLocaleDateString(currentLocale(), { month: 'short' }).toUpperCase() };
}

function MonthCard({ summary, t }: { summary: MonthSummary; t: (key: string, options?: Record<string, unknown>) => string }) {
    const tallest = Math.max(...summary.volumes, 1);
    const monthName = summary.date.toLocaleDateString(currentLocale(), { month: 'long' });
    const economy = economyLabel(summary.economy);
    const price = summary.pricePerUnit != null && summary.currency && summary.volumeUnit ? `${formatMoney(summary.pricePerUnit, summary.currency)} / ${summary.volumeUnit}` : undefined;
    const headline = summary.amount != null && summary.currency ? formatMoney(summary.amount, summary.currency) : summary.volume != null ? `${formatNumber(summary.volume, { maximumFractionDigits: 1 })} ${summary.volumeUnit ?? ''}`.trim() : undefined;
    const volumeLine = summary.amount != null && summary.volume != null ? `${formatNumber(summary.volume, { maximumFractionDigits: 1 })} ${summary.volumeUnit ?? ''}`.trim() : undefined;

    return (
        <Card gap={14} testID="fuel-month">
            <XStack alignItems="flex-end" justifyContent="space-between" gap={space[3]}>
                <YStack gap={2} flex={1}>
                    <SectionLabel>{monthName}</SectionLabel>
                    {headline ? (
                        <Body fontSize={30} lineHeight={36} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit testID="fuel-month-total">
                            {headline}
                        </Body>
                    ) : null}
                    <Secondary fontSize={13} tabular>
                        {[volumeLine, t('me.fuel.fillCount', { count: summary.fills })].filter(Boolean).join(' · ')}
                    </Secondary>
                </YStack>
                {/* One bar per fill-up, oldest first; the newest is the one in the brand colour. */}
                {summary.volumes.length > 1 ? (
                    <XStack alignItems="flex-end" gap={6} height={64} accessible accessibilityRole="image" accessibilityLabel={t('me.fuel.barsLabel')}>
                        {summary.volumes.slice(-8).map((volume, i, shown) => (
                            <YStack key={i} width={14} height={Math.max(6, Math.round((volume / tallest) * 64))} borderRadius={4} backgroundColor={i === shown.length - 1 ? '$primary' : '$border'} />
                        ))}
                    </XStack>
                ) : null}
            </XStack>
            {economy || price ? (
                <XStack gap={space[2]}>
                    {economy ? (
                        <Tile testID="fuel-month-economy">
                            <Body fontSize={18} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                                {economy}
                            </Body>
                            <Secondary fontSize={12}>{t('me.fuel.averageThisMonth')}</Secondary>
                        </Tile>
                    ) : null}
                    {price ? (
                        <Tile testID="fuel-month-price">
                            <Body fontSize={18} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                                {price}
                            </Body>
                            <Secondary fontSize={12}>{t('me.fuel.averagePrice')}</Secondary>
                        </Tile>
                    ) : null}
                </XStack>
            ) : null}
        </Card>
    );
}

function FillRow({
    report,
    economy,
    first,
    last,
    onPress,
    t,
    units,
}: {
    report: FuelReportRecord;
    economy?: Economy;
    first: boolean;
    last: boolean;
    onPress?: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
    units: 'metric' | 'imperial';
}) {
    const { day, month } = dayParts(report.created_at);
    const economyText = economyLabel(economy);
    const status = String(report.status ?? '').toLowerCase();
    return (
        <XStack
            alignItems="center"
            gap={space[3]}
            minHeight={68}
            paddingVertical={10}
            paddingHorizontal={CARD_PAD}
            backgroundColor="$surface"
            borderColor="$border"
            borderLeftWidth={1}
            borderRightWidth={1}
            borderTopWidth={1}
            borderBottomWidth={last ? 1 : 0}
            borderTopLeftRadius={first ? 18 : 0}
            borderTopRightRadius={first ? 18 : 0}
            borderBottomLeftRadius={last ? 18 : 0}
            borderBottomRightRadius={last ? 18 : 0}
            onPress={onPress}
            pressStyle={onPress ? { backgroundColor: '$surfaceRaised' } : undefined}
            accessibilityRole={onPress ? 'button' : 'text'}
            testID={`fuel-${report.id}`}
        >
            <YStack width={44} height={44} borderRadius={12} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                <Body fontSize={16} lineHeight={18} fontWeight="800" tabular>
                    {day}
                </Body>
                <Body fontSize={10} lineHeight={12} fontWeight="800" letterSpacing={0.6} tone="secondary">
                    {month}
                </Body>
            </YStack>
            <YStack flex={1} gap={2} minWidth={0}>
                <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                    {report.vehicle?.name ?? t('fuelLog.noVehicle')}
                </Body>
                <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary">
                    {formatOdometer(report, units)}
                </Body>
                {economyText || NOTABLE.has(status) ? (
                    <XStack gap={space[2]} alignItems="center">
                        {economyText ? (
                            <Secondary fontSize={12} tone="brand" tabular testID={`economy-${report.id}`}>
                                {economyText}
                            </Secondary>
                        ) : null}
                        {NOTABLE.has(status) ? (
                            <Secondary fontSize={12} fontWeight="700" tone={status === 'rejected' || status.startsWith('cancel') ? 'danger' : 'secondary'} testID={`fuel-status-${report.id}`}>
                                {t(describeStatus(status).labelKey, { defaultValue: describeStatus(status).defaultLabel })}
                            </Secondary>
                        ) : null}
                    </XStack>
                ) : null}
            </YStack>
            <YStack alignItems="flex-end" gap={2}>
                {report.amount != null && report.amount !== '' ? (
                    <Body fontSize={16} fontWeight="800" tabular>
                        {formatMoney(report.amount, report.currency ?? 'USD')}
                    </Body>
                ) : null}
                <Secondary fontSize={13} tabular>
                    {formatVolume(report)}
                </Secondary>
            </YStack>
        </XStack>
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
    /** Gets the newest fill, so the form can check the odometer against it. */
    onCreate?: (context: { last?: FuelReportRecord }) => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const screen = useScreenStyle();
    const { rows, isLoading, isRefreshing, failed, error, refresh, retry, reports } = useFuelReports(driverId, reloadToken);

    // This month if there is anything in it, otherwise the month of the newest fill.
    const summary = useMemo(() => {
        const thisMonth = monthKey(new Date().toISOString());
        const newest = monthKey(rows[0]?.report.created_at);
        return (thisMonth && summariseMonth(rows, thisMonth)) || (newest ? summariseMonth(rows, newest) : undefined);
    }, [rows]);

    const create = useCallback(() => onCreate?.({ last: latestReport(reports) }), [onCreate, reports]);

    const renderItem = useCallback(
        ({ item, index }: { item: FuelRow; index: number }) => (
            <FillRow
                report={item.report}
                economy={item.economy}
                first={index === 0}
                last={index === rows.length - 1}
                units={units}
                t={t}
                onPress={onOpenReport ? () => onOpenReport({ report: item.report, previous: item.previous }) : undefined}
            />
        ),
        [onOpenReport, rows.length, t, units]
    );

    const action = onCreate ? (
        <BottomBar>
            <BigButton onPress={create} icon={<Icon name="plus" size={20} color="onPrimary" strokeWidth={2.8} />} testID="fuel-add">
                {t('me.fuel.log')}
            </BigButton>
        </BottomBar>
    ) : null;

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="fuel-loading">
                <Skeleton height={168} borderRadius={18} />
                <Skeleton height={68} borderRadius={18} />
                <Skeleton height={68} borderRadius={18} />
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
            <YStack flex={1} backgroundColor="$background" testID="fuel-error">
                <YStack flex={1} padding={space[4]} justifyContent="center">
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="fuel-error" />
                </YStack>
                {action}
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" testID="fuel-log">
            <FlatList
                style={screen}
                data={rows}
                keyExtractor={(r) => r.report.id}
                renderItem={renderItem}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingTop: space[1], paddingBottom: space[3] }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
                ListHeaderComponent={
                    rows.length ? (
                        <YStack gap={space[4]} paddingBottom={10}>
                            {summary ? <MonthCard summary={summary} t={t} /> : null}
                            <SectionLabel>{t('me.fuel.fillUps')}</SectionLabel>
                        </YStack>
                    ) : null
                }
                ListFooterComponent={
                    rows.some((row) => row.economy) ? (
                        <Secondary fontSize={12} paddingTop={space[3]} testID="fuel-economy-note">
                            {t('me.fuel.workedOutNote')}
                        </Secondary>
                    ) : null
                }
                ListEmptyComponent={
                    <YStack flex={1} justifyContent="center">
                        <EmptyState testID="fuel-empty" title={t('fuelLog.emptyTitle')} body={t('fuelLog.emptyBody')} />
                    </YStack>
                }
            />
            {action}
        </YStack>
    );
}

export default FuelLogScreen;
