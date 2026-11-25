/**
 * Choose a vehicle — design round 3 (`VehiclePick.dc.html`).
 *
 * `GET /v1/vehicles` is public and company-scoped, and assignment is
 * `PUT /v1/drivers/{id}` with the vehicle's **public id**, which the request
 * validates as a vehicle of the session's company (CreateDriverRequest:
 * `starts_with:vehicle_` + `existsInCompany`). A driver can therefore only
 * ever take a vehicle in their own organisation, which is the constraint that
 * mattered.
 *
 * The driver picks a row and then confirms with the one action at the bottom,
 * rather than a tap on a row swapping their vehicle on the spot: a mis-tap in
 * a list of look-alike vans used to change what dispatch saw them driving.
 *
 * Vehicles that cannot be driven — in maintenance, out of service, retired —
 * are shown greyed rather than hidden. A driver looking for the van they used
 * yesterday should find out it is off the road, not be left wondering whether
 * the list is broken.
 *
 * Not built, because the server has nothing for them:
 *
 *   - **"Scan tag."** Vehicles carry no scannable tag the API can look up.
 *   - **"At Wareham depot."** A vehicle has no home depot on the resource.
 *   - **"Checked yesterday / 82% charged / service due."** None of these are
 *     on the vehicle list.
 */
import { useCallback, useMemo, useState } from 'react';
import { Image, TextInput } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Banner, EmptyState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useVehicles, isAssignable } from '../data/useVehicles';
import { useUpdateDriver } from '../data/useAccount';
import { vehicleTitle, vehiclePhotoOf, type VehicleRecord } from '../data/useVehicle';
import { humanizeStatus } from '../theme/status';
import { BigButton } from '../onboarding/AuthScaffold';
import { Card, Icon, Plate, RadioMark, Screen, SectionLabel, useColor } from './me/parts';

type Standing = 'yours' | 'free' | 'inUse' | 'offRoad';

/** Where a vehicle stands for this driver, from what the list actually says. */
function standingOf(vehicle: VehicleRecord, currentVehicleId?: string, driverId?: string): Standing {
    if (currentVehicleId && vehicle.id === currentVehicleId) return 'yours';
    if (!isAssignable(vehicle)) return 'offRoad';
    // `driver_id` is the driver holding it now; absent on older servers, where everything reads as free.
    if (vehicle.driver_id && vehicle.driver_id !== driverId) return 'inUse';
    return 'free';
}

