/**
 * My vehicle — R2 E1, read-only.
 *
 * Viewing was never blocked; `GET /v1/vehicles/{id}` is public. Changing the
 * assigned vehicle and posting an odometer still are, and the screen says so
 * rather than offering controls that would fail.
 *
 * The resource carries about a hundred fields and a stock instance leaves most
 * of them null. Rendering them all would bury the plate number under ninety
 * blank rows, so this asks for the facts a driver uses — what it is, what it is
 * called, what is on the plate, how far it has run, what it drinks — and drops
 * every one the record does not have.
 */
import { ScrollView, Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Skeleton } from '../ui/Banner';
import { Banner } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { useSync } from '../shell';
import { useVehicle, odometerOf, vehicleTitle, type VehicleRecord } from '../data/useVehicle';
import { formatDateTime } from '../format';
import { humanizeStatus } from '../theme/status';

/** Rows the driver has a use for, in the order they would look for them. */
function detailRows(vehicle: VehicleRecord, t: (k: string, o?: Record<string, unknown>) => string) {
    const rows: { key: string; label: string; value: string; mono?: boolean }[] = [];
    const push = (key: string, label: string, value?: unknown, mono?: boolean) => {
        if (value === null || value === undefined || value === '') return;
        rows.push({ key, label, value: String(value), mono });
    };

    push('plate', t('vehicle.plate'), vehicle.plate_number, true);
    push('vin', t('vehicle.vin'), vehicle.vin, true);
    push('internal', t('vehicle.internalId'), vehicle.internal_id, true);
    push('colour', t('vehicle.colour'), vehicle.color);
    push('fuelType', t('vehicle.fuelType'), vehicle.fuel_type ? humanizeStatus(vehicle.fuel_type) : undefined);
    push(
        'fuelCapacity',
        t('vehicle.fuelCapacity'),
        vehicle.fuel_capacity ? `${vehicle.fuel_capacity}${vehicle.fuel_volume_unit ? ` ${vehicle.fuel_volume_unit}` : ''}` : undefined
    );
    push('seats', t('vehicle.seats'), vehicle.seating_capacity);
    /*
     * Payload comes back as "160.00" with no unit anywhere on the resource —
     * no `payload_capacity_unit`, and `measurement_system` is null too. A bare
     * number against "Payload" is not information: 160 kg and 160 lb are
     * different vehicles. Omitted until the server says which.
     */
    return rows;
}

export function MyVehicleScreen({
    vehicleId,
    seed,
    reloadToken = 0,
}: {
    vehicleId?: string;
    seed?: VehicleRecord | null;
    reloadToken?: number;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { vehicle, isLoading, error, reload } = useVehicle(vehicleId, seed, reloadToken);

    if (!vehicleId) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="vehicle-none">
                <Banner tone="neutral" message={t('vehicle.noneAssigned')} testID="vehicle-none-banner" />
            </YStack>
        );
    }

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="vehicle-loading">
                <Skeleton height={120} />
                <Skeleton height={72} />
                <Skeleton height={200} />
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
    const odometer = odometerOf(vehicle);
    const rows = detailRows(vehicle, t);

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="my-vehicle">
            <Surface hero padded testID="vehicle-identity">
                <XStack gap={space[3]} alignItems="center">
                    {vehicle.photo_url ? (
                        <Image source={{ uri: vehicle.photo_url }} style={{ width: 56, height: 56, borderRadius: radius.compact }} />
                    ) : null}
                    <YStack flex={1} gap={2}>
                        <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                            <Body fontSize={17} fontWeight="800" flex={1} numberOfLines={1}>
                                {vehicle.name ?? title ?? t('vehicle.unnamed')}
                            </Body>
                            {vehicle.status ? (
                                <StatusPill status={vehicle.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="vehicle-status" />
                            ) : null}
                        </XStack>
                        {title && title !== vehicle.name ? <Micro>{title}</Micro> : null}
                    </YStack>
                </XStack>
            </Surface>

            {odometer ? (
                <Surface padded testID="vehicle-odometer">
                    <YStack gap={space[1]}>
                        <Caption>{t('vehicle.odometer')}</Caption>
                        <Body fontSize={22} fontWeight="800" tabular testID="vehicle-odometer-value">
                            {Math.round(odometer.value).toLocaleString()} {vehicle.odometer_unit ?? 'km'}
                        </Body>
                        {/*
                         * Where the number came from matters: a driver about to
                         * log a fuel fill copies this, and a live telematics
                         * reading and a months-old manual entry are not the
                         * same claim.
                         */}
                        <Micro tone={odometer.source === 'telematics' ? 'success' : 'secondary'} testID="vehicle-odometer-source">
                            {odometer.source === 'telematics'
                                ? t('vehicle.odometerFromTelematics', {
                                      when: vehicle.telematics?.last_event_at ? formatDateTime(vehicle.telematics.last_event_at) : t('vehicle.recently'),
                                  })
                                : t('vehicle.odometerRecorded')}
                        </Micro>
                    </YStack>
                </Surface>
            ) : null}

            {rows.length ? (
                <Surface testID="vehicle-details">
                    {rows.map((row, i) => (
                        <YStack key={row.key}>
                            {i > 0 ? <Divider /> : null}
                            {row.mono ? (
                                /*
                                 * Identifiers get their own line, per the
                                 * design's rule that they are never truncated.
                                 * Beside the label they were worse than
                                 * truncated: `Identifier` lays its value out in
                                 * a `flex: 1` child, which collapses to zero
                                 * width in a space-between row, so the plate
                                 * rendered as nothing at all.
                                 */
                                <YStack padding={space[3]} gap={space[1]} testID={`vehicle-row-${row.key}`}>
                                    <Caption>{row.label}</Caption>
                                    <Identifier value={row.value} boxed={false} />
                                </YStack>
                            ) : (
                                <XStack padding={space[3]} justifyContent="space-between" alignItems="center" gap={space[3]} testID={`vehicle-row-${row.key}`}>
                                    <Caption>{row.label}</Caption>
                                    <Body fontSize={15} textAlign="right" flexShrink={1}>
                                        {row.value}
                                    </Body>
                                </XStack>
                            )}
                        </YStack>
                    ))}
                </Surface>
            ) : (
                <Secondary testID="vehicle-sparse">{t('vehicle.sparse')}</Secondary>
            )}

            {/* Changing the vehicle and entering an odometer both need endpoints
                that are not on the public namespace yet. Saying so beats a
                control that fails. */}
            <Micro tone="warning" testID="vehicle-readonly">
                {t('vehicle.readOnly')}
            </Micro>
        </ScrollView>
    );
}

export default MyVehicleScreen;
