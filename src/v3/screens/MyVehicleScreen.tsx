/**
 * My vehicle — design round 3 (`Vehicle.dc.html`).
 *
 * The vehicle's photograph leads when the organisation has uploaded one; a
 * vehicle without one gets no grey box in its place. Under it: what it is
 * called, what is on the plate, whether it passed its last check, how far it
 * has run, and the ways on from here — check it, log fuel, report a fault,
 * swap it.
 *
 * The resource carries about a hundred fields and a stock instance leaves most
 * of them null. This asks for the facts a driver uses and drops every one the
 * record does not have.
 *
 * What the mockup shows that the server cannot supply:
 *
 *   - **A gallery ("1 of 4").** A vehicle has one photo (`photo_uuid`).
 *   - **"400 km to next service."** Maintenance schedules exist in FleetOps but
 *     are not on the driver-facing API.
 *   - **"Safe to drive."** The server records whether the last inspection
 *     passed or failed, not a verdict on the vehicle, so the card says exactly
 *     that and no more.
 */
import { useState } from 'react';
import { Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Display, Secondary } from '../ui/Text';
import { StatusPill } from '../ui/StatusPill';
import { Skeleton, Banner } from '../ui/Banner';
import { Field, FieldAccessory } from '../ui/Field';
import { Button } from '../ui/Button';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useVehicleTrailers, trailerTitle, trainPositionOf, reeferRangeOf, type TrailerRecord } from '../data/useTrailers';
import { useSync } from '../shell';
import { useVehicle, useUpdateOdometer, odometerOf, vehicleTitle, vehicleFacts, vehiclePhotoOf, type VehicleRecord } from '../data/useVehicle';
import { useFuelReports } from '../data/useFuelReports';
import { useIssues } from '../data/useIssues';
import { useInspectionHistory, type InspectionSubmissionRecord } from '../data/useInspections';
import { formatClock, formatDateTime, formatDay, formatNumber } from '../format';
import { humanizeStatus } from '../theme/status';
import { ACTION_RADIUS, BigButton } from '../onboarding/AuthScaffold';
import { Card, Chevron, FactRow, Icon, MenuRow, Plate, Screen, Section, SmallButton, Stat } from './me/parts';
import { averageEconomy, economyLabel, latestReport, recentRows } from './me/fuelSummary';
import { isOpenIssue } from './me/issueTaxonomy';

const HERO_HEIGHT = 220;

/** Rows the driver has a use for, in the order they would look for them. */
function detailRows(vehicle: VehicleRecord, t: (k: string, o?: Record<string, unknown>) => string) {
    const rows: { key: string; label: string; value: string; mono?: boolean }[] = [];
    const push = (key: string, label: string, value?: unknown, mono?: boolean) => {
        if (value === null || value === undefined || value === '') return;
        rows.push({ key, label, value: String(value), mono });
    };

    push('vin', t('vehicle.vin'), vehicle.vin, true);
    push('serial', t('me.vehicle.serial'), vehicle.serial_number, true);
    push('internal', t('vehicle.internalId'), vehicle.internal_id, true);
    push('callSign', t('me.vehicle.callSign'), vehicle.call_sign, true);
    push('fuelCard', t('me.vehicle.fuelCard'), vehicle.fuel_card_number, true);
    push('colour', t('vehicle.colour'), vehicle.color);
    push('fuelType', t('vehicle.fuelType'), vehicle.fuel_type ? humanizeStatus(vehicle.fuel_type) : undefined);
    push(
        'fuelCapacity',
        t('vehicle.fuelCapacity'),
        vehicle.fuel_capacity ? `${vehicle.fuel_capacity}${vehicle.fuel_volume_unit ? ` ${vehicle.fuel_volume_unit}` : ''}` : undefined
    );
    push('transmission', t('me.vehicle.transmission'), vehicle.transmission ? humanizeStatus(vehicle.transmission) : undefined);
    push('seats', t('vehicle.seats'), vehicle.seating_capacity);
    /*
     * Payload comes back as "160.00" with no unit anywhere on the resource —
     * no `payload_capacity_unit`, and `measurement_system` is null too. A bare
     * number against "Payload" is not information: 160 kg and 160 lb are
     * different vehicles. Omitted until the server says which.
     */
    return rows;
}

