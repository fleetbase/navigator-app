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
import { ScrollView, Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { StatusPill } from '../ui/StatusPill';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useDriver, useCurrentOrganization, vehicleOf, vehicleDescription, type DriverRecord } from '../data';

export interface AccountLink {
    route: string;
    labelKey: string;
    /** Shown in place of a chevron when the destination is not built yet. */
    blockedKey?: string;
}

/** Everything filed under Account, built or not. */
const LINKS: AccountLink[] = [
    { route: 'ProfileEdit', labelKey: 'account.profile' },
    { route: 'FuelLog', labelKey: 'account.fuelLog' },
    { route: 'Issues', labelKey: 'account.issues' },
    { route: 'MyVehicle', labelKey: 'account.myVehicle', blockedKey: 'account.laterPhase' },
    { route: 'Inspection', labelKey: 'account.inspection', blockedKey: 'account.laterPhase' },
    { route: 'Documents', labelKey: 'account.documents', blockedKey: 'account.laterPhase' },
    { route: 'Permissions', labelKey: 'account.permissions' },
    { route: 'SyncQueue', labelKey: 'account.syncQueue' },
    { route: 'Settings', labelKey: 'account.settings' },
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
}: {
    driverId?: string;
    driver?: DriverRecord | null;
    reloadToken?: number;
    onNavigate?: (route: string) => void;
    onSignOut?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { driver, isLoading, isBlocked, error, retry } = useDriver(driverId, seed, reloadToken);
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

    if (isBlocked || !driver) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="account-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="account-error" />
            </YStack>
        );
    }

    const vehicle = vehicleOf(driver);
    const vehicleDetail = vehicleDescription(vehicle);
    const licence = driver.drivers_license_number;

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="account-screen">
            {!isOnline ? <Banner tone="neutral" message={t('account.offlineNotice')} testID="account-offline" /> : null}

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

            <Surface testID="account-links">
                {LINKS.map((link, i) => (
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
                            {link.blockedKey ? <Micro tone="warning">{t(link.blockedKey)}</Micro> : <Secondary fontSize={17}>›</Secondary>}
                        </XStack>
                    </YStack>
                ))}
            </Surface>

            {onSignOut ? (
                <Button variant="destructive" fullWidth onPress={onSignOut} testID="sign-out">
                    {t('account.signOut')}
                </Button>
            ) : null}
        </ScrollView>
    );
}

export default AccountScreen;
