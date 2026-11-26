/** Account tab: the hub, profile, organisations, settings, help and sync queue. */
import { getVersion, getBuildNumber } from 'react-native-device-info';
import AccountScreen from '../../screens/AccountScreen';
import ProfileEditScreen from '../../screens/ProfileEditScreen';
import OrgSwitcherScreen from '../../screens/OrgSwitcherScreen';
import SettingsScreen from '../../screens/SettingsScreen';
import HelpScreen from '../../screens/HelpScreen';
import SyncQueueScreen from '../../screens/SyncQueueScreen';
import NotEnabledScreen from '../../screens/NotEnabledScreen';
import EarningsScreen from '../../screens/EarningsScreen';
import DocumentsScreen from '../../screens/DocumentsScreen';
import { useFleetbase } from '../../api';
import { useCurrentOrganization, useDriver } from '../../data';
import { useDriverId, useFeatures, useFocusCount, useOrganization, useSignOut, type Nav } from '../session';

/** The native build's version, not package.json's — a bug report has to name the binary the driver is actually running. */
const buildVersion = () => `${getVersion()} (${getBuildNumber()})`;

export function Settings({ navigation }: { navigation: Nav }) {
    const signOut = useSignOut();
    return (
        <SettingsScreen
            appVersion={buildVersion()}
            // The diagnostics go out with a written report, from Help, where the
            // driver can read what is attached before sending it.
            onSendDiagnostics={() => navigation.navigate('Help', {})}
            onSignOut={signOut}
        />
    );
}

/* -- Not enabled yet: honest states, not build-time placeholders. --------- */

export function Documents() {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    const { organization } = useCurrentOrganization(reloadToken);
    return <DocumentsScreen driverId={driverId} organizationName={organization?.name} reloadToken={reloadToken} />;
}

export function Earnings() {
    const { earnings } = useFeatures();
    const reloadToken = useFocusCount();
    return earnings ? <EarningsScreen reloadToken={reloadToken} /> : <NotEnabledScreen feature="earnings" />;
}

export function AccountHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    const signOut = useSignOut();
    const { adapter } = useFleetbase();
    return (
        <AccountScreen
            driverId={driverId}
            reloadToken={reloadToken}
            features={useFeatures()}
            appVersion={buildVersion()}
            host={adapter.host}
            onNavigate={(route) => navigation.navigate(route, {})}
            onSignOut={signOut}
        />
    );
}

export function ProfileEdit({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    const { onSwitched } = useOrganization();
    return (
        <ProfileEditScreen
            driverId={driverId}
            driver={driver}
            onSaved={navigation.goBack}
            onCancel={navigation.goBack}
            // A password change answers with a new token and kills the old one.
            // The host owns the session, and takes a driver carrying its token —
            // the same hand-over an organisation switch makes.
            onNewToken={onSwitched && driver ? (token) => onSwitched({ ...driver, token }) : undefined}
        />
    );
}

export function OrgSwitcher({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { id, onSwitched } = useOrganization();
    return (
        <OrgSwitcherScreen
            driverId={driverId}
            currentOrganizationId={id}
            onSwitched={(driver) => {
                onSwitched?.(driver);
                navigation.goBack();
            }}
            onDone={navigation.goBack}
        />
    );
}

export function Help({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { adapter } = useFleetbase();
    const appVersion = buildVersion();
    return (
        <HelpScreen
            driverId={driverId}
            appVersion={appVersion}
            host={adapter.host}
            // Dispatch is reached through the Inbox — there is no separate
            // support channel in FleetOps, and inventing one would put driver
            // questions somewhere nobody reads.
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation' })}
        />
    );
}

export function SyncQueue() {
    // The provider's queue — the same one Me counts from — not the module default.
    const { queue } = useFleetbase();
    return <SyncQueueScreen queue={queue} />;
}