/** Today's check reads as a time; an older one as a date. */
function whenChecked(iso: string | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string | undefined {
    if (!iso) return undefined;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return undefined;
    const today = new Date();
    const sameDay = at.getFullYear() === today.getFullYear() && at.getMonth() === today.getMonth() && at.getDate() === today.getDate();
    return sameDay ? t('me.vehicle.checkedToday', { time: formatClock(iso) }) : t('me.vehicle.checkedOn', { date: formatDay(iso) });
}

export function MyVehicleScreen({
    vehicleId,
    driverId,
    seed,
    reloadToken = 0,
    onChangeVehicle,
    onOpenTrailer,
    onInspect,
    onOpenInspection,
    onFuelLog,
    onIssues,
    onReportIssue,
}: {
    vehicleId?: string;
    /** Scopes the fuel and issue figures to this driver's own records. */
    driverId?: string;
    seed?: VehicleRecord | null;
    reloadToken?: number;
    onChangeVehicle?: () => void;
    /** Opens the trailer's read view; the row is passed so it paints at once. */
    onOpenTrailer?: (trailer: TrailerRecord) => void;
    onInspect?: () => void;
    onOpenInspection?: (submission: InspectionSubmissionRecord) => void;
    onFuelLog?: () => void;
    onIssues?: () => void;
    onReportIssue?: () => void;
}) {
    const trailers = useVehicleTrailers(vehicleId, reloadToken);
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { vehicle, isLoading, error, reload } = useVehicle(vehicleId, seed, reloadToken);
    const fuel = useFuelReports(vehicleId ? driverId : undefined, reloadToken);
    const { issues } = useIssues(vehicleId ? driverId : undefined, reloadToken);
    const inspections = useInspectionHistory({ vehicle: vehicleId }, reloadToken);
    const odometerUpdate = useUpdateOdometer(vehicleId);
    const [editingOdometer, setEditingOdometer] = useState(false);
    const [reading, setReading] = useState('');

    if (!vehicleId) {
        /*
         * No vehicle assigned is precisely the state in which a driver wants to
         * pick one — the early return used to end here, leaving them told they
         * had no vehicle and given no way to get one.
         */
        return (
            <Screen
                testID="vehicle-none"
                footer={
                    onChangeVehicle ? (
                        <BigButton onPress={onChangeVehicle} testID="vehicle-change">
                            {t('me.vehicle.choose')}
                        </BigButton>
                    ) : undefined
                }
            >
                <YStack flex={1} justifyContent="center" alignItems="center" gap={space[3]} paddingVertical={space[6]}>
                    <YStack width={72} height={72} borderRadius={24} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                        <Icon name="vehicle" size={34} />
                    </YStack>
                    <Body fontSize={18} fontWeight="800" center testID="vehicle-none-banner">
                        {t('vehicle.noneAssigned')}
                    </Body>
                </YStack>
            </Screen>
        );
    }

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="vehicle-loading">
                <Skeleton height={HERO_HEIGHT} borderRadius={18} />
                <Skeleton height={72} borderRadius={18} />
                <Skeleton height={200} borderRadius={18} />
            </YStack>
        );
    }

    if (!vehicle) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="vehicle-error">
                <FailureState error={error as never} isOnline={isOnline} onRetry={reload} t={t} testID="vehicle-error" />
            </YStack>
        );
    }

    const title = vehicleTitle(vehicle);
    const name = vehicle.name ?? title ?? t('vehicle.unnamed');
    const facts = vehicleFacts(vehicle);
    const photo = vehiclePhotoOf(vehicle);
    const odometer = odometerOf(vehicle);
    const unit = vehicle.odometer_unit ?? 'km';
    const rows = detailRows(vehicle, t);

    // Fuel and issues are this driver's own records for this vehicle: the
    // lists are driver-scoped, so a colleague's fill-ups are not in them.
    const vehicleRows = fuel.rows.filter((row) => row.report.vehicle?.id === vehicleId);
    const economy = economyLabel(averageEconomy(recentRows(vehicleRows, 30)));
    const lastFill = latestReport(fuel.reports, vehicleId);
    const openIssues = (issues ?? []).filter((issue) => isOpenIssue(issue) && (!issue.vehicle_id || issue.vehicle_id === vehicleId)).length;

    // The newest submission the server has for this vehicle, by any driver.
    const lastCheck = inspections.submissions[0];
    const checkFailed = lastCheck?.result === 'failed' || lastCheck?.has_failures === true;
    const checkedWhen = whenChecked(lastCheck?.submitted_at, t);
    const defects = Number(lastCheck?.failed_items ?? 0);

    const saveReading = async () => {
        const value = Number(reading.replace(/[\s,]/g, ''));
        const saved = await odometerUpdate.save(value);
        if (saved) {
            setEditingOdometer(false);
            setReading('');
            void reload();
        }
    };
    const readingValid = /^\d[\d\s,]*(\.\d+)?$/.test(reading.trim());

    return (
        <Screen testID="my-vehicle">
            {photo ? (
                // Full bleed: the gutter is taken back so the photograph runs edge to edge.
                <YStack marginHorizontal={-space[4]} marginTop={-space[1]} height={HERO_HEIGHT} backgroundColor="$surfaceRaised" testID="vehicle-hero">
                    <Image source={{ uri: photo }} style={{ width: '100%', height: HERO_HEIGHT }} resizeMode="cover" accessibilityLabel={t('me.vehicle.photoOf', { name })} accessibilityIgnoresInvertColors />
                    {vehicle.plate_number ? (
                        <YStack position="absolute" left={space[4]} bottom={space[4]}>
                            <Plate value={vehicle.plate_number} size="lg" testID="vehicle-row-plate" />
                        </YStack>
                    ) : null}
                </YStack>
            ) : null}

            <YStack gap={space[2]} testID="vehicle-identity">
                <XStack alignItems="flex-start" justifyContent="space-between" gap={space[3]}>
                    <Display flex={1} fontSize={28} lineHeight={32} fontWeight="800" letterSpacing={-0.5}>
                        {name}
                    </Display>
                    {vehicle.status ? <StatusPill status={vehicle.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="vehicle-status" /> : null}
                </XStack>
                {facts ? <Secondary fontSize={14}>{facts}</Secondary> : null}
                {!photo && vehicle.plate_number ? <Plate value={vehicle.plate_number} size="lg" testID="vehicle-row-plate" /> : null}
            </YStack>

            {lastCheck ? (
                <Card
                    tone={checkFailed ? 'danger' : 'success'}
                    flexDirection="row"
                    alignItems="center"
                    gap={space[3]}
                    onPress={onOpenInspection ? () => onOpenInspection(lastCheck) : undefined}
                    pressStyle={onOpenInspection ? { opacity: 0.8 } : undefined}
                    accessibilityRole={onOpenInspection ? 'button' : 'text'}
                    testID="vehicle-last-check"
                >
                    <YStack width={40} height={40} borderRadius={checkFailed ? 10 : 20} backgroundColor={checkFailed ? '$danger' : '$success'} alignItems="center" justifyContent="center">
                        {checkFailed ? (
                            <Body fontSize={20} fontWeight="800" color="$background">
                                !
                            </Body>
                        ) : (
                            <Icon name="tick" size={20} color="background" strokeWidth={3.2} />
                        )}
                    </YStack>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={16} fontWeight="800" tone={checkFailed ? 'danger' : 'success'}>
                            {checkFailed ? t('me.vehicle.lastCheckFailed') : t('me.vehicle.lastCheckPassed')}
                        </Body>
                        <Secondary fontSize={13} tabular>
                            {[checkedWhen, defects > 0 ? t('me.vehicle.toFix', { count: defects }) : undefined].filter(Boolean).join(' · ')}
                        </Secondary>
                    </YStack>
                    {onOpenInspection ? <Chevron /> : null}
                </Card>
            ) : null}

            {odometer || economy ? (
                <XStack gap={space[2]}>
                    {odometer ? <Stat value={`${formatNumber(Math.round(odometer.value))} ${unit}`} label={t('me.vehicle.onTheClock')} mono testID="vehicle-odometer-value" /> : null}
                    {economy ? <Stat value={economy} label={t('me.vehicle.yourLast30Days')} testID="vehicle-economy" /> : null}
                </XStack>
            ) : null}

            <Card gap={space[3]} testID="vehicle-odometer">
                <XStack alignItems="center" gap={space[3]}>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={15} fontWeight="800">
                            {t('vehicle.odometer')}
                        </Body>
                        {/*
                          * Where the number came from matters: a driver about to
                          * log a fuel fill copies this, and a live telematics
                          * reading and a months-old manual entry are not the
                          * same claim.
                          */}
                        <Secondary fontSize={13} tone={odometer?.source === 'telematics' ? 'success' : 'secondary'} testID="vehicle-odometer-source">
                            {!odometer
                                ? t('me.vehicle.noReading')
                                : odometer.source === 'telematics'
                                  ? t('vehicle.odometerFromTelematics', { when: vehicle.telematics?.last_event_at ? formatDateTime(vehicle.telematics.last_event_at) : t('vehicle.recently') })
                                  : t('vehicle.odometerRecorded')}
                        </Secondary>
                    </YStack>
                    {!editingOdometer ? <SmallButton label={t('me.vehicle.updateReading')} onPress={() => setEditingOdometer(true)} testID="vehicle-odometer-edit" /> : null}
                </XStack>
                {editingOdometer ? (
                    <YStack gap={space[3]}>
                        <Field
                            label={t('me.vehicle.newReading')}
                            value={reading}
                            onChangeText={setReading}
                            keyboardType="numeric"
                            tabular
                            accessory={<FieldAccessory label={unit} />}
                            testID="vehicle-odometer-input"
                        />
                        {odometerUpdate.outcome === 'ignored' ? <Banner tone="warning" message={t('me.vehicle.readingIgnored')} testID="vehicle-odometer-ignored" /> : null}
                        {odometerUpdate.outcome === 'failed' ? <Banner tone="danger" message={t('me.vehicle.readingFailed')} testID="vehicle-odometer-failed" /> : null}
                        <XStack gap={space[2]}>
                            <Button flex={1} height={52} borderRadius={ACTION_RADIUS} variant="secondary" onPress={() => setEditingOdometer(false)} testID="vehicle-odometer-cancel">
                                {t('common.cancel')}
                            </Button>
                            <Button flex={1} height={52} borderRadius={ACTION_RADIUS} disabled={!readingValid} loading={odometerUpdate.isSaving} onPress={saveReading} testID="vehicle-odometer-save">
                                {t('me.vehicle.saveReading')}
                            </Button>
                        </XStack>
                    </YStack>
                ) : null}
                {odometerUpdate.outcome === 'queued' ? <Banner tone="neutral" message={t('me.savedOnPhone')} testID="vehicle-odometer-queued" /> : null}
            </Card>

            <Card flush testID="vehicle-actions">
                {onInspect ? <MenuRow first height={56} icon="check" label={t('me.vehicle.check')} value={checkedWhen} onPress={onInspect} testID="vehicle-inspect" /> : null}
                {onFuelLog ? (
                    <MenuRow
                        first={!onInspect}
                        height={56}
                        icon="fuel"
                        label={t('account.fuelLog')}
                        value={lastFill?.created_at ? t('me.vehicle.lastFill', { date: formatDay(lastFill.created_at) }) : undefined}
                        onPress={onFuelLog}
                        testID="vehicle-fuel"
                    />
                ) : null}
                {onIssues ? (
                    <MenuRow
                        first={!onInspect && !onFuelLog}
                        height={56}
                        icon="issue"
                        label={t('me.issues')}
                        value={openIssues > 0 ? t('me.openCount', { count: openIssues }) : undefined}
                        valueTone={openIssues > 0 ? 'warning' : undefined}
                        onPress={onIssues}
                        testID="vehicle-issues"
                    />
                ) : null}
                {onChangeVehicle ? <MenuRow first={!onInspect && !onFuelLog && !onIssues} height={56} icon="vehicle" label={t('vehicle.change')} onPress={onChangeVehicle} testID="vehicle-change" /> : null}
            </Card>

            {rows.length ? (
                <Section title={t('me.vehicle.details')}>
                    <Card flush testID="vehicle-details">
                        {rows.map((row, i) => (
                            <FactRow key={row.key} first={i === 0} label={row.label} value={row.value} mono={row.mono} testID={`vehicle-row-${row.key}`} />
                        ))}
                    </Card>
                </Section>
            ) : null}

            {/*
              * Trailers — FleetOps v0.6.65. The train is listed in towing
              * order, each unit with the identifier painted on its side, its
              * coupling state, and the set temperature if it is a fridge. With
              * nothing coupled the section is simply not there.
              */}
            {trailers.isLoading ? (
                <Skeleton height={76} borderRadius={18} />
            ) : trailers.failed ? (
                <Secondary fontSize={13} testID="vehicle-trailers-error">
                    {t('trailer.loadFailed')}
                </Secondary>
            ) : trailers.trailers.length ? (
                <Section title={t('me.vehicle.trailers')} testID="vehicle-trailers">
                    {trailers.trailers.map((trailer) => {
                        const position = trainPositionOf(trailer);
                        const reefer = reeferRangeOf(trailer);
                        return (
                            <Card
                                key={trailer.id}
                                flexDirection="row"
                                alignItems="center"
                                gap={space[3]}
                                onPress={onOpenTrailer ? () => onOpenTrailer(trailer) : undefined}
                                pressStyle={onOpenTrailer ? { opacity: 0.8 } : undefined}
                                accessibilityRole={onOpenTrailer ? 'button' : 'text'}
                                testID={`vehicle-trailer-${trailer.id}`}
                            >
                                <YStack width={48} height={48} borderRadius={12} alignItems="center" justifyContent="center" backgroundColor="$surfaceRaised">
                                    {position != null ? (
                                        <Body fontSize={17} fontWeight="800" tone="secondary" tabular>
                                            {t('trailer.positionBadge', { position })}
                                        </Body>
                                    ) : (
                                        <Icon name="trailer" size={24} />
                                    )}
                                </YStack>
                                <YStack flex={1} gap={4} minWidth={0}>
                                    <Body fontSize={16} fontWeight="800" numberOfLines={1}>
                                        {trailerTitle(trailer) ?? t('trailer.unnamed')}
                                    </Body>
                                    {trailer.plate_number ? (
                                        <Body fontFamily="$mono" fontSize={13} fontWeight="500" tone="secondary" selectable>
                                            {trailer.plate_number}
                                        </Body>
                                    ) : null}
                                    {reefer ? (
                                        <Secondary fontSize={13} tone="brand" tabular testID={`vehicle-trailer-reefer-${trailer.id}`}>
                                            {t('trailer.refrigerated')} · {reefer}
                                        </Secondary>
                                    ) : null}
                                </YStack>
                                {trailer.attachment_state ? <StatusPill status={trailer.attachment_state} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} /> : null}
                                {onOpenTrailer ? <Chevron /> : null}
                            </Card>
                        );
                    })}
                </Section>
            ) : null}

            {onReportIssue ? (
                <BigButton variant="secondary" onPress={onReportIssue} icon={<Icon name="issue" size={20} color="primary" />} testID="vehicle-report-issue">
                    {t('issues.report')}
                </BigButton>
            ) : null}
        </Screen>
    );
}

export default MyVehicleScreen;
