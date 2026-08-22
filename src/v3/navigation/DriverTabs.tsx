/**
 * The v3 tab graph.
 *
 * Structure change from v2: Dash → **Today**, a new **Route** tab (manifests),
 * Chat → **Inbox** (which absorbs the notification list), and Reports folds into
 * **Account** as Fuel log and Issues & defects. Five tabs, same as v2, but the
 * one that was a debug readout is now the home surface and the one that held two
 * report lists is now a real destination.
 *
 * Uses the dynamic navigator API with a custom tab bar. The static API pushed v2
 * into calling hooks from `options` callbacks to get badge counts; a custom bar
 * lets those subscriptions live in a component instead.
 *
 * **Every screen component here is declared at module scope, and nothing is
 * passed to one as a prop.** `component={...}` is identity-compared: a component
 * created during render — `const Orders = () => <OrdersStack driverId={id} />`,
 * or `component={placeholder('Today', P3)}` — is a new type on every parent
 * render, so React unmounts and remounts the entire screen subtree each time.
 * That is invisible in a screenshot but fatal in the hand: scroll position
 * resets, a focused text field loses the keyboard, and a touch that began before
 * the remount never lands. It made the whole content area appear dead to touch
 * while the header and tab bar — which are not remounted — kept working.
 *
 * Screen-scoped values therefore travel by context (`DriverIdContext`), never by
 * closing over a prop.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { YStack } from 'tamagui';
import { ScreenHeader } from '../ui/ScreenHeader';
import { useTranslation } from '../i18n/useTranslation';
import { placeholder } from '../screens/Placeholder';
import SettingsScreen from '../screens/SettingsScreen';
import HelpScreen from '../screens/HelpScreen';
import ProofCaptureScreen from '../screens/ProofCaptureScreen';
import MyVehicleScreen from '../screens/MyVehicleScreen';
import DestinationScreen from '../screens/DestinationScreen';
import { vehicleOf } from '../data';
import { getVersion, getBuildNumber } from 'react-native-device-info';
import { useFleetbase } from '../api';
import OrdersScreen from '../screens/OrdersScreen';
import OrderDetailScreen from '../screens/OrderDetailScreen';
import EditPayloadItemScreen from '../screens/EditPayloadItemScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import OrderTimelineScreen from '../screens/OrderTimelineScreen';
import FuelLogScreen from '../screens/FuelLogScreen';
import FuelReportScreen from '../screens/FuelReportScreen';
import FuelReportCreateScreen from '../screens/FuelReportCreateScreen';
import IssuesScreen from '../screens/IssuesScreen';
import IssueDetailScreen from '../screens/IssueDetailScreen';
import IssueCreateScreen from '../screens/IssueCreateScreen';
import AccountScreen from '../screens/AccountScreen';
import OrgSwitcherScreen from '../screens/OrgSwitcherScreen';
import ProfileEditScreen from '../screens/ProfileEditScreen';
import NavigationHandoffScreen from '../screens/NavigationHandoffScreen';
import PermissionsPrimerScreen from '../screens/PermissionsPrimerScreen';
import SyncQueueScreen from '../screens/SyncQueueScreen';
import TodayScreen from '../screens/TodayScreen';
import InboxScreen from '../screens/InboxScreen';
import ConversationScreen from '../screens/ConversationScreen';
import NewConversationScreen from '../screens/NewConversationScreen';
import { useDriver } from '../data';
import type { FuelReportRecord, IssueRecord, ChatChannelRecord } from '../data';
import { TabBar, type TabBadges } from './TabBar';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const P4 = 'Phase 4b';

const MANIFESTS = 'driver-scoped manifest endpoints (Phase 4a)';

const screenOptions = { headerShown: false } as const;
const modalOptions = { presentation: 'modal' } as const;

/**
 * Wraps a pushed screen with our own title bar and back control.
 *
 * Every route was `headerShown: false`, so a driver who tapped into a fuel
 * report, an issue, an item or the sync queue had no title telling them where
 * they were and no visible way back — only the iOS edge-swipe, which is
 * invisible and unusable with gloves on.
 *
 * The header is composed *inside* the screen rather than passed as the
 * navigator's `header` option, which was the first attempt: react-native-screens
 * hosts a custom header in its own native subtree, outside the Tamagui
 * provider, and every themed component in it threw "No theme and no parent?".
 * A wrapper keeps the header in the same tree as the screen it belongs to, and
 * the shell's own header stays where it is, above the navigator.
 */
