/**
 * One fill-up — R2 frame F2, in the round 3 look.
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
 *     cannot tell a card-matched report from a hand-entered one. Nothing is
 *     shown about it either way.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { StatusPill } from '../ui/StatusPill';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { formatVolume, formatOdometer, computeEconomy, type FuelReportRecord } from '../data';
import { isRealPoint } from '../data/useOrderTimeline';
import { formatMoney, formatDateTime } from '../format';
import { Card, FactRow, Screen, SectionLabel } from './me/parts';
import { economyLabel } from './me/fuelSummary';

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
    const { units } = useSettings();
    const economy = economyLabel(computeEconomy(previous, report));
    const status = String(report.status ?? '').toLowerCase();
    const point = isRealPoint(report.location) ? (report.location!.coordinates as number[]) : undefined;
    const hasAmount = report.amount != null && report.amount !== '';

    const rows: { key: string; labelKey: string; value: string; mono?: boolean }[] = [];
    if (hasAmount) rows.push({ key: 'amount', labelKey: 'fuelReport.amount', value: formatMoney(report.amount, report.currency ?? 'USD') });
    rows.push({ key: 'volume', labelKey: 'fuelReport.volume', value: formatVolume(report) });
    rows.push({ key: 'odometer', labelKey: 'fuelReport.odometer', value: formatOdometer(report, units), mono: true });
    rows.push({ key: 'vehicle', labelKey: 'fuelReport.vehicle', value: report.vehicle?.name ?? t('fuelLog.noVehicle') });
    if (economy) rows.push({ key: 'economy', labelKey: 'fuelReport.economy', value: economy });
    if (point) rows.push({ key: 'location', labelKey: 'fuelReport.location', value: `${point[1].toFixed(4)}, ${point[0].toFixed(4)}`, mono: true });

    return (
        <Screen testID="fuel-report">
            <Card gap={space[2]}>
                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                    <SectionLabel>{t('fuelReport.title')}</SectionLabel>
                    <StatusPill status={report.status} t={(k, fb) => t(k, { defaultValue: fb })} testID="fuel-status" />
                </XStack>
                <Body fontSize={30} lineHeight={36} fontWeight="800" tabular>
                    {hasAmount ? formatMoney(report.amount, report.currency ?? 'USD') : formatVolume(report)}
                </Body>
                {report.created_at ? (
                    <Secondary fontSize={13} tabular>
                        {formatDateTime(report.created_at)}
                    </Secondary>
                ) : null}
            </Card>

            {REJECTED.has(status) ? <Banner tone="danger" message={t('fuelReport.rejected')} meta={t('fuelReport.reasonUnavailable')} testID="fuel-rejected" /> : null}

            <Card flush testID="fuel-detail-rows">
                {rows.map((row, i) => (
                    <FactRow key={row.key} first={i === 0} label={t(row.labelKey)} value={row.value} mono={row.mono} testID={`fuel-row-${row.key}`} />
                ))}
            </Card>

            {!economy ? (
                <YStack>
                    <Secondary fontSize={13} testID="fuel-no-economy">
                        {t('fuelReport.economyUnavailable')}
                    </Secondary>
                </YStack>
            ) : null}
        </Screen>
    );
}

export default FuelReportScreen;
