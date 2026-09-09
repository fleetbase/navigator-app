/**
 * Account home — from the design prototype's Account list.
 *
 * This replaces the placeholder that Fuel log and Issues were reached through,
 * so it is also the hub for everything filed under Account.
 *
 * Two rows the prototype shows are deliberately absent:
 *
 *   - **Earnings** ("£1,284 this wk"). No earnings, payout or rate data exists
 *     for a driver anywhere in FleetOps. Showing a zero would be a lie and
 *     showing a placeholder would imply it is coming.
 *   - **Licence details.** The fields exist (`drivers_license_number`,
 *     `license_expiry`) but are null on the instance, so the row appears only
 *     when there is something in it.
 */
import { useState } from 'react';
import { ScrollView, Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useQueue, useFleetbase } from '../api';
import { useDriver, useCurrentOrganization, vehicleOf, vehicleDescription, type DriverRecord } from '../data';
import { useScreenStyle } from '../ui/useScreenStyle';
import { chevron } from '../i18n/direction';

export interface AccountLink {
    route: string;
    labelKey: string;
    /** Shown in place of a chevron when the destination is not built yet. */
    blockedKey?: string;
    /** Organisation switch that lifts `blockedKey` when on. */
    feature?: 'earnings';
}

/** Everything filed under Account, built or not. */
const LINKS: AccountLink[] = [
    { route: 'ProfileEdit', labelKey: 'account.profile' },
    { route: 'FuelLog', labelKey: 'account.fuelLog' },
    { route: 'Issues', labelKey: 'account.issues' },
    { route: 'MyVehicle', labelKey: 'account.myVehicle' },
    { route: 'Earnings', labelKey: 'account.earnings', blockedKey: 'account.notEnabled', feature: 'earnings' },
    { route: 'Inspection', labelKey: 'account.inspection', blockedKey: 'account.laterPhase' },
    { route: 'Documents', labelKey: 'account.documents', blockedKey: 'account.notEnabled' },
    { route: 'Permissions', labelKey: 'account.permissions' },
    { route: 'SyncQueue', labelKey: 'account.syncQueue' },
    { route: 'Settings', labelKey: 'account.settings' },
    { route: 'Help', labelKey: 'account.help' },
];

function Avatar({ url, name }: { url?: string | null; name?: string }) {
    if (url) {
        return <Image source={{ uri: url }} style={{ width: 56, height: 56, borderRadius: radius.pill }} />;
    }
    const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <YStack width={56} height={56} borderRadius={radius.pill} backgroundColor="$primary" alignItems="center" justifyContent="center">
            <Heading color="$onPrimary">{initial}</Heading>
        </YStack>
    );
}

