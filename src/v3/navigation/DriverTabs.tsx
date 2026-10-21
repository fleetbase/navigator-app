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
import { useEffect, useMemo } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useChatChannels, useChatUnreadTotal, setChatUnreadTotal } from '../data';
import {
    useDriverChannel,
    useChatChannelSubscriptions,
    usePushSubscribe,
    parsePush,
    pushToEvent,
    destinationOf,
    applyRealtimeEvent,
} from '../realtime';
import { openConversation, openOrder, openOrdersList } from './navigationRef';
import { TabBar, type TabBadges } from './TabBar';
import { tabIcons, type TabIconName } from '../ui/Icon';
import { withHeader } from './withHeader';
import { PermissionsPrimer } from './routes/fixed';
import {
    DriverIdContext,
    DriverUserIdContext,
    FeaturesContext,
    OrganizationContext,
    SignOutContext,
    type Features,
} from './session';
import { screenSlot } from '../extensions/screens/screen-slot';
import { AppScreenRegistryProvider } from '../extensions/app-screen-registry';
import { customRoutesFor, orderTabs, routeComponent, type CustomTab, type StackRoute } from '../extensions/navigation';
import { customNavigation } from '../extensions/build-navigation';
import { CORE_TABS, type CoreTab } from '../extensions/tabs';
import { getBuildBranding } from '../branding/build-branding';

// Session values and shared route hooks live in ./session; re-exported so
// existing imports of them from here keep working.
export { useDriverId, useDriverUserId, useSignOut, useFeatures, useOrganization, useHandoffDestination, type Features } from './session';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = { headerShown: false } as const;
const modalOptions = { presentation: 'modal' } as const;

/*
 * Every overridable screen is a slot (src/v3/extensions): the navigator names a
 * stable screen id, and the registry renders the default, a client override or a
 * selected variant. Declared once at module scope so the component identity is
 * stable — an inline wrapper would remount on every render. Header-wrapped
 * screens wrap the *slot*, so an override keeps the title bar and back control.
 */
const TodayHome = screenSlot('today.home');
const RouteHome = screenSlot('route.home');
const OrdersHome = screenSlot('orders.list');
const InboxHome = screenSlot('inbox.list');
const AccountHome = screenSlot('account.home');

const NavigationHandoffH = withHeader('nav.navigationHandoff', screenSlot('navigation.handoff'));
const StopDetailH = withHeader('nav.stopDetail', screenSlot('route.stopDetail'));
const StopExecutionH = withHeader('nav.stopExecution', screenSlot('route.stopExecution'));
const OptimisePreviewH = withHeader('nav.optimisePreview', screenSlot('route.optimise'));
const OrderDetailH = withHeader('nav.orderDetail', screenSlot('order.detail'));
const EntityDetailH = withHeader('nav.itemDetail', screenSlot('order.entityDetail'));
const OrderTimelineH = withHeader('nav.orderTimeline', screenSlot('order.timeline'));
const ConversationH = withHeader('nav.conversation', screenSlot('inbox.conversation'));
const NewConversationH = withHeader('nav.newConversation', screenSlot('inbox.newConversation'));
const FuelLogH = withHeader('nav.fuelLog', screenSlot('fuel.log'));
const FuelReportH = withHeader('nav.fuelReport', screenSlot('fuel.report'));
const IssuesH = withHeader('nav.issues', screenSlot('issues.list'));
const IssueDetailH = withHeader('nav.issueDetail', screenSlot('issues.detail'));
const IssueCreateH = withHeader('nav.issueCreate', screenSlot('issues.create'));
const MyVehicleH = withHeader('nav.myVehicle', screenSlot('vehicle.mine'));
const TrailerDetailH = withHeader('nav.trailerDetail', screenSlot('vehicle.trailer'));
const InspectionH = withHeader('nav.inspection', screenSlot('inspection.start'));
const InspectionChecklistH = withHeader('nav.inspectionChecklist', screenSlot('inspection.checklist'));
const InspectionReviewH = withHeader('nav.inspectionReview', screenSlot('inspection.review'));
const InspectionResultH = withHeader('nav.inspectionResult', screenSlot('inspection.result'));
const InspectionDetailH = withHeader('nav.inspectionDetail', screenSlot('inspection.detail'));
const DocumentsH = withHeader('nav.documents', screenSlot('account.documents'));
const EarningsH = withHeader('nav.earnings', screenSlot('account.earnings'));
const ProfileEditH = withHeader('nav.profileEdit', screenSlot('account.profile'));
// Not a slot: the permissions primer carries the store-mandated location disclosure.
const PermissionsPrimerH = withHeader('nav.permissions', PermissionsPrimer);
const OrgSwitcherH = withHeader('nav.orgSwitcher', screenSlot('account.orgSwitcher'));
const SettingsScreenH = withHeader('nav.settings', screenSlot('account.settings'));
const HelpH = withHeader('nav.help', screenSlot('account.help'));
const ProofCaptureH = withHeader('nav.proofCapture', screenSlot('order.proof'));
const DestinationH = withHeader('nav.destination', screenSlot('order.destination'));
const ChangeVehicleH = withHeader('nav.changeVehicle', screenSlot('vehicle.change'));
const OffersH = withHeader('nav.offers', screenSlot('offers.list'));
const SyncQueueH = withHeader('nav.syncQueue', screenSlot('account.syncQueue'));
const EditPayloadItemH = withHeader('nav.editItem', screenSlot('order.editPayloadItem'));
const FuelReportCreateH = withHeader('nav.fuelReportCreate', screenSlot('fuel.create'));

