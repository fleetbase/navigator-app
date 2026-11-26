/**
 * Me — design round 3 (`Me.dc.html`).
 *
 * Who the driver is, who they are driving for, what they are driving, and the
 * way into everything filed under their account. It is a root tab screen, so it
 * draws its own header and leaves room for the floating tab bar.
 *
 * What the mockup shows and this does not:
 *
 *   - **The day's figures** (waypoints done, distance driven, time on duty).
 *     Those belong to Home, which owns the data for them; nothing in the
 *     account endpoints carries a distance driven or a time on duty.
 *   - **Documents.** The organisation can name documents it wants from a new
 *     driver, but the server has nowhere for the driver to send them — see the
 *     notice below, which says who to give them to instead of offering an
 *     upload that nobody would receive.
 *
 * Rows only appear when they lead somewhere real: Earnings is absent unless the
 * organisation has it on, and the switch control is absent for a driver who
 * belongs to one organisation.
 */
import { useState } from 'react';
import { Image, RefreshControl } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { ScrollView } from '../ui/Scroll';
import { Body, Display, Secondary } from '../ui/Text';
import { Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useQueue, useFleetbase } from '../api';
import { useDriver, useCurrentOrganization, useDriverOrganizations, useDriverDocuments, useIssues, vehicleOf, vehicleDescription, type DriverRecord } from '../data';
import { vehiclePhotoOf } from '../data/useVehicle';
import { useScreenStyle } from '../ui/useScreenStyle';
import { getBuildBranding } from '../branding/build-branding';
import { customAccountLinks } from '../extensions/build-navigation';
import { useTabBarSpace } from '../navigation/TabBar';
import { ACTION_RADIUS, BigButton } from '../onboarding/AuthScaffold';
import { Button } from '../ui/Button';
import { Avatar, Card, Chevron, Icon, MenuRow, Plate, SectionLabel, SmallButton, type IconName } from './me/parts';
import { isOpenIssue } from './me/issueTaxonomy';

export interface AccountLink {
    route: string;
    labelKey: string;
    /** Set on an entry whose destination is not built; such an entry is left out of the menu. */
    blockedKey?: string;
    /** Organisation switch that lifts `blockedKey` when on. */
    feature?: 'earnings';
    icon?: IconName;
}

/**
 * Everything filed under Me. Profile and My vehicle are in the list — so a
 * brand can still hide them by route name — but are drawn as the Edit control
 * and the vehicle card rather than as rows.
 */
const LINKS: AccountLink[] = [
    { route: 'ProfileEdit', labelKey: 'account.profile', icon: 'person' },
    { route: 'MyVehicle', labelKey: 'account.myVehicle', icon: 'vehicle' },
    { route: 'FuelLog', labelKey: 'account.fuelLog', icon: 'fuel' },
    { route: 'Issues', labelKey: 'me.issues', icon: 'issue' },
    { route: 'Inspection', labelKey: 'me.inspection', icon: 'check' },
    { route: 'SyncQueue', labelKey: 'me.waitingToSend', icon: 'sync' },
    { route: 'Earnings', labelKey: 'account.earnings', blockedKey: 'account.notEnabled', feature: 'earnings', icon: 'wallet' },
    // Shown only when the organisation asks its drivers for documents.
    { route: 'Documents', labelKey: 'account.documents', icon: 'shield' },
    { route: 'Permissions', labelKey: 'me.permissions', icon: 'pin' },
    { route: 'Settings', labelKey: 'account.settings', icon: 'settings' },
    { route: 'Help', labelKey: 'me.help', icon: 'help' },
];

/**
 * The menu this build shows: the app's entries minus the ones branding hides
 * (`account.hiddenLinks`), plus the build's own (extensions `accountLinks`), each
 * at its `position` or just before Settings.
 */
export function accountLinks(
    links: AccountLink[] = LINKS,
    hidden: string[] = getBuildBranding().branding.account.hiddenLinks,
    added: { route: string; labelKey: string; position?: number }[] = customAccountLinks
): AccountLink[] {
    const menu = links.filter((link) => !hidden.includes(link.route));
    for (const link of added) {
        if (menu.some((existing) => existing.route === link.route)) continue;
        const settings = menu.findIndex((existing) => existing.route === 'Settings');
        const at = typeof link.position === 'number' ? Math.max(0, Math.min(menu.length, Math.floor(link.position))) : settings >= 0 ? settings : menu.length;
        menu.splice(at, 0, { route: link.route, labelKey: link.labelKey });
    }
    return menu;
}

