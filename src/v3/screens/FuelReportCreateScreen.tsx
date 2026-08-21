/**
 * Log a fill — the create half of R1 frame s09.
 *
 * The frame asks for odometer, volume + unit, cost + currency, fuel type,
 * station with location autofill, and a receipt photo. Only the first three
 * survive contact with the driver-facing API: `type` is accepted and silently
 * discarded (a create sending "diesel" returns `type: null`), there is no
 * station column at all, and the resource carries no receipt association. Those
 * three are omitted rather than collected and dropped — see FuelLogScreen.
 *
 * Location *is* storable, so the pump's coordinates stand in for the station.
 *
 * The write goes through the adapter, so a fill logged at a pump with no signal
 * is queued with its idempotency key and replayed, rather than lost.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Field, FieldAccessory, Segmented } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings } from '../settings';
import { useSync } from '../shell';
import { useCreateFuelReport, computeEconomy, formatEconomy, type FuelReportRecord } from '../data';

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
    onDone,
}: {
    driverId?: string;
    /** The previous fill on this vehicle — powers the live economy preview. */
    lastReport?: FuelReportRecord | null;
    currency?: string;
    location?: { type: 'Point'; coordinates: [number, number] } | null;
    onDone?: (created: FuelReportRecord | null) => void;
}) {
    const { t } = useTranslation();
    const { units } = useSettings();
    const { isOnline } = useSync();
    const { create, isSaving, queued, error } = useCreateFuelReport(driverId);

    const [odometer, setOdometer] = useState('');
    const [volume, setVolume] = useState('');
    const [amount, setAmount] = useState('');
    const [unit, setUnit] = useState<VolumeUnit>(units === 'imperial' ? 'gal' : 'L');
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const lastOdometer = Number(lastReport?.odometer ?? NaN);

    const odometerError = useMemo(() => {
        if (!touched.odometer || !odometer) return undefined;
        if (!isDecimal(odometer)) return t('fuelCreate.odometerInvalid');
        // A reading below the last one is a typo far more often than a swap.
        if (Number.isFinite(lastOdometer) && Number(odometer) < lastOdometer) {
            return t('fuelCreate.odometerBehind', { last: lastOdometer.toLocaleString() });
        }
        return undefined;
    }, [odometer, touched.odometer, lastOdometer, t]);

    const volumeError = touched.volume && volume && !isDecimal(volume) ? t('fuelCreate.volumeInvalid') : undefined;
    const amountError = touched.amount && amount && !isDecimal(amount) ? t('fuelCreate.amountInvalid') : undefined;

    /** Shown before saving so a mistyped odometer is obvious at the pump. */
    const preview = useMemo(() => {
        if (!isDecimal(odometer) || !isDecimal(volume)) return undefined;
        return formatEconomy(
            computeEconomy(lastReport, {
                id: 'preview',
                odometer,
                volume,
                metric_unit: unit,
            })
        );
    }, [odometer, volume, unit, lastReport]);

    const complete = isDecimal(odometer) && isDecimal(volume);
    const canSave = complete && !odometerError && !volumeError && !amountError;

    const save = useCallback(async () => {
        const created = await create({
            odometer: odometer.trim(),
            volume: volume.trim(),
            metricUnit: unit,
            amount: isDecimal(amount) ? amount.trim() : undefined,
            currency,
            location,
        });
        // A queued write has no record yet; the screen says so and stays put.
        if (created) onDone?.(created);
    }, [create, odometer, volume, unit, amount, currency, location, onDone]);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="fuel-create">
            {!isOnline ? <Banner tone="neutral" message={t('fuelCreate.offlineNotice')} testID="create-offline" /> : null}

            <Surface padded>
                <YStack gap={space[4]}>
                    <Field
                        label={t('fuelCreate.odometer')}
                        value={odometer}
                        onChangeText={setOdometer}
                        onBlur={() => setTouched((s) => ({ ...s, odometer: true }))}
                        keyboardType="numeric"
                        tabular
                        error={odometerError}
                        hint={
                            Number.isFinite(lastOdometer)
                                ? t('fuelCreate.lastOdometer', { last: lastOdometer.toLocaleString() })
                                : undefined
                        }
                        accessory={<FieldAccessory label={units === 'imperial' ? 'mi' : 'km'} />}
                        testID="input-odometer"
                    />

                    <YStack gap={space[2]}>
                        <Caption>{t('fuelCreate.unit')}</Caption>
                        <Segmented
                            options={VOLUME_UNITS.map((u) => ({ value: u, label: u }))}
                            value={unit}
                            onChange={setUnit}
                            testID="unit-segments"
                        />
                    </YStack>

                    <Field
                        label={t('fuelCreate.volume')}
                        value={volume}
                        onChangeText={setVolume}
                        onBlur={() => setTouched((s) => ({ ...s, volume: true }))}
                        keyboardType="decimal-pad"
                        tabular
                        error={volumeError}
                        accessory={<FieldAccessory label={unit} />}
                        testID="input-volume"
                    />

                    <Field
                        label={t('fuelCreate.amount')}
                        value={amount}
                        onChangeText={setAmount}
                        onBlur={() => setTouched((s) => ({ ...s, amount: true }))}
                        keyboardType="decimal-pad"
                        tabular
                        error={amountError}
                        hint={t('fuelCreate.amountOptional')}
                        accessory={<FieldAccessory label={currency} />}
                        testID="input-amount"
                    />
                </YStack>
            </Surface>

            {preview ? (
                <Surface padded="compact" testID="economy-preview">
                    <XStack justifyContent="space-between" alignItems="center">
                        <Body fontSize={14}>{t('fuelCreate.economyPreview')}</Body>
                        <Body fontSize={16} fontWeight="800" tabular tone="brand">
                            {preview}
                        </Body>
                    </XStack>
                </Surface>
            ) : null}

            <Micro testID="unsupported-note">{t('fuelCreate.unsupportedFields')}</Micro>

            {queued ? <Banner tone="neutral" message={t('fuelCreate.queued')} testID="create-queued" /> : null}
            {error ? <ErrorState title={t('fuelCreate.saveFailed')} body={error} testID="create-error" /> : null}

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={() => onDone?.(null)} testID="create-cancel">
                    {t('common.cancel')}
                </Button>
                <Button flex={2} disabled={!canSave} loading={isSaving} onPress={save} testID="create-save">
                    {t('fuelCreate.save')}
                </Button>
            </XStack>
        </ScrollView>
    );
}

export default FuelReportCreateScreen;