/** A build's custom routes, per stack (src/v3/extensions/navigation.tsx). */
const customRoutes = (stack: string): StackRoute[] => customRoutesFor(stack, customNavigation.routes);
const TODAY_ROUTES = customRoutes('Today');
const ROUTE_ROUTES = customRoutes('Route');
const ORDERS_ROUTES = customRoutes('Orders');
const INBOX_ROUTES = customRoutes('Inbox');
const ACCOUNT_ROUTES = customRoutes('Account');

function TodayStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="TodayHome" component={TodayHome} />
            {/* Registered here as well as under Orders — `navigate` resolves
                within the current stack, so a shared route needs both. */}
            <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
            {TODAY_ROUTES.map((route) => (
                <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
            ))}
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
            {/* Shared with Today and Orders — `navigate` resolves within the stack. */}
            <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
            {ROUTE_ROUTES.map((route) => (
                <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
            ))}
        </Stack.Navigator>
    );
}

function OrdersStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="OrdersHome" component={OrdersHome} />
            <Stack.Screen name="OrderDetail" component={OrderDetailH} />
            <Stack.Screen name="Offers" component={OffersH} />
            <Stack.Screen name="EditPayloadItem" component={EditPayloadItemH} options={modalOptions} />
            <Stack.Screen name="EntityDetail" component={EntityDetailH} />
            <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
            <Stack.Screen name="OrderTimeline" component={OrderTimelineH} />
            <Stack.Screen name="ProofCapture" component={ProofCaptureH} />
            <Stack.Screen name="Destination" component={DestinationH} />
            {ORDERS_ROUTES.map((route) => (
                <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
            ))}
        </Stack.Navigator>
    );
}

function InboxStack() {
    return (
        <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="InboxHome" component={InboxHome} />
            <Stack.Screen name="Conversation" component={ConversationH} />
            <Stack.Screen name="NewConversation" component={NewConversationH} />
            {INBOX_ROUTES.map((route) => (
                <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
            ))}
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
            <Stack.Screen name="TrailerDetail" component={TrailerDetailH} />
            <Stack.Screen name="ChangeVehicle" component={ChangeVehicleH} />
            <Stack.Screen name="Inspection" component={InspectionH} />
            <Stack.Screen name="InspectionChecklist" component={InspectionChecklistH} />
            <Stack.Screen name="InspectionReview" component={InspectionReviewH} />
            <Stack.Screen name="InspectionResult" component={InspectionResultH} />
            <Stack.Screen name="InspectionDetail" component={InspectionDetailH} />
            <Stack.Screen name="Documents" component={DocumentsH} />
            <Stack.Screen name="Earnings" component={EarningsH} />
            <Stack.Screen name="ProfileEdit" component={ProfileEditH} />
            <Stack.Screen name="Permissions" component={PermissionsPrimerH} />
            <Stack.Screen name="OrgSwitcher" component={OrgSwitcherH} />
            <Stack.Screen name="Settings" component={SettingsScreenH} />
            <Stack.Screen name="Help" component={HelpH} />
            <Stack.Screen name="SyncQueue" component={SyncQueueH} />
            {ACCOUNT_ROUTES.map((route) => (
                <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
            ))}
        </Stack.Navigator>
    );
}