export function AccountScreen({
    driverId,
    driver: seed,
    reloadToken,
    onNavigate,
    onSignOut,
    features,
}: {
    driverId?: string;
    driver?: DriverRecord | null;
    reloadToken?: number;
    onNavigate?: (route: string) => void;
    onSignOut?: () => void;
    /** Organisation switches; a gated row loses its "not enabled" mark when on. */
    features?: { earnings?: boolean };
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { driver, isLoading, isBlocked, error, retry } = useDriver(driverId, seed, reloadToken);
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);
    // Everything still waiting to reach the server, failed items included —
    // a parked item is exactly the kind the driver would want to know about.
    // The provider's queue, not the module default — a test (or a second
    // instance) supplies its own, and reading the wrong one would count zero.
    const { queue } = useFleetbase();
    const { pendingCount, failedCount } = useQueue(queue);
    const waiting = pendingCount + failedCount;
    const { organization } = useCurrentOrganization(reloadToken);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="account-loading">
                <Skeleton height={96} />
                <Skeleton height={72} />
                <Skeleton height={240} />
            </YStack>
        );
    }

    /*
     * Only the driver's own details come from the server. Settings, the sync
     * queue, the fuel log, the issue list and — most of all — sign out are
     * local, and a driver reaches for exactly those when the server is
     * misbehaving. Replacing the whole tab with one error state locked them out
     * of the tools for the situation they were in.
     */
    const detailsUnavailable = isBlocked || !driver;
    const vehicle = driver ? vehicleOf(driver) : undefined;
    const vehicleDetail = vehicleDescription(vehicle);
    const licence = driver?.drivers_license_number;

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="account-screen">

            {detailsUnavailable || !driver ? (
                <Surface padded testID="account-error">
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="account-error" />
                </Surface>
            ) : (
                <>
            <Surface hero padded testID="account-identity">
                <XStack gap={space[3]} alignItems="center">
                    <Avatar url={driver.photo_url ?? driver.avatar_url} name={driver.name} />
                    <YStack flex={1} gap={2}>
                        <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                            <Body fontSize={17} fontWeight="800" flex={1} numberOfLines={1}>
                                {driver.name ?? t('account.unnamed')}
                            </Body>
                            {driver.status ? (
                                <StatusPill status={driver.status} size="sm" t={(k, fb) => t(k, { defaultValue: fb })} testID="driver-status" />
                            ) : null}
                        </XStack>
                        {driver.email ? <Micro numberOfLines={1}>{driver.email}</Micro> : null}
                        {driver.phone ? <Micro tabular>{driver.phone}</Micro> : null}
                    </YStack>
                </XStack>

                {driver.internal_id ? (
                    <YStack paddingTop={space[3]} gap={space[1]}>
                        <Caption>{t('account.driverId')}</Caption>
                        <Identifier value={driver.internal_id} boxed={false} />
                    </YStack>
                ) : null}
            </Surface>

            <Surface padded="compact" testID="account-organization">
                <XStack gap={space[3]} alignItems="center">
                    {organization?.logo_url ? (
                        <Image source={{ uri: organization.logo_url }} style={{ width: 32, height: 32, borderRadius: radius.compact }} />
                    ) : null}
                    <YStack flex={1} gap={2}>
                        <Caption>{t('account.organization')}</Caption>
                        <Body fontSize={15} fontWeight="700" numberOfLines={1}>
                            {organization?.name ?? driver.company_name ?? t('account.unknownOrganization')}
                        </Body>
                    </YStack>
                    {onNavigate ? (
                        <Button variant="secondary" onPress={() => onNavigate('OrgSwitcher')} testID="switch-organization">
                            {t('account.switch')}
                        </Button>
                    ) : null}
                </XStack>
            </Surface>

            <Surface padded="compact" testID="account-vehicle">
                <XStack gap={space[3]} alignItems="center">
                    {vehicle?.photo_url ? (
                        <Image source={{ uri: vehicle.photo_url }} style={{ width: 44, height: 44, borderRadius: radius.compact }} />
                    ) : null}
                    <YStack flex={1} gap={2}>
                        <Caption>{t('account.assignedVehicle')}</Caption>
                        {vehicle?.name ? (
                            <Body fontSize={15} fontWeight="700">
                                {vehicle.name}
                            </Body>
                        ) : (
                            <Body fontSize={15} tone="secondary" testID="no-vehicle">
                                {t('account.noVehicle')}
                            </Body>
                        )}
                        {vehicleDetail ? <Micro>{vehicleDetail}</Micro> : null}
                    </YStack>
                </XStack>
            </Surface>

            {licence ? (
                <Surface padded="compact" testID="account-licence">
                    <YStack gap={space[1]}>
                        <Caption>{t('account.licence')}</Caption>
                        <Identifier value={licence} boxed={false} />
                        {driver.license_expiry ? <Micro>{t('account.licenceExpires', { date: driver.license_expiry })}</Micro> : null}
                    </YStack>
                </Surface>
            ) : null}

                </>
            )}

            <Surface testID="account-links">
                {LINKS.map((raw, i) => {
                    const link = raw.feature && features?.[raw.feature] ? { ...raw, blockedKey: undefined } : raw;
                    return (
                    <YStack key={link.route}>
                        {i > 0 ? <Divider /> : null}
                        <XStack
                            padding={space[3]}
                            alignItems="center"
                            justifyContent="space-between"
                            gap={space[3]}
                            onPress={onNavigate ? () => onNavigate(link.route) : undefined}
                            pressStyle={onNavigate ? { opacity: 0.7 } : undefined}
                            testID={`link-${link.route}`}
                        >
                            <Body fontSize={15}>{t(link.labelKey)}</Body>
                            {link.blockedKey ? <Micro tone="warning">{t(link.blockedKey)}</Micro> : <Secondary fontSize={17}>{chevron()}</Secondary>}
                        </XStack>
                    </YStack>
                    );
                })}
            </Surface>

            {/*
              * The confirmation replaces the button rather than following it.
              * Rendered underneath, it landed below the fold at the end of a
              * scrolling screen: the driver tapped Sign out, saw nothing move,
              * and had no reason to think anything had happened.
              */}
            {onSignOut && !confirmingSignOut ? (
                <Button variant="destructive" fullWidth onPress={() => setConfirmingSignOut(true)} testID="sign-out">
                    {t('account.signOut')}
                </Button>
            ) : null}

            {onSignOut && confirmingSignOut ? (
                /*
                 * Gap spec H4. Signing out clears the token but leaves queued
                 * work on the device, and that work can only ever be sent by
                 * the driver who created it — so it has to be named before it
                 * is stranded, with the count, not a vague "unsaved changes".
                 */
                <Surface padded testID="sign-out-confirm">
                    <YStack gap={space[3]}>
                        <Body fontSize={15} fontWeight="700">
                            {t('account.signOutTitle')}
                        </Body>
                        <Secondary fontSize={13}>
                            {waiting > 0 ? t('account.signOutWithQueued', { count: waiting }) : t('account.signOutBody')}
                        </Secondary>
                        <XStack gap={space[2]}>
                            <Button flex={1} variant="ghost" onPress={() => setConfirmingSignOut(false)} testID="sign-out-cancel">
                                {t('common.cancel')}
                            </Button>
                            <Button flex={1} variant="destructive" onPress={onSignOut} testID="sign-out-confirm-yes">
                                {t('account.signOutConfirm')}
                            </Button>
                        </XStack>
                    </YStack>
                </Surface>
            ) : null}
        </ScrollView>
    );
}

export default AccountScreen;
