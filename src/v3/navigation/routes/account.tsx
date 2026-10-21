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
import { useFleetbase } from '../../api';
import { useDriver } from '../../data';
import { useDriverId, useFeatures, useFocusCount, useOrganization, useSignOut, type Nav } from '../session';

export { SettingsScreen as Settings };

/* -- Not enabled yet: honest states, not build-time placeholders. --------- */

export function Documents() {
    return <NotEnabledScreen feature="documents" />;
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
    return (
        <AccountScreen
            driverId={driverId}
            reloadToken={reloadToken}
            features={useFeatures()}
            onNavigate={(route) => navigation.navigate(route, {})}
            onSignOut={signOut}
        />
    );
}

export function ProfileEdit({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    return <ProfileEditScreen driverId={driverId} driver={driver} onSaved={navigation.goBack} onCancel={navigation.goBack} />;
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
    // The native build's version, not package.json's — a bug report has to name
    // the binary the driver is actually running.
    const appVersion = `${getVersion()} (${getBuildNumber()})`;
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
    return <SyncQueueScreen />;
}
