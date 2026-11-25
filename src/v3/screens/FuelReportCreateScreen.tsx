/**
 * Log a fill-up — design round 3 (`Fuel.dc.html`).
 *
 * How much went in, what it cost, and what the odometer says. The economy for
 * the tank and the price per litre are worked out as the driver types, so a
 * slipped digit shows up at the pump rather than in a report a week later.
 *
 * `POST /v1/fuel-reports` keeps exactly: odometer, volume, metric_unit, amount,
 * currency, status and location (FuelReportController@create). So three things
 * in the mockup are not here:
 *
 *   - **"Snap the receipt."** FuelReport has no files relation and nothing
 *     reads a receipt, so there is nowhere for the photo to go.
 *   - **The station** ("Shell Wareham, found from where you are"). No column
 *     for it. The pump's *coordinates* are storable, so those are sent instead
 *     and shown for what they are.
 *   - **Fuel type.** `type` is accepted and silently discarded.
 *
 * The write goes through the adapter, so a fill logged at a pump with no signal
 * is queued with its idempotency key and replayed, rather than lost.
 */
import { useCallback, useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Field, FieldAccessory } from '../ui/Field';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync, useDeviceLocation, toGeoPoint } from '../shell';
import { useSettings } from '../settings';
import { useCreateFuelReport, computeEconomy, type FuelReportRecord } from '../data';
import { formatDay, formatMoney, formatNumber } from '../format';
import { BigButton } from '../onboarding/AuthScaffold';
import { Card, Icon, Screen, Tile } from './me/parts';
import { economyLabel } from './me/fuelSummary';

const VOLUME_UNITS = ['L', 'gal'] as const;
type VolumeUnit = (typeof VOLUME_UNITS)[number];

/** Digits with at most one separator — rejects "1.2.3" and stray letters. */
function isDecimal(value: string): boolean {
    return /^\d+(\.\d+)?$/.test(value.trim());
}

