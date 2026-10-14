/**
 * Fuel report detail — R2 frame F2.
 *
 * F2 lists five states: draft, submitted, approved, rejected-with-reason, and
 * matched-to-card. Three are renderable from the public resource's `status`.
 * The other two are not, and the screen says so instead of implying otherwise:
 *
 *   - **rejected-with-reason** — the status is visible, the reason is not.
 *     Rejection copy would live in `meta` or `report`, both of which the public
 *     resource wraps in `isInternalRequest()`.
 *   - **matched to card** — `source`, `provider` and
 *     `fuel_provider_transaction_uuid` are internal-only too, so a driver token
 *     cannot tell a card-matched report from a hand-entered one.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { ScrollView } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { formatVolume, formatOdometer, formatEconomy, computeEconomy, type FuelReportRecord } from '../data';
import { isRealPoint } from '../data/useOrderTimeline';
import { formatMoney, formatDateTime } from '../format';
import { useScreenStyle } from '../ui/useScreenStyle';
import { endAlign } from '../i18n/direction';

/** Rejection reasons are internal-only; the status alone is what we may show. */
const REJECTED = new Set(['rejected', 'canceled', 'cancelled']);

export function FuelReportScreen({
    report,
    previous,
}: {
    report: FuelReportRecord;
    /** The prior fill on the same vehicle, so economy can be shown here too. */
    previous?: FuelReportRecord | null;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { units } = useSettings();

    const economy = formatEconomy(computeEconomy(previous, report));
    const status = String(report.status ?? '').toLowerCase();
    const point = isRealPoint(report.location) ? (report.location!.coordinates as number[]) : undefined;

    const rows: { key: string; labelKey: string; value: string; mono?: boolean }[] = [
        { key: 'amount', labelKey: 'fuelReport.amount', value: formatMoney(report.amount, report.currency ?? 'USD'), mono: true },
        { key: 'volume', labelKey: 'fuelReport.volume', value: formatVolume(report), mono: true },
        { key: 'odometer', labelKey: 'fuelReport.odometer', value: formatOdometer(report, units), mono: true },
        { key: 'vehicle', labelKey: 'fuelReport.vehicle', value: report.vehicle?.name ?? t('fuelLog.noVehicle') },
    ];
    if (economy) rows.push({ key: 'economy', labelKey: 'fuelReport.economy', value: economy, mono: true });
    if (point) {
        rows.push({
            key: 'location',
            labelKey: 'fuelReport.location',
            value: `${point[1].toFixed(4)}, ${point[0].toFixed(4)}`,
            mono: true,
        });
    }

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="fuel-report">
            <Surface hero padded>
                <YStack gap={space[2]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Caption>{t('fuelReport.title')}</Caption>
                        <StatusPill status={report.status} t={(k, fb) => t(k, { defaultValue: fb })} testID="fuel-status" />
                    </XStack>
                    <Body fontSize={24} fontWeight="800" tabular>
                        {formatMoney(report.amount, report.currency ?? 'USD')}
                    </Body>
                    {report.created_at ? <Micro>{formatDateTime(report.created_at)}</Micro> : null}
                </YStack>
            </Surface>

            {REJECTED.has(status) ? (
                <Banner tone="danger" message={t('fuelReport.rejected')} meta={t('fuelReport.reasonUnavailable')} testID="fuel-rejected" />
            ) : null}

            <Surface testID="fuel-detail-rows">
                {rows.map((row, i) => (
                    <YStack key={row.key}>
                        {i > 0 ? <Divider /> : null}
                        <XStack padding={space[3]} justifyContent="space-between" alignItems="center" gap={space[3]} testID={`fuel-row-${row.key}`}>
                            <Caption>{t(row.labelKey)}</Caption>
                            <Body fontSize={15} tabular={row.mono} textAlign={endAlign()} flexShrink={1}>
                                {row.value}
                            </Body>
                        </XStack>
                    </YStack>
                ))}
            </Surface>

            {!economy ? <Micro testID="fuel-no-economy">{t('fuelReport.economyUnavailable')}</Micro> : null}

            <Secondary fontSize={12} tone="muted" testID="fuel-card-note">
                {t('fuelReport.cardMatchUnavailable')}
            </Secondary>
        </ScrollView>
    );
}

export default FuelReportScreen;