const MENU = accountLinks();
/** Drawn as their own controls, not as rows. */
const NOT_ROWS = new Set(['ProfileEdit', 'MyVehicle']);
const has = (route: string) => MENU.some((link) => link.route === route);

export function AccountScreen({
    driverId,
    driver: seed,
    reloadToken,
    onNavigate,
    onSignOut,
    features,
    appVersion,
    host,
}: {
    driverId?: string;
    driver?: DriverRecord | null;
    reloadToken?: number;
    onNavigate?: (route: string) => void;
    onSignOut?: () => void;
    /** Organisation switches; a gated row appears only when its switch is on. */
    features?: { earnings?: boolean };
    /** The native build's version, shown under sign out. */
    appVersion?: string;
    /** The server this build talks to. */
    host?: string;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const tabBarSpace = useTabBarSpace();
    const { isOnline, queuedCount } = useSync();
    const { driver, state, isLoading, isBlocked, error, retry } = useDriver(driverId, seed, reloadToken);
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);
    // Everything still waiting to reach the server, failed items included —
    // a parked item is exactly the kind the driver would want to know about.
    // The provider's queue, not the module default — a test (or a second
    // instance) supplies its own, and reading the wrong one would count zero.
    const { queue } = useFleetbase();
    const { pendingCount, failedCount } = useQueue(queue);
    const waiting = Math.max(pendingCount + failedCount, queuedCount);
    const { organization } = useCurrentOrganization(reloadToken);
    // Only to know whether there is anything to switch to.
    const { organizations } = useDriverOrganizations(driverId, reloadToken);
    const { issues } = useIssues(driverId, reloadToken);
    const openIssues = (issues ?? []).filter(isOpenIssue).length;
    // What the organisation asks for and where the driver's copies stand. Empty when it asks for nothing.
    const { summary: documents } = useDriverDocuments(driverId, reloadToken);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" paddingHorizontal={space[4]} paddingTop={space[2]} gap={14} testID="account-loading">
                <Skeleton height={68} borderRadius={18} />
                <Skeleton height={64} borderRadius={18} />
                <Skeleton height={96} borderRadius={18} />
                <Skeleton height={240} borderRadius={18} />
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
    const vehiclePhoto = vehiclePhotoOf(vehicle);
    const vehicleDetail = vehicleDescription(vehicle);
    const licence = driver?.drivers_license_number;
    const organizationName = organization?.name ?? driver?.company_name;
    const canSwitch = (organizations?.length ?? 0) > 1;
    const documentsAsked = (documents?.required ?? 0) > 0;
    const documentsOutstanding = documentsAsked && documents?.state !== 'approved';

    const valueFor = (route: string): { value?: string; tone?: 'warning' | 'danger' } => {
        if (route === 'SyncQueue') return waiting > 0 ? { value: t('me.waitingCount', { count: waiting }), tone: failedCount > 0 ? 'danger' : 'warning' } : { value: t('me.allSent') };
        if (route === 'Issues' && openIssues > 0) return { value: t('me.openCount', { count: openIssues }), tone: 'warning' };
        if (route === 'Documents' && documents) {
            if (documents.state === 'approved') return { value: t('documents.row.approved') };
            if (documents.state === 'in_review') return { value: t('documents.row.inReview'), tone: 'warning' };
            return { value: t('documents.row.toSend', { count: documents.missing + documents.rejected }), tone: documents.rejected > 0 ? 'danger' : 'warning' };
        }
        return {};
    };

    const rows = MENU.filter((link) => !NOT_ROWS.has(link.route))
        .filter((link) => !link.blockedKey || (link.feature && features?.[link.feature]))
        .filter((link) => link.route !== 'Documents' || documentsAsked);

    return (
        <ScrollView
            style={screen}
            contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: tabBarSpace, gap: 14 }}
            refreshControl={<RefreshControl refreshing={state === 'loading' && !!driver} onRefresh={retry} />}
            testID="account-screen"
        >
            <XStack alignItems="center" justifyContent="space-between" gap={space[3]} minHeight={44}>
                <Display fontSize={30} lineHeight={36} fontWeight="800" letterSpacing={-0.4} testID="account-title">
                    {t('me.title')}
                </Display>
                {onNavigate && driver && has('ProfileEdit') ? <SmallButton label={t('common.edit')} onPress={() => onNavigate('ProfileEdit')} testID="link-ProfileEdit" /> : null}
            </XStack>

            {detailsUnavailable || !driver ? (
                <Card testID="account-error">
                    <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="account-error" />
                </Card>
            ) : (
                <>
                    <XStack alignItems="center" gap={14} testID="account-identity">
                        <Avatar url={driver.photo_url ?? driver.avatar_url} name={driver.name} testID="account-avatar" />
                        <YStack flex={1} gap={2} minWidth={0}>
                            <Body fontSize={24} lineHeight={28} fontWeight="800" letterSpacing={-0.2} numberOfLines={2}>
                                {driver.name ?? t('account.unnamed')}
                            </Body>
                            {driver.phone ? (
                                <Secondary fontSize={14} tabular numberOfLines={1}>
                                    {driver.phone}
                                </Secondary>
                            ) : null}
                            {driver.email ? (
                                <Secondary fontSize={14} numberOfLines={1}>
                                    {driver.email}
                                </Secondary>
                            ) : null}
                        </YStack>
                    </XStack>

                    {driver.internal_id || licence ? (
                        <Card gap={space[3]} testID="account-ids">
                            {driver.internal_id ? (
                                <YStack gap={2} testID="account-driver-id">
                                    <SectionLabel>{t('account.driverId')}</SectionLabel>
                                    <Body fontFamily="$mono" fontSize={15} fontWeight="600" selectable>
                                        {driver.internal_id}
                                    </Body>
                                </YStack>
                            ) : null}
                            {licence ? (
                                <YStack gap={2} testID="account-licence">
                                    <SectionLabel>{t('account.licence')}</SectionLabel>
                                    <Body fontFamily="$mono" fontSize={15} fontWeight="600" selectable>
                                        {licence}
                                    </Body>
                                    {driver.license_expiry ? <Secondary fontSize={13}>{t('account.licenceExpires', { date: driver.license_expiry })}</Secondary> : null}
                                </YStack>
                            ) : null}
                        </Card>
                    ) : null}

                    {documentsOutstanding && documents ? (
                        <Card
                            tone="warning"
                            gap={4}
                            onPress={onNavigate ? () => onNavigate('Documents') : undefined}
                            pressStyle={onNavigate ? { opacity: 0.8 } : undefined}
                            accessibilityRole="button"
                            testID="account-documents-notice"
                        >
                            <XStack alignItems="center" gap={space[2]}>
                                <Body flex={1} fontSize={16} fontWeight="800" tone="warning">
                                    {t(documents.state === 'in_review' ? 'documents.notice.inReviewTitle' : 'documents.notice.neededTitle')}
                                </Body>
                                {onNavigate ? <Chevron /> : null}
                            </XStack>
                            <Secondary fontSize={14} lineHeight={20}>
                                {t(
                                    documents.state === 'in_review'
                                        ? documents.held
                                            ? 'documents.inReviewHeld'
                                            : 'documents.inReview'
                                        : documents.held
                                          ? 'documents.neededHeld'
                                          : 'documents.needed',
                                    { organization: organizationName ?? t('account.organization') }
                                )}
                            </Secondary>
                        </Card>
                    ) : null}

                    <Card
                        flexDirection="row"
                        alignItems="center"
                        gap={space[3]}
                        paddingVertical={space[3]}
                        onPress={canSwitch && onNavigate ? () => onNavigate('OrgSwitcher') : undefined}
                        pressStyle={canSwitch && onNavigate ? { opacity: 0.8 } : undefined}
                        accessibilityRole={canSwitch ? 'button' : 'text'}
                        testID="account-organization"
                    >
                        <Avatar url={organization?.logo_url} name={organizationName} size={40} square />
                        <YStack flex={1} gap={1} minWidth={0}>
                            <SectionLabel>{t('me.drivingFor')}</SectionLabel>
                            <Body fontSize={16} fontWeight="800" numberOfLines={1}>
                                {organizationName ?? t('account.unknownOrganization')}
                            </Body>
                        </YStack>
                        {/* One organisation is not a choice, so nothing is offered. */}
                        {canSwitch && onNavigate ? (
                            <Body fontSize={13} fontWeight="800" tone="brand" numberOfLines={1} testID="switch-organization">
                                {t('account.switch')}
                            </Body>
                        ) : null}
                    </Card>

                    {has('MyVehicle') ? (
                        <Card
                            flexDirection="row"
                            alignItems="center"
                            gap={space[3]}
                            padding={space[3]}
                            onPress={onNavigate ? () => onNavigate('MyVehicle') : undefined}
                            pressStyle={onNavigate ? { opacity: 0.8 } : undefined}
                            accessibilityRole="button"
                            testID="account-vehicle"
                        >
                            {vehiclePhoto ? (
                                <Image source={{ uri: vehiclePhoto }} style={{ width: 96, height: 72, borderRadius: 12 }} accessibilityIgnoresInvertColors testID="account-vehicle-photo" />
                            ) : (
                                <YStack width={56} height={56} borderRadius={14} backgroundColor="$surfaceRaised" alignItems="center" justifyContent="center">
                                    <Icon name="vehicle" size={26} />
                                </YStack>
                            )}
                            <YStack flex={1} gap={4} minWidth={0}>
                                <SectionLabel>{t('account.myVehicle')}</SectionLabel>
                                {vehicle?.name || vehicleDetail ? (
                                    <Body fontSize={17} fontWeight="800" numberOfLines={1}>
                                        {vehicle?.name ?? vehicleDetail}
                                    </Body>
                                ) : (
                                    <Body fontSize={16} fontWeight="700" tone="secondary" testID="no-vehicle">
                                        {t('account.noVehicle')}
                                    </Body>
                                )}
                                {vehicle?.plate_number ? <Plate value={vehicle.plate_number} testID="account-vehicle-plate" /> : null}
                                {vehicle?.name && vehicleDetail && vehicleDetail !== vehicle.name && !vehicle?.plate_number ? <Secondary fontSize={13}>{vehicleDetail}</Secondary> : null}
                            </YStack>
                            {onNavigate ? <Chevron /> : null}
                        </Card>
                    ) : null}
                </>
            )}

            <Card flush testID="account-links">
                {rows.map((link, i) => {
                    const { value, tone } = valueFor(link.route);
                    return (
                        <MenuRow
                            key={link.route}
                            first={i === 0}
                            icon={link.icon}
                            label={t(link.labelKey)}
                            value={value}
                            valueTone={tone}
                            onPress={onNavigate ? () => onNavigate(link.route) : undefined}
                            testID={`link-${link.route}`}
                        />
                    );
                })}
            </Card>

            {/*
              * The confirmation replaces the button rather than following it.
              * Rendered underneath, it landed below the fold at the end of a
              * scrolling screen: the driver tapped Sign out, saw nothing move,
              * and had no reason to think anything had happened.
              */}
            {onSignOut && !confirmingSignOut ? (
                <BigButton variant="destructive" height={52} backgroundColor="$transparent" onPress={() => setConfirmingSignOut(true)} testID="sign-out">
                    {t('account.signOut')}
                </BigButton>
            ) : null}

            {onSignOut && confirmingSignOut ? (
                /*
                 * Gap spec H4. Signing out clears the token but leaves queued
                 * work on the device, and that work can only ever be sent by
                 * the driver who created it — so it has to be named before it
                 * is stranded, with the count, not a vague "unsaved changes".
                 */
                <Card gap={space[3]} testID="sign-out-confirm">
                    <Body fontSize={17} fontWeight="800">
                        {t('account.signOutTitle')}
                    </Body>
                    <Secondary fontSize={14} lineHeight={20}>
                        {waiting > 0 ? t('account.signOutWithQueued', { count: waiting }) : t('account.signOutBody')}
                    </Secondary>
                    <XStack gap={space[2]}>
                        <Button flex={1} height={52} borderRadius={ACTION_RADIUS} variant="secondary" onPress={() => setConfirmingSignOut(false)} testID="sign-out-cancel">
                            {t('common.cancel')}
                        </Button>
                        <Button flex={1} height={52} borderRadius={ACTION_RADIUS} variant="destructive" onPress={onSignOut} testID="sign-out-confirm-yes">
                            {t('account.signOutConfirm')}
                        </Button>
                    </XStack>
                </Card>
            ) : null}

            {appVersion || host ? (
                <Secondary fontSize={12} center tabular testID="account-version">
                    {[appVersion ? t('me.version', { version: appVersion }) : undefined, host ? t('me.connectedTo', { host: host.replace(/^https?:\/\//, '') }) : undefined].filter(Boolean).join(' · ')}
                </Secondary>
            ) : null}
        </ScrollView>
    );
}

export default AccountScreen;