/**
 * The stack behind a custom tab: its own route first, then the build's other
 * routes for that tab, and the hand-off every tab that starts a drive needs.
 * Built once per tab at module scope, so its identity is stable.
 */
function customTabStack(name: string, tab: CustomTab) {
    // The tab's own route always opens it, whatever that route's `tabs` say.
    const initial: StackRoute = { name: tab.initialRoute, component: routeComponent(tab.initialRoute, customNavigation.routes[tab.initialRoute]) };
    const others = customRoutes(name).filter((route) => route.name !== tab.initialRoute);
    function CustomTabStack() {
        return (
            <Stack.Navigator screenOptions={screenOptions} initialRouteName={tab.initialRoute}>
                {[initial, ...others].map((route) => (
                    <Stack.Screen key={route.name} name={route.name} component={route.component} options={route.options} />
                ))}
                <Stack.Screen name="NavigationHandoff" component={NavigationHandoffH} />
            </Stack.Navigator>
        );
    }
    CustomTabStack.displayName = `CustomTabStack(${name})`;
    return CustomTabStack;
}

/**
 * Label *keys*. The bar resolves them through `t()` at render, so the labels
 * follow a language change; `tabBarLabel` itself would be baked in English
 * at module load.
 */
const TAB_LABELS: Record<CoreTab, string> = {
    Today: 'nav.tabs.today',
    Route: 'nav.tabs.route',
    Orders: 'nav.tabs.orders',
    Inbox: 'nav.tabs.inbox',
    Account: 'nav.tabs.account',
};

const CORE_STACKS: Record<CoreTab, React.ComponentType<any>> = {
    Today: TodayStack,
    Route: RouteStack,
    Orders: OrdersStack,
    Inbox: InboxStack,
    Account: AccountStack,
};

type TabEntry = { name: string; component: React.ComponentType<any>; options: { tabBarLabel?: string; title?: string; tabBarIcon?: (p: { focused: boolean; color: string; size: number }) => React.ReactNode } };

/**
 * The tab bar this build shows, worked out once: branding's `navigation.tabs`
 * (order, and which core tabs appear), the build's custom tabs, and branding's
 * per-tab icon and label overrides. Options are static objects — no hooks,
 * nothing recomputed per navigation state change.
 */
function buildTabs(): { tabs: TabEntry[]; initialTab: string } {
    const navigation = getBuildBranding().branding.navigation;
    const custom = Object.entries(customNavigation.tabs);
    const available = new Set<string>([...CORE_TABS, ...custom.map(([name]) => name)]);
    const order = orderTabs(navigation.tabs, custom, available);
    if (order.length > 5 && typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(`[navigation] ${order.length} tabs; the tab bar is designed for at most 5. Hide a core tab with branding navigation.tabs.`);
    }

    const tabs = order.map((name): TabEntry => {
        const customTab = customNavigation.tabs[name];
        if (customTab) {
            return { name, component: customTabStack(name, customTab), options: { tabBarLabel: customTab.labelKey, title: customTab.label ?? name, tabBarIcon: customTab.icon } };
        }
        const core = name as CoreTab;
        const override = navigation.tabOverrides[core];
        const Icon = override?.icon ? tabIcons[override.icon as TabIconName] : undefined;
        return {
            name,
            component: CORE_STACKS[core],
            options: {
                tabBarLabel: override?.labelKey ?? TAB_LABELS[core],
                ...(Icon ? { tabBarIcon: ({ color, size }: { color: string; size: number }) => <Icon size={size} color={color} /> } : {}),
            },
        };
    });

    const initial = custom.find(([name, tab]) => tab.initial && order.includes(name))?.[0];
    const initialTab = initial ?? (order.includes(navigation.defaultTab) ? navigation.defaultTab : order[0]);
    return { tabs, initialTab };
}

const { tabs: TABS, initialTab: INITIAL_TAB } = buildTabs();