function withHeader<P extends object>(titleKey: string, Screen: React.ComponentType<P>) {
    function Headered(props: P & { navigation?: { goBack: () => void; canGoBack?: () => boolean } }) {
        const { t } = useTranslation();
        const nav = props.navigation;
        const canGoBack = nav?.canGoBack ? nav.canGoBack() : Boolean(nav);
        return (
            <YStack flex={1} backgroundColor="$background">
                <ScreenHeader title={t(titleKey)} onBack={canGoBack && nav ? () => nav.goBack() : undefined} />
                <Screen {...(props as P)} />
            </YStack>
        );
    }
    Headered.displayName = `withHeader(${titleKey})`;
    return Headered;
}

/** The signed-in driver's public id, for screens that scope a query by it. */
const DriverIdContext = createContext<string | undefined>(undefined);
export const useDriverId = () => useContext(DriverIdContext);

/** The driver's *user* id — chat identifies people by user, not by driver. */
const DriverUserIdContext = createContext<string | undefined>(undefined);
export const useDriverUserId = () => useContext(DriverUserIdContext);

/** Explicit sign-out, handed down from the host app. */
const SignOutContext = createContext<(() => void) | undefined>(undefined);
export const useSignOut = () => useContext(SignOutContext);

/** Current organisation, and the host's handler for a completed switch. */
const OrganizationContext = createContext<{ id?: string; onSwitched?: (driver: unknown) => void }>({});
export const useOrganization = () => useContext(OrganizationContext);

/* -- Placeholders, built once. ------------------------------------------- */
const RouteHome = placeholder('Route', P4, MANIFESTS);
const StopDetail = placeholder('Stop detail', P4, MANIFESTS);
const StopExecution = placeholder('Stop execution', P4, 'order-config proof declarations (Phase 4a)');
const OptimisePreview = placeholder('Optimise route', P4, 'driver-scoped optimise endpoint (Phase 4a)');
const Inspection = placeholder('Vehicle inspection', P4, 'inspection endpoints + design round 2');
const Documents = placeholder('My documents', P4, 'driver document endpoints (Phase 5)');

/* -- Orders tab. ---------------------------------------------------------- */

type Nav = { navigate: (route: string, params?: object) => void; goBack: () => void };

function OrdersHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    return <OrdersScreen driverId={driverId} onOpenOrder={(orderId) => navigation.navigate('OrderDetail', { orderId })} />;
}

function OrderDetail({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    return (
        <OrderDetailScreen
            orderId={String(route.params?.orderId ?? '')}
            onOpenEntity={({ id, entity }) =>
                navigation.navigate('EntityDetail', { orderId: route.params?.orderId, entityId: id, entity })
            }
            onNavigate={(destination: object) => navigation.navigate('NavigationHandoff', { destination })}
            onOpenTimeline={() => navigation.navigate('OrderTimeline', { orderId: route.params?.orderId })}
            onCaptureProof={(request) => navigation.navigate('ProofCapture', request)}
            onChangeDestination={() => navigation.navigate('Destination', { orderId: route.params?.orderId })}
        />
    );
}

function EntityDetail({
    route,
    navigation,
}: {
    route: { params?: { orderId?: string; entityId?: string; entity?: Record<string, unknown> } };
    navigation: Nav;
}) {
    return (
        <ItemDetailScreen
            entityId={route.params?.entityId}
            entity={route.params?.entity}
            onBack={navigation.goBack}
            onEdit={(entity) => navigation.navigate('EditPayloadItem', { orderId: route.params?.orderId, entity })}
        />
    );
}

function OrderTimeline({ route }: { route: { params?: { orderId?: string } } }) {
    return <OrderTimelineScreen orderId={String(route.params?.orderId ?? '')} />;
}

function NavigationHandoff({
    route,
    navigation,
}: {
    route: { params?: { destination?: { latitude: number; longitude: number; label?: string } } };
    navigation: Nav;
}) {
    return <NavigationHandoffScreen destination={route.params?.destination} onDone={navigation.goBack} />;
}

function EditPayloadItem({
    route,
    navigation,
}: {
    route: { params?: { orderId?: string; entity?: { id: string } } };
    navigation: Nav;
}) {
    return (
        <EditPayloadItemScreen
            orderId={String(route.params?.orderId ?? '')}
            entity={route.params?.entity ?? { id: '' }}
            onDone={navigation.goBack}
        />
    );
}

/* -- Account: fuel log. ---------------------------------------------------- */

/**
 * Counts arrivals at a screen, so it can refetch on return without knowing
 * anything about navigation. Incremented in an effect rather than during
 * render — a ref bumped mid-render is a side effect, and double-counts.
 */
function useFocusCount(): number {
    const isFocused = useIsFocused();
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (isFocused) setCount((n) => n + 1);
    }, [isFocused]);
    return count;
}

