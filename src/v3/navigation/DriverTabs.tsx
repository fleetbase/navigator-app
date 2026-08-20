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
 */
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { placeholder } from '../screens/Placeholder';
import SettingsScreen from '../screens/SettingsScreen';
import { TabBar, type TabBadges } from './TabBar';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Screens are built in Phase 3 (today's API) and Phase 4b (after the backend work). */
const P3 = 'Phase 3';
const P4 = 'Phase 4b';

const MANIFESTS = 'driver-scoped manifest endpoints (Phase 4a)';
const SHIFTS = 'shift + HOS endpoints (Phase 4a)';

const screenOptions = { headerShown: false } as const;

function TodayStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="TodayHome" component={placeholder('Today', P3, `${SHIFTS} for the HOS and break cards`)} />
        </Stack.Navigator>
    );
}

function RouteStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="RouteHome" component={placeholder('Route', P4, MANIFESTS)} />
            <Stack.Screen name="StopDetail" component={placeholder('Stop detail', P4, MANIFESTS)} />
            <Stack.Screen name="StopExecution" component={placeholder('Stop execution', P4, 'order-config proof declarations (Phase 4a)')} />
            <Stack.Screen name="OptimisePreview" component={placeholder('Optimise route', P4, 'driver-scoped optimise endpoint (Phase 4a)')} />
        </Stack.Navigator>
    );
}

function OrdersStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="OrdersHome" component={placeholder('Orders', P3)} />
            <Stack.Screen name="OrderDetail" component={placeholder('Order detail', P3)} />
            <Stack.Screen name="EditPayloadItem" component={placeholder('Edit item', P3)} />
            <Stack.Screen name="EntityDetail" component={placeholder('Item detail', P3)} />
        </Stack.Navigator>
    );
}

function InboxStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="InboxHome" component={placeholder('Inbox', P3)} />
            <Stack.Screen name="Conversation" component={placeholder('Conversation', P3)} />
            <Stack.Screen name="NewConversation" component={placeholder('New conversation', P3)} />
        </Stack.Navigator>
    );
}

function AccountStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="AccountHome" component={placeholder('Account', P3)} />
            {/* Reports moved here from their own tab. */}
            <Stack.Screen name="FuelLog" component={placeholder('Fuel log', P3)} />
            <Stack.Screen name="Issues" component={placeholder('Issues & defects', P3)} />
            <Stack.Screen name="MyVehicle" component={placeholder('My vehicle', P4, 'assign-vehicle + odometer endpoints (Phase 4a)')} />
            <Stack.Screen name="Inspection" component={placeholder('Vehicle inspection', P4, 'inspection endpoints + design round 2')} />
            <Stack.Screen name="Documents" component={placeholder('My documents', P4, 'driver document endpoints (Phase 5)')} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="SyncQueue" component={placeholder('Sync queue', P3, 'design round 2')} />
        </Stack.Navigator>
    );
}

export function DriverTabs({ badges }: { badges?: TabBadges }) {
    return (
        <Tab.Navigator
            // Options are static objects — no hooks, nothing recomputed per
            // navigation state change.
            screenOptions={{ headerShown: false }}
            tabBar={(props) => <TabBar {...props} badges={badges} />}
        >
            <Tab.Screen name="Today" component={TodayStack} options={{ tabBarLabel: 'Today' }} />
            <Tab.Screen name="Route" component={RouteStack} options={{ tabBarLabel: 'Route' }} />
            <Tab.Screen name="Orders" component={OrdersStack} options={{ tabBarLabel: 'Orders' }} />
            <Tab.Screen name="Inbox" component={InboxStack} options={{ tabBarLabel: 'Inbox' }} />
            <Tab.Screen name="Account" component={AccountStack} options={{ tabBarLabel: 'Account' }} />
        </Tab.Navigator>
    );
}

export default DriverTabs;