/** Branding's feature switches; the host may turn one on too, never off. */
const BRAND_FEATURES = getBuildBranding().branding.features;

/**
 * Subscribes to the driver's own realtime channel for as long as they are
 * signed in. Renders nothing — it exists so the subscription's lifetime is the
 * session's, rather than any one screen's.
 */
function DriverChannel({ driverId }: { driverId?: string }) {
    useDriverChannel(driverId);
    return null;
}

/**
 * Push notifications for the session. A push in the foreground is treated as
 * the socket event it duplicates (refresh, or remove a reassigned order); a
 * tapped one also opens what it is about. Navigation goes through the root
 * ref, so this works from whichever tab the driver is on.
 */
function PushRouter() {
    const subscribe = usePushSubscribe();
    useEffect(() => {
        if (!subscribe) return;
        return subscribe((notification, action) => {
            const push = parsePush(notification);
            const event = pushToEvent(push);
            if (event) applyRealtimeEvent(event);
            if (action !== 'opened') return;
            const destination = destinationOf(push);
            if (destination?.kind === 'order') openOrder(destination.orderId);
            else if (destination?.kind === 'orders') openOrdersList();
            else if (destination?.kind === 'conversation') openConversation(destination.channelId);
        });
    }, [subscribe]);
    return null;
}

/**
 * The driver's chat channels for the session: their unread total feeds the
 * Inbox badge (v3's own count, no longer v2's ChatContext), and each channel
 * is followed on the socket so a new message refreshes the list, the badge and
 * any open conversation without waiting for a pull-to-refresh.
 */
function ChatWatcher({ enabled }: { enabled: boolean }) {
    const { channels, unreadTotal } = useChatChannels(0, { enabled });
    useChatChannelSubscriptions(useMemo(() => (channels ?? []).map((c) => c.id), [channels]));
    useEffect(() => {
        setChatUnreadTotal(unreadTotal);
    }, [unreadTotal]);
    return null;
}

/** The tab bar with the live Inbox count merged in. */
function BadgedTabBar(props: React.ComponentProps<typeof TabBar>) {
    const unread = useChatUnreadTotal();
    const badges = useMemo(() => ({ ...props.badges, Inbox: props.badges?.Inbox ?? (unread || undefined) }), [props.badges, unread]);
    return <TabBar {...props} badges={badges} />;
}

export function DriverTabs({
    badges,
    driverId,
    driverUserId,
    onSignOut,
    organizationId,
    onOrganizationSwitched,
    features,
}: {
    badges?: TabBadges;
    driverId?: string;
    driverUserId?: string;
    onSignOut?: () => void;
    organizationId?: string;
    onOrganizationSwitched?: (driver: unknown) => void;
    features?: Features;
}) {
    const featuresValue = useMemo<Features>(() => ({ ...features, earnings: Boolean(BRAND_FEATURES.earnings || features?.earnings) }), [features]);
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
                return <BadgedTabBar {...props} badges={badges} />;
            },
        [badges]
    );

    return (
        <AppScreenRegistryProvider>
        <DriverIdContext.Provider value={driverId}>
          <FeaturesContext.Provider value={featuresValue}>
            {/*
              * One subscription for the whole session. Order events bump the
              * live-refresh signal, so whatever is on screen refetches; geofence
              * crossings and offers are held for the surfaces that show them.
              */}
            <DriverChannel driverId={driverId} />
            <PushRouter />
            <ChatWatcher enabled={!!driverUserId} />
            <DriverUserIdContext.Provider value={driverUserId}>
                <SignOutContext.Provider value={onSignOut}>
                    <OrganizationContext.Provider value={organizationValue}>
            <Tab.Navigator
                screenOptions={screenOptions}
                tabBar={renderTabBar}
                initialRouteName={INITIAL_TAB}
            >
                {TABS.map((tab) => (
                    <Tab.Screen key={tab.name} name={tab.name} component={tab.component} options={tab.options} />
                ))}
            </Tab.Navigator>
                    </OrganizationContext.Provider>
                </SignOutContext.Provider>
            </DriverUserIdContext.Provider>
          </FeaturesContext.Provider>
        </DriverIdContext.Provider>
        </AppScreenRegistryProvider>
    );
}

export default DriverTabs;