function FuelLog({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <FuelLogScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenReport={({ report, previous }) => navigation.navigate('FuelReport', { report, previous })}
            onCreate={() => navigation.navigate('FuelReportCreate', {})}
        />
    );
}

function FuelReport({ route }: { route: { params?: { report?: FuelReportRecord; previous?: FuelReportRecord } } }) {
    const report = route.params?.report;
    if (!report) return null;
    return <FuelReportScreen report={report} previous={route.params?.previous} />;
}

function FuelReportCreate({ route, navigation }: { route: { params?: { last?: FuelReportRecord; currency?: string } }; navigation: Nav }) {
    const driverId = useDriverId();
    return (
        <FuelReportCreateScreen
            driverId={driverId}
            lastReport={route.params?.last}
            currency={route.params?.currency}
            onDone={() => navigation.goBack()}
        />
    );
}

/* -- Account: issues. ------------------------------------------------------ */

function Issues({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <IssuesScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenIssue={(issue) => navigation.navigate('IssueDetail', { issue })}
            onCreate={() => navigation.navigate('IssueCreate', {})}
        />
    );
}

function IssueDetail({ route }: { route: { params?: { issue?: IssueRecord } } }) {
    const issue = route.params?.issue;
    if (!issue) return null;
    return <IssueDetailScreen issue={issue} />;
}

function IssueCreate({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    return <IssueCreateScreen driverId={driverId} onDone={() => navigation.goBack()} />;
}

/* -- Account. -------------------------------------------------------------- */

function AccountHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    const signOut = useSignOut();
    return (
        <AccountScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onNavigate={(route) => navigation.navigate(route, {})}
            onSignOut={signOut}
        />
    );
}

function TodayHome({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <TodayScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenOrder={(orderId) => navigation.navigate('Orders', { screen: 'OrderDetail', params: { orderId } })}
            onNavigate={(destination) => navigation.navigate('NavigationHandoff', { destination })}
        />
    );
}

function SyncQueue() {
    return <SyncQueueScreen />;
}

function PermissionsPrimer({ navigation }: { navigation: Nav }) {
    return <PermissionsPrimerScreen onDone={navigation.goBack} />;
}