const ORDER: Record<Standing, number> = { yours: 0, free: 1, inUse: 2, offRoad: 3 };

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
    const { isOnline } = useSync();
    const placeholder = useColor('textMuted');
    const ink = useColor('textPrimary');
    const [reloadToken, setReloadToken] = useState(0);
    const { vehicles, isLoading, error } = useVehicles(reloadToken);
    const { save, isSaving, queued, error: saveError } = useUpdateDriver(driverId);
    const [query, setQuery] = useState('');
    const [pickedId, setPickedId] = useState<string | null>(null);

    const list = useMemo(() => {
        const wanted = query.trim().toLowerCase();
        return (vehicles ?? [])
            .map((vehicle) => ({ vehicle, standing: standingOf(vehicle, currentVehicleId, driverId) }))
            .filter(({ vehicle }) => {
                if (!wanted) return true;
                // Plates are typed with and without the space.
                const haystack = [vehicle.name, vehicleTitle(vehicle), vehicle.plate_number, vehicle.plate_number?.replace(/\s+/g, ''), vehicle.internal_id, vehicle.call_sign].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(wanted) || haystack.includes(wanted.replace(/\s+/g, ''));
            })
            .sort((a, b) => ORDER[a.standing] - ORDER[b.standing]);
    }, [vehicles, query, currentVehicleId, driverId]);

    const picked = (vehicles ?? []).find((vehicle) => vehicle.id === pickedId) ?? null;
    const pickedName = picked ? (picked.name ?? vehicleTitle(picked) ?? picked.plate_number ?? t('vehicle.unnamed')) : undefined;
    const freeCount = (vehicles ?? []).filter((vehicle) => standingOf(vehicle, currentVehicleId, driverId) === 'free').length;

    const confirm = useCallback(async () => {
        if (!picked?.id) return;
        const updated = await save({ vehicle: picked.id });
        // A queued change reports itself through the hook's own state; only
        // a confirmed one should close the screen behind the driver.
        if (updated) {
            if (onAssigned) onAssigned(picked);
            else onDone?.();
        }
    }, [picked, onAssigned, onDone, save]);

    if (isLoading && !vehicles) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="change-vehicle-loading">
                <Skeleton height={52} borderRadius={16} />
                <Skeleton height={96} borderRadius={18} />
                <Skeleton height={96} borderRadius={18} />
                <Skeleton height={96} borderRadius={18} />
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
        <Screen
            gap={space[3]}
            testID="change-vehicle"
            footer={
                vehicles.length ? (
                    <>
                        <BigButton disabled={!picked} loading={isSaving} onPress={confirm} testID="change-vehicle-confirm">
                            {pickedName ? t('me.vehicle.take', { name: pickedName }) : t('me.vehicle.choose')}
                        </BigButton>
                        {onAssigned ? (
                            <Secondary fontSize={13} center>
                                {t('me.vehicle.checkBeforeSetOff')}
                            </Secondary>
                        ) : null}
                    </>
                ) : undefined
            }
        >
            {queued ? <Banner tone="neutral" message={t('changeVehicle.queued')} testID="change-vehicle-queued" /> : null}
            {saveError ? <Banner tone="danger" message={t('changeVehicle.failed')} testID="change-vehicle-failed" /> : null}

            {vehicles.length ? (
                <>
                    {/* Only worth a search box once the list is longer than a glance. */}
                    {vehicles.length > 6 ? (
                        <XStack alignItems="center" gap={10} height={52} paddingHorizontal={14} borderRadius={16} backgroundColor="$surface" borderWidth={1} borderColor="$border">
                            <Icon name="search" size={18} strokeWidth={2.4} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder={t('me.vehicle.searchPlaceholder')}
                                placeholderTextColor={placeholder}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                returnKeyType="search"
                                accessibilityLabel={t('me.vehicle.searchLabel')}
                                style={{ flex: 1, minWidth: 0, fontSize: 16, color: ink, paddingVertical: 0 }}
                                testID="change-vehicle-search"
                            />
                        </XStack>
                    ) : null}

                    <SectionLabel testID="change-vehicle-count">{t('me.vehicle.freeCount', { count: freeCount })}</SectionLabel>

                    <YStack gap={space[2]} testID="change-vehicle-list">
                        {list.map(({ vehicle, standing }, i) => {
                            // A vehicle another driver holds cannot be taken: two drivers must not end up on one vehicle.
                            const selectable = standing === 'free';
                            const selected = !!vehicle.id && vehicle.id === pickedId;
                            const title = vehicleTitle(vehicle);
                            const name = vehicle.name ?? title ?? t('vehicle.unnamed');
                            const photo = vehiclePhotoOf(vehicle);
                            const tone = standing === 'offRoad' ? 'danger' : standing === 'inUse' ? 'warning' : standing === 'yours' ? 'brand' : 'success';
                            const dot = standing === 'offRoad' ? '$dangerText' : standing === 'inUse' ? '$warningText' : standing === 'yours' ? '$primary' : '$successText';
                            const word =
                                standing === 'yours'
                                    ? t('changeVehicle.current')
                                    : standing === 'free'
                                      ? t('me.vehicle.free')
                                      : standing === 'inUse'
                                        ? t('me.vehicle.inUse')
                                        : t('me.vehicle.offRoad', { reason: vehicle.status ? humanizeStatus(vehicle.status) : '' }).replace(/ · $/, '');

                            return (
                                <Card
                                    key={vehicle.id ?? String(i)}
                                    selected={selected}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={space[3]}
                                    padding={space[3]}
                                    minHeight={96}
                                    opacity={standing === 'offRoad' ? 0.55 : 1}
                                    onPress={selectable && !isSaving ? () => setPickedId(vehicle.id) : undefined}
                                    pressStyle={selectable ? { opacity: 0.8 } : undefined}
                                    accessibilityRole={selectable ? 'radio' : 'text'}
                                    accessibilityState={{ selected, disabled: !selectable }}
                                    testID={`vehicle-option-${vehicle.id ?? i}`}
                                >
                                    {photo ? (
                                        <Image source={{ uri: photo }} style={{ width: 96, height: 72, borderRadius: 12 }} accessibilityIgnoresInvertColors />
                                    ) : (
                                        <YStack width={56} height={56} borderRadius={14} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                                            <Icon name="vehicle" size={26} />
                                        </YStack>
                                    )}
                                    <YStack flex={1} gap={4} minWidth={0}>
                                        <Body fontSize={17} fontWeight="800" numberOfLines={1}>
                                            {name}
                                        </Body>
                                        {title && title !== vehicle.name ? (
                                            <Secondary fontSize={13} numberOfLines={1}>
                                                {title}
                                            </Secondary>
                                        ) : null}
                                        <Plate value={vehicle.plate_number} />
                                        {/* A dot for the free ones, a square for the ones that are not: shape as well as colour. */}
                                        <XStack alignItems="center" gap={6} testID={standing === 'yours' ? `vehicle-current-${vehicle.id}` : `vehicle-status-${vehicle.id}`}>
                                            <YStack width={8} height={8} borderRadius={standing === 'free' || standing === 'yours' ? 4 : 1} backgroundColor={dot} />
                                            <Body fontSize={13} fontWeight="700" tone={tone} numberOfLines={1}>
                                                {word}
                                            </Body>
                                        </XStack>
                                    </YStack>
                                    {selectable ? <RadioMark selected={selected} /> : null}
                                </Card>
                            );
                        })}
                    </YStack>

                    {!list.length ? (
                        <Secondary center testID="change-vehicle-no-match">
                            {t('me.vehicle.noMatch')}
                        </Secondary>
                    ) : null}
                </>
            ) : (
                <YStack flex={1} justifyContent="center">
                    <EmptyState testID="change-vehicle-empty" title={t('changeVehicle.emptyTitle')} body={t('changeVehicle.emptyBody')} />
                </YStack>
            )}
        </Screen>
    );
}

export default ChangeVehicleScreen;