export function FuelReportCreateScreen({
    driverId,
    lastReport,
    currency = 'USD',
    location,
    vehicleName,
    plate,
    onDone,
}: {
    driverId?: string;
    /** The previous fill on this vehicle — powers the live economy preview. */
    lastReport?: FuelReportRecord | null;
    currency?: string;
    /** Overrides the device's own fix; tests pass one. */
    location?: { type: 'Point'; coordinates: [number, number] } | null;
    /** The vehicle the server will file this against: the driver's assigned one. */
    vehicleName?: string;
    plate?: string | null;
    onDone?: (created: FuelReportRecord | null) => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const coordinates = useDeviceLocation();
    const { create, isSaving, queued, error } = useCreateFuelReport(driverId);

    const [odometer, setOdometer] = useState('');
    const [volume, setVolume] = useState('');
    const [amount, setAmount] = useState('');
    const [unit, setUnit] = useState<VolumeUnit>(units === 'imperial' ? 'gal' : 'L');
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    // Where the pump is. The server keeps a point, so the phone's fix is sent with the report.
    const point = location ?? (toGeoPoint(coordinates) as { type: 'Point'; coordinates: [number, number] } | null);
    const lastOdometer = Number(lastReport?.odometer ?? NaN);
    const distanceUnit = units === 'imperial' ? 'mi' : 'km';

    const odometerError = useMemo(() => {
        if (!touched.odometer || !odometer) return undefined;
        if (!isDecimal(odometer)) return t('fuelCreate.odometerInvalid');
        // A reading below the last one is a typo far more often than a swap.
        if (Number.isFinite(lastOdometer) && Number(odometer) < lastOdometer) {
            return t('fuelCreate.odometerBehind', { last: formatNumber(lastOdometer) });
        }
        return undefined;
    }, [odometer, touched.odometer, lastOdometer, t]);

    const volumeError = touched.volume && volume && !isDecimal(volume) ? t('fuelCreate.volumeInvalid') : undefined;
    const amountError = touched.amount && amount && !isDecimal(amount) ? t('fuelCreate.amountInvalid') : undefined;

    /** Under the odometer: how far since the last fill, once a reading is in; the last reading until then. */
    const odometerHint = useMemo(() => {
        if (!Number.isFinite(lastOdometer)) return undefined;
        const since = isDecimal(odometer) ? Number(odometer) - lastOdometer : NaN;
        if (since > 0 && lastReport?.created_at) return t('me.fuel.sinceLast', { distance: formatNumber(Math.round(since)), unit: distanceUnit, date: formatDay(lastReport.created_at) });
        return t('fuelCreate.lastOdometer', { last: formatNumber(lastOdometer) });
    }, [odometer, lastOdometer, lastReport, distanceUnit, t]);

    /** Shown before saving so a mistyped odometer is obvious at the pump. */
    const preview = useMemo(() => {
        if (!isDecimal(odometer) || !isDecimal(volume)) return undefined;
        return economyLabel(computeEconomy(lastReport, { id: 'preview', odometer, volume, metric_unit: unit }));
    }, [odometer, volume, unit, lastReport]);

    /** Worked out here, in minor units per unit of volume; nothing is stored for it. */
    const pricePerUnit = isDecimal(amount) && isDecimal(volume) && Number(volume) > 0 ? formatMoney((Number(amount) * 100) / Number(volume), currency) : undefined;

    const complete = isDecimal(odometer) && isDecimal(volume);
    const canSave = complete && !odometerError && !volumeError && !amountError;

    const save = useCallback(async () => {
        const created = await create({
            odometer: odometer.trim(),
            volume: volume.trim(),
            metricUnit: unit,
            amount: isDecimal(amount) ? amount.trim() : undefined,
            currency,
            location: point,
        });
        // A queued write has no record yet; the screen says so and stays put.
        if (created) onDone?.(created);
    }, [create, odometer, volume, unit, amount, currency, point, onDone]);

    return (
        <Screen
            gap={14}
            testID="fuel-create"
            footer={
                <BigButton disabled={!canSave} loading={isSaving} onPress={save} testID="create-save">
                    {t('me.fuel.save')}
                </BigButton>
            }
        >
            {vehicleName || plate ? (
                <XStack alignItems="center" gap={space[2]} flexWrap="wrap" testID="fuel-create-vehicle">
                    {vehicleName ? <Secondary fontSize={14}>{vehicleName}</Secondary> : null}
                    {plate ? (
                        <Body fontFamily="$mono" fontSize={14} fontWeight="500" tone="secondary">
                            {plate}
                        </Body>
                    ) : null}
                </XStack>
            ) : null}

            {!isOnline ? <Banner tone="neutral" message={t('me.offlineWillSend')} testID="create-offline" /> : null}

            <XStack gap={space[2]} alignItems="flex-start">
                <YStack flex={1}>
                    <Field
                        label={t('me.fuel.fuel')}
                        value={volume}
                        onChangeText={setVolume}
                        onBlur={() => setTouched((s) => ({ ...s, volume: true }))}
                        keyboardType="decimal-pad"
                        tabular
                        error={volumeError}
                        // Tapping the unit swaps litres for gallons.
                        accessory={<FieldAccessory label={unit} onPress={() => setUnit((u) => (u === 'L' ? 'gal' : 'L'))} testID="unit-segments" />}
                        testID="input-volume"
                    />
                </YStack>
                <YStack flex={1}>
                    <Field
                        label={t('me.fuel.totalPaid')}
                        value={amount}
                        onChangeText={setAmount}
                        onBlur={() => setTouched((s) => ({ ...s, amount: true }))}
                        keyboardType="decimal-pad"
                        tabular
                        error={amountError}
                        hint={t('me.fuel.paidOptional')}
                        accessory={<FieldAccessory label={currency} />}
                        testID="input-amount"
                    />
                </YStack>
            </XStack>

            <Field
                label={t('fuelCreate.odometer')}
                value={odometer}
                onChangeText={setOdometer}
                onBlur={() => setTouched((s) => ({ ...s, odometer: true }))}
                keyboardType="numeric"
                tabular
                error={odometerError}
                hint={odometerHint}
                accessory={<FieldAccessory label={distanceUnit} />}
                testID="input-odometer"
            />

            {point ? (
                <Card flexDirection="row" alignItems="center" gap={space[3]} testID="fuel-create-location">
                    <Icon name="pin" size={20} color="successText" />
                    <YStack flex={1} gap={1}>
                        <Body fontSize={15} fontWeight="800">
                            {t('me.fuel.locationSaved')}
                        </Body>
                        <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable>
                            {point.coordinates[1].toFixed(5)}, {point.coordinates[0].toFixed(5)}
                        </Body>
                    </YStack>
                </Card>
            ) : null}

            {preview || pricePerUnit ? (
                <XStack gap={space[2]}>
                    {preview ? (
                        <Tile testID="economy-preview">
                            <Body fontSize={20} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                                {preview}
                            </Body>
                            <Secondary fontSize={12}>{t('me.fuel.thisTank')}</Secondary>
                        </Tile>
                    ) : null}
                    {pricePerUnit ? (
                        <Tile testID="price-preview">
                            <Body fontSize={20} fontWeight="800" tabular numberOfLines={1} adjustsFontSizeToFit>
                                {pricePerUnit}
                            </Body>
                            <Secondary fontSize={12}>{t('me.fuel.perUnit', { unit })}</Secondary>
                        </Tile>
                    ) : null}
                </XStack>
            ) : null}

            {queued ? <Banner tone="neutral" message={t('fuelCreate.queued')} testID="create-queued" /> : null}
            {error ? <ErrorState title={t('fuelCreate.saveFailed')} body={error} testID="create-error" /> : null}
        </Screen>
    );
}

export default FuelReportCreateScreen;