function ProfileEdit({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    return <ProfileEditScreen driverId={driverId} driver={driver} onSaved={navigation.goBack} onCancel={navigation.goBack} />;
}

function OrgSwitcher({ navigation }: { navigation: Nav }) {
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

/* -- Inbox. ---------------------------------------------------------------- */

function InboxHome({ navigation }: { navigation: Nav }) {
    const userId = useDriverUserId();
    const reloadToken = useFocusCount();
    return (
        <InboxScreen
            userId={userId}
            reloadToken={reloadToken}
            onOpenChannel={(channel) => navigation.navigate('Conversation', { channel })}
            onCompose={() => navigation.navigate('NewConversation', {})}
        />
    );
}

function Conversation({ route }: { route: { params?: { channel?: ChatChannelRecord } } }) {
    const userId = useDriverUserId();
    const channel = route.params?.channel;
    return <ConversationScreen channelId={channel?.id} channel={channel} userId={userId} />;
}

function NewConversation({ navigation }: { navigation: Nav }) {
    const userId = useDriverUserId();
    return (
        <NewConversationScreen
            userId={userId}
            onCancel={navigation.goBack}
            // Replace, so Back from the new conversation returns to the inbox
            // rather than to the picker that created it.
            onCreated={(channel) => navigation.navigate('Conversation', { channel })}
        />
    );
}

/* -- Stacks. -------------------------------------------------------------- */

function Help({ navigation }: { navigation: Nav }) {
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

function ProofCapture({ route, navigation }: { route: { params?: { orderId?: string; activityCode?: string; activityLabel?: string; podMethod?: string | null; expected?: string[] } }; navigation: Nav }) {
    const p = route.params ?? {};
    return (
        <ProofCaptureScreen
            orderId={p.orderId ?? ''}
            activityCode={p.activityCode ?? ''}
            activityLabel={p.activityLabel ?? ''}
            podMethod={p.podMethod}
            expected={p.expected}
            // Back to the order once the proof is captured or queued — the
            // activity advance is the driver's next tap, and it is now unblocked.
            onCaptured={() => navigation.goBack()}
            onCancel={() => navigation.goBack()}
        />
    );
}

function MyVehicle() {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    // The driver record already carries the assignment; the screen fetches the
    // full vehicle from it rather than asking dispatch what is assigned.
    const vehicle = vehicleOf(driver);
    return <MyVehicleScreen vehicleId={vehicle?.id} />;
}

function Destination({ route, navigation }: { route: { params?: { orderId?: string } }; navigation: Nav }) {
    return <DestinationScreen orderId={String(route.params?.orderId ?? '')} onDone={() => navigation.goBack()} />;
}

/* Header-wrapped screens. Declared once at module scope so the component
   identity is stable — an inline wrapper would remount on every render. */
const NavigationHandoffH = withHeader('nav.navigationHandoff', NavigationHandoff);
const StopDetailH = withHeader('nav.stopDetail', StopDetail);
const StopExecutionH = withHeader('nav.stopExecution', StopExecution);
const OptimisePreviewH = withHeader('nav.optimisePreview', OptimisePreview);
const OrderDetailH = withHeader('nav.orderDetail', OrderDetail);
const EntityDetailH = withHeader('nav.itemDetail', EntityDetail);
const OrderTimelineH = withHeader('nav.orderTimeline', OrderTimeline);
const ConversationH = withHeader('nav.conversation', Conversation);
const NewConversationH = withHeader('nav.newConversation', NewConversation);
const FuelLogH = withHeader('nav.fuelLog', FuelLog);
const FuelReportH = withHeader('nav.fuelReport', FuelReport);
const IssuesH = withHeader('nav.issues', Issues);
const IssueDetailH = withHeader('nav.issueDetail', IssueDetail);
const IssueCreateH = withHeader('nav.issueCreate', IssueCreate);
const MyVehicleH = withHeader('nav.myVehicle', MyVehicle);
const InspectionH = withHeader('nav.inspection', Inspection);
const DocumentsH = withHeader('nav.documents', Documents);
const ProfileEditH = withHeader('nav.profileEdit', ProfileEdit);
const PermissionsPrimerH = withHeader('nav.permissions', PermissionsPrimer);
const OrgSwitcherH = withHeader('nav.orgSwitcher', OrgSwitcher);
const SettingsScreenH = withHeader('nav.settings', SettingsScreen);
const HelpH = withHeader('nav.help', Help);
const ProofCaptureH = withHeader('nav.proofCapture', ProofCapture);
const DestinationH = withHeader('nav.destination', Destination);
const SyncQueueH = withHeader('nav.syncQueue', SyncQueue);
const EditPayloadItemH = withHeader('nav.editItem', EditPayloadItem);
const FuelReportCreateH = withHeader('nav.fuelReportCreate', FuelReportCreate);

function TodayStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="TodayHome" component={TodayHome} />
            {/* Registered here as well as under Orders — `navigate` resolves
                within the current stack, so a shared route needs both. */}
            <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
        </Stack.Navigator>
    );
}

function RouteStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="RouteHome" component={RouteHome} />
            <Stack.Screen name="StopDetail" component={StopDetailH} />
            <Stack.Screen name="StopExecution" component={StopExecutionH} />
            <Stack.Screen name="OptimisePreview" component={OptimisePreviewH} />
        </Stack.Navigator>
    );
}

function OrdersStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="OrdersHome" component={OrdersHome} />
            <Stack.Screen name="OrderDetail" component={OrderDetailH} />
            <Stack.Screen name="EditPayloadItem" component={EditPayloadItemH} options={modalOptions} />
            <Stack.Screen name="EntityDetail" component={EntityDetailH} />
            <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
            <Stack.Screen name="OrderTimeline" component={OrderTimelineH} />
            <Stack.Screen name="ProofCapture" component={ProofCaptureH} />
            <Stack.Screen name="Destination" component={DestinationH} />
        </Stack.Navigator>
    );
}

function InboxStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="InboxHome" component={InboxHome} />
            <Stack.Screen name="Conversation" component={ConversationH} />
            <Stack.Screen name="NewConversation" component={NewConversationH} />
        </Stack.Navigator>
    );
}

function AccountStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="AccountHome" component={AccountHome} />
            {/* Reports moved here from their own tab. */}
            <Stack.Screen name="FuelLog" component={FuelLogH} />
            <Stack.Screen name="FuelReport" component={FuelReportH} />
            <Stack.Screen name="FuelReportCreate" component={FuelReportCreateH} options={modalOptions} />
            <Stack.Screen name="Issues" component={IssuesH} />
            <Stack.Screen name="IssueDetail" component={IssueDetailH} />
            {/*
              * Pushed, not presented as a native modal. This screen's selects
              * open a bottom sheet through `MainPortal`, and that host lives
              * beside NavigationContainer — a native modal sits *above* it, so
              * the sheet would render behind the form and never be seen.
              */}
            <Stack.Screen name="IssueCreate" component={IssueCreateH} />
            <Stack.Screen name="MyVehicle" component={MyVehicleH} />
            <Stack.Screen name="Inspection" component={InspectionH} />
            <Stack.Screen name="Documents" component={DocumentsH} />
            <Stack.Screen name="ProfileEdit" component={ProfileEditH} />
            <Stack.Screen name="Permissions" component={PermissionsPrimerH} />
            <Stack.Screen name="OrgSwitcher" component={OrgSwitcherH} />
            <Stack.Screen name="Settings" component={SettingsScreenH} />
            <Stack.Screen name="Help" component={HelpH} />
            <Stack.Screen name="SyncQueue" component={SyncQueueH} />
        </Stack.Navigator>
    );
}

const TAB_OPTIONS = {
    Today: { tabBarLabel: 'Today' },
    Route: { tabBarLabel: 'Route' },
    Orders: { tabBarLabel: 'Orders' },
    Inbox: { tabBarLabel: 'Inbox' },
    Account: { tabBarLabel: 'Account' },
} as const;

export function DriverTabs({
    badges,
    driverId,
    driverUserId,
    onSignOut,
    organizationId,
    onOrganizationSwitched,
}: {
    badges?: TabBadges;
    driverId?: string;
    driverUserId?: string;
    onSignOut?: () => void;
    organizationId?: string;
    onOrganizationSwitched?: (driver: unknown) => void;
}) {
    // `tabBar` is a render prop, not `component`, so re-creating it re-renders
    // the bar rather than remounting it — which is why the badges may close
    // over `badges` while the screens above may not.
    const organizationValue = useMemo(
        () => ({ id: organizationId, onSwitched: onOrganizationSwitched }),
        [organizationId, onOrganizationSwitched]
    );

    const renderTabBar = useMemo(
        () =>
            function renderTabBar(props: React.ComponentProps<typeof TabBar>) {
                return <TabBar {...props} badges={badges} />;
            },
        [badges]
    );

    return (
        <DriverIdContext.Provider value={driverId}>
            <DriverUserIdContext.Provider value={driverUserId}>
                <SignOutContext.Provider value={onSignOut}>
                    <OrganizationContext.Provider value={organizationValue}>
            <Tab.Navigator
                // Options are static objects — no hooks, nothing recomputed per
                // navigation state change.
                screenOptions={screenOptions}
                tabBar={renderTabBar}
            >
                <Tab.Screen name="Today" component={TodayStack} options={TAB_OPTIONS.Today} />
                <Tab.Screen name="Route" component={RouteStack} options={TAB_OPTIONS.Route} />
                <Tab.Screen name="Orders" component={OrdersStack} options={TAB_OPTIONS.Orders} />
                <Tab.Screen name="Inbox" component={InboxStack} options={TAB_OPTIONS.Inbox} />
                <Tab.Screen name="Account" component={AccountStack} options={TAB_OPTIONS.Account} />
            </Tab.Navigator>
                    </OrganizationContext.Provider>
                </SignOutContext.Provider>
            </DriverUserIdContext.Provider>
        </DriverIdContext.Provider>
    );
}

export default DriverTabs;
