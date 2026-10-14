/**
 * Change the assigned vehicle — R2 E2.
 *
 * The ledger had this blocked on `GET /v1/vehicles?available=1` and a public
 * `assign-vehicle`. Neither is needed: `GET /v1/vehicles` is public and
 * company-scoped, and assignment is `PUT /v1/drivers/{id}` with the vehicle's
 * **public id**, which `DriverController@update` resolves against
 * `vehicles.public_id` for the session's company. A driver can therefore only
 * ever be assigned a vehicle in their own organisation, which is the constraint
 * that mattered.
 *
 * Vehicles that cannot be driven — in maintenance, out of service, retired —
 * are shown greyed rather than hidden. A driver looking for the van they used
 * yesterday should find out it is off the road, not be left wondering whether
 * the list is broken.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useScreenStyle } from '../ui/useScreenStyle';
import { chevron } from '../i18n/direction';
import { useSync } from '../shell';
import { useVehicles, isAssignable } from '../data/useVehicles';
import { useUpdateDriver } from '../data/useAccount';
import { vehicleTitle, type VehicleRecord } from '../data/useVehicle';

export function ChangeVehicleScreen({
    driverId,
    currentVehicleId,
    onDone,
    onAssigned,
}: {
    driverId?: string;
    /** Public id of the vehicle already assigned, so it can be marked. */
    currentVehicleId?: string;
    onDone?: () => void;
    /**
     * R2 E2: a confirmed swap goes straight to the pre-trip inspection for the
     * new vehicle rather than back to the account. When set, it replaces
     * `onDone` for the confirmed case; a queued swap still reports itself here.
     */
    onAssigned?: (vehicle: VehicleRecord) => void;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const [reloadToken, setReloadToken] = useState(0);
    const { vehicles, isLoading, error } = useVehicles(reloadToken);
    const { save, isSaving, queued, error: saveError } = useUpdateDriver(driverId);

    const choose = useCallback(
        async (vehicle: VehicleRecord) => {
            if (!vehicle.id) return;
            const updated = await save({ vehicle: vehicle.id });
            // A queued change reports itself through the hook's own state; only
            // a confirmed one should close the screen behind the driver.
            if (updated) {
                if (onAssigned) onAssigned(vehicle);
                else onDone?.();
            }
        },
        [onAssigned, onDone, save]
    );

    if (isLoading && !vehicles) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="change-vehicle-loading">
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
            </YStack>
        );
    }

    if (!vehicles) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="change-vehicle-error">
                <FailureState error={error as never} isOnline={isOnline} onRetry={() => setReloadToken((n) => n + 1)} t={t} testID="change-vehicle-error" />
            </YStack>
        );
    }

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="change-vehicle">
            {queued ? <Banner tone="neutral" message={t('changeVehicle.queued')} testID="change-vehicle-queued" /> : null}
            {saveError ? <Banner tone="danger" message={t('changeVehicle.failed')} testID="change-vehicle-failed" /> : null}

            {vehicles.length ? (
                <Surface testID="change-vehicle-list">
                    {vehicles.map((vehicle, i) => {
                        const isCurrent = !!currentVehicleId && vehicle.id === currentVehicleId;
                        const assignable = isAssignable(vehicle) && !isCurrent && !isSaving;
                        const title = vehicleTitle(vehicle);

                        return (
                            <YStack key={vehicle.id ?? String(i)}>
                                {i > 0 ? <Divider /> : null}
                                <XStack
                                    padding={space[3]}
                                    gap={space[3]}
                                    alignItems="center"
                                    opacity={assignable || isCurrent ? 1 : 0.5}
                                    onPress={assignable ? () => void choose(vehicle) : undefined}
                                    pressStyle={assignable ? { opacity: 0.7 } : undefined}
                                    accessibilityRole={assignable ? 'button' : 'text'}
                                    accessibilityState={{ selected: isCurrent, disabled: !assignable }}
                                    testID={`vehicle-option-${vehicle.id ?? i}`}
                                >
                                    <YStack flex={1} gap={2} minWidth={0}>
                                        <Body fontSize={15} fontWeight={isCurrent ? '800' : '600'} numberOfLines={1}>
                                            {vehicle.name ?? title ?? t('vehicle.unnamed')}
                                        </Body>
                                        {title && title !== vehicle.name ? <Micro numberOfLines={1}>{title}</Micro> : null}
                                        {vehicle.plate_number ? <Identifier value={vehicle.plate_number} boxed={false} /> : null}
                                    </YStack>

                                    {isCurrent ? (
                                        <Micro tone="brand" testID={`vehicle-current-${vehicle.id}`}>
                                            {t('changeVehicle.current')}
                                        </Micro>
                                    ) : vehicle.status ? (
                                        <StatusPill status={vehicle.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID={`vehicle-status-${vehicle.id}`} />
                                    ) : (
                                        <Secondary fontSize={17}>{chevron()}</Secondary>
                                    )}
                                </XStack>
                            </YStack>
                        );
                    })}
                </Surface>
            ) : (
                <EmptyState testID="change-vehicle-empty" title={t('changeVehicle.emptyTitle')} body={t('changeVehicle.emptyBody')} />
            )}

            <Micro>{t('changeVehicle.note')}</Micro>
        </ScrollView>
    );
}

export default ChangeVehicleScreen;
