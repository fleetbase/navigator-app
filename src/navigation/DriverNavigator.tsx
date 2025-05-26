import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
    faHome,
    faGaugeHigh,
    faComments,
    faWalkieTalkie,
    faClipboardList,
    faClipboard,
    faChartLine,
    faUser,
    faTriangleExclamation,
    faFlag,
    faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { useTheme, Text, View, XStack, Image } from 'tamagui';
import { navigatorConfig, get, config, toArray, getTheme } from '../utils';
import { configCase } from '../utils/format';
import { format } from 'date-fns';
import { PortalHost } from '@gorhom/portal';
import { useIsNotAuthenticated, useIsAuthenticated } from '../contexts/AuthContext';
import { useTempStore } from '../contexts/TempStoreContext';
import DriverDashboardScreen from '../screens/DriverDashboardScreen';
import DriverOrderManagementScreen from '../screens/DriverOrderManagementScreen';
import OrderScreen from '../screens/OrderScreen';
import EntityScreen from '../screens/EntityScreen';
import ProofOfDeliveryScreen from '../screens/ProofOfDeliveryScreen';
import DriverReportScreen from '../screens/DriverReportScreen';
import CreateIssueScreen from '../screens/CreateIssueScreen';
import EditIssueScreen from '../screens/EditIssueScreen';
import IssueScreen from '../screens/IssueScreen';
import CreateFuelReportScreen from '../screens/CreateFuelReportScreen';
import EditFuelReportScreen from '../screens/EditFuelReportScreen';
import FuelReportScreen from '../screens/FuelReportScreen';
import ChatHomeScreen from '../screens/ChatHomeScreen';
import ChatChannelScreen from '../screens/ChatChannelScreen';
import ChatParticipantsScreen from '../screens/ChatParticipantsScreen';
import CreateChatChannelScreen from '../screens/CreateChatChannelScreen';
import DriverProfileScreen from '../screens/DriverProfileScreen';
import DriverAccountScreen from '../screens/DriverAccountScreen';
import { useOrderManager } from '../contexts/OrderManagerContext';
import { useChat } from '../contexts/ChatContext';
import useAppTheme from '../hooks/use-app-theme';
import DriverLayout from '../layouts/DriverLayout';
import DriverOnlineToggle from '../components/DriverOnlineToggle';
import BackButton from '../components/BackButton';
import HeaderButton from '../components/HeaderButton';
import Badge from '../components/Badge';
import DeviceInfo from 'react-native-device-info';

const isAndroid = Platform.OS === 'android';
const importedIconsMap = {
    faHome,
    faGaugeHigh,
    faComments,
    faWalkieTalkie,
    faClipboardList,
    faClipboard,
    faChartLine,
    faUser,
    faTriangleExclamation,
    faFlag,
};

function getTabConfig(name, key, defaultValue = null) {
    const tabs = navigatorConfig('tabs');
    const tab = tabs.find(({ name: tabName }) => name === tabName);
    if (tab) {
        return get(tab, key, defaultValue);
    }

    return defaultValue;
}

function createTabScreens() {
    const tabs = toArray(navigatorConfig('driverNavigator.tabs', 'DriverDashboardTab,DriverTaskTab,DriverReportTab,DriverChatTab,DriverAccountTab'));
    const screens = {
        DriverDashboardTab: {
            screen: DriverDashboardTab,
            options: {
                tabBarLabel: config('DRIVER_DASHBOARD_TAB_LABEL', 'Dash'),
            },
        },
        DriverTaskTab: {
            screen: DriverTaskTab,
            options: () => {
                const { allActiveOrders } = useOrderManager();

                return {
                    tabBarLabel: config('DRIVER_ORDER_TAB_LABEL', 'Orders'),
                    tabBarBadge: allActiveOrders.length,
                    tabBarBadgeStyle: {
                        marginRight: -5,
                        opacity: allActiveOrders.length ? 1 : 0.5,
                    },
                };
            },
        },
        DriverReportTab: {
            screen: DriverReportTab,
            options: () => {
                return {
                    tabBarLabel: config('DRIVER_REPORT_TAB_LABEL', 'Reports'),
                };
            },
        },
        DriverChatTab: {
            screen: DriverChatTab,
            options: () => {
                const { unreadCount } = useChat();

                return {
                    tabBarLabel: config('DRIVER_CHAT_TAB_LABEL', 'Chat'),
                    tabBarBadge: unreadCount,
                    tabBarBadgeStyle: {
                        marginRight: -5,
                        opacity: unreadCount ? 1 : 0.5,
                    },
                };
            },
        },
        DriverAccountTab: {
            screen: DriverAccountTab,
            options: () => {
                return {
                    tabBarLabel: config('DRIVER_ACCOUNT_TAB_LABEL', 'Account'),
                };
            },
        },
    };

    const screenTabs = {};
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (tab) {
            screenTabs[tab] = screens[tab];
        }
    }

    return screenTabs;
}

function getDefaultTabIcon(routeName) {
    // Check if able to load from config/env setting first
    const routeIconConfig = config(`${configCase(routeName)}_ICON`);
    if (routeIconConfig && importedIconsMap[routeIconConfig]) {
        return importedIconsMap[routeIconConfig];
    }

    let icon;
    switch (routeName) {
        case 'DriverDashboardTab':
            icon = faGaugeHigh;
            break;
        case 'DriverTaskTab':
            icon = faClipboardList;
            break;
        case 'DriverReportTab':
            icon = faFlag;
            break;
        case 'DriverChatTab':
            icon = faWalkieTalkie;
            break;
        case 'DriverAccountTab':
            icon = faUser;
            break;
    }

    return icon;
}

function getDriverNavigatorHeaderOptions({ route, navigation }) {
    const theme = useTheme();

    return {
        headerTitle: '',
        headerLeft: (props) => (
            <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                Navigator
            </Text>
        ),
        headerRight: (props) => <DriverOnlineToggle {...props} />,
        headerStyle: {
            backgroundColor: theme.background.val,
            headerTintColor: theme.borderColor.val,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
        },
        headerShadowVisible: false,
    };
}

const DriverDashboardTab = createNativeStackNavigator({
    initialRouteName: 'DriverDashboard',
    screens: {
        DriverDashboard: {
            screen: DriverDashboardScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
    },
});

const DriverTaskTab = createNativeStackNavigator({
    initialRouteName: 'DriverOrderManagement',
    screens: {
        DriverOrderManagement: {
            screen: DriverOrderManagementScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        Order: {
            screen: OrderScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        OrderModal: {
            screen: OrderScreen,
            options: ({ route, navigation }) => {
                const order = route.params.order;
                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={20} fontWeight='bold' numberOfLines={1}>
                            {order.id}
                        </Text>
                    ),
                    headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        Entity: {
            screen: EntityScreen,
            options: ({ route, navigation }) => {
                const params = route.params ?? {};
                const entity = params.entity;

                return {
                    headerTitle: '',
                    headerShown: true,
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={20} fontWeight='bold' numberOfLines={1}>
                            {entity.name ?? entity.tracking_number.tracking_number}
                        </Text>
                    ),
                    headerRight: (props) => (
                        <XStack alignItems='center' space='$2'>
                            <Badge status={entity.tracking_number.status_code.toLowerCase()} />
                            <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />
                        </XStack>
                    ),
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                    presentation: 'modal',
                };
            },
        },
        ProofOfDelivery: {
            screen: ProofOfDeliveryScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
    },
});

const DriverReportTab = createNativeStackNavigator({
    initialRouteName: 'DriverReport',
    screens: {
        DriverReport: {
            screen: DriverReportScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        CreateFuelReport: {
            screen: CreateFuelReportScreen,
            options: ({ route, navigation }) => {
                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                            Create a new Fuel Report
                        </Text>
                    ),
                    headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        EditFuelReport: {
            screen: EditFuelReportScreen,
            options: ({ route, navigation }) => {
                const params = route.params || {};
                const fuelReport = params.fuelReport;

                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' numberOfLines={1}>
                            Edit Fuel Report from {format(new Date(fuelReport.created_at), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    ),
                    headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        FuelReport: {
            screen: FuelReportScreen,
            options: ({ route, navigation }) => {
                const {
                    store: { fuelReport },
                } = useTempStore();

                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' numberOfLines={1}>
                            {format(new Date(fuelReport.created_at), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    ),
                    headerRight: (props) => <PortalHost name='FuelReportScreenHeaderRightPortal' />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        CreateIssue: {
            screen: CreateIssueScreen,
            options: ({ route, navigation }) => {
                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                            Create a new Issue
                        </Text>
                    ),
                    headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        EditIssue: {
            screen: EditIssueScreen,
            options: ({ route, navigation }) => {
                const params = route.params || {};
                const issue = params.issue;

                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' numberOfLines={1}>
                            Edit Issue from {format(new Date(issue.created_at), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    ),
                    headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
        Issue: {
            screen: IssueScreen,
            options: ({ route, navigation }) => {
                const {
                    store: { issue },
                } = useTempStore();

                return {
                    presentation: 'modal',
                    headerTitle: '',
                    headerLeft: (props) => (
                        <Text color='$textPrimary' fontSize={18} fontWeight='bold' numberOfLines={1}>
                            {format(new Date(issue.created_at), 'MMM dd, yyyy HH:mm')}
                        </Text>
                    ),
                    headerRight: (props) => <PortalHost name='IssueScreenHeaderRightPortal' />,
                    headerStyle: {
                        backgroundColor: getTheme('background'),
                        headerTintColor: getTheme('borderColor'),
                    },
                };
            },
        },
    },
});

const DriverChatTab = createNativeStackNavigator({
    initialRouteName: 'ChatHome',
    screens: {
        ChatHome: {
            screen: ChatHomeScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        ChatChannel: {
            screen: ChatChannelScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        ChatParticipants: {
            screen: ChatParticipantsScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                    presentation: 'modal',
                };
            },
        },
        CreateChatChannel: {
            screen: CreateChatChannelScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                    presentation: 'modal',
                };
            },
        },
    },
});

const DriverAccountTab = createNativeStackNavigator({
    initialRouteName: 'DriverProfile',
    screens: {
        DriverProfile: {
            screen: DriverProfileScreen,
            options: ({ route, navigation }) => {
                return {
                    headerShown: false,
                };
            },
        },
        DriverAccount: {
            screen: DriverAccountScreen,
            options: ({ route, navigation }) => {
                return {
                    title: '',
                    headerTransparent: true,
                    headerShadowVisible: false,
                    headerLeft: () => {
                        return <BackButton onPress={() => navigation.goBack()} />;
                    },
                };
            },
        },
    },
});

const DriverNavigator = createBottomTabNavigator({
    layout: DriverLayout,
    screenOptions: ({ route, navigation }) => {
        const theme = useTheme();
        const { isDarkMode } = useAppTheme();
        const focusedColor = theme.primary.val;
        const blurredColor = theme.tabIconBlur.val;

        return {
            headerTitle: '',
            headerLeft: (props) => (
                <View pl='$3'>
                    <XStack alignItems='center'>
                        <Image source={require('../../assets/navigator-icon-transparent.png')} style={{ width: 18, height: 18, marginRight: 5 }} />
                        <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                            Navigator
                        </Text>
                    </XStack>
                    <Text color='$textSecondary' fontSize={8} ml={25}>
                        v{DeviceInfo.getVersion()} #{DeviceInfo.getBuildNumber()}
                    </Text>
                </View>
            ),
            headerRight: (props) => (
                <View pr='$3'>
                    <DriverOnlineToggle {...props} />
                </View>
            ),
            headerStyle: {
                backgroundColor: isDarkMode ? theme.background.val : theme.background.val,
                elevation: 0,
                shadowOpacity: 0,
                borderBottomWidth: 0,
                borderColor: isDarkMode ? 'transparent' : theme['$gray-300'].val,
            },
            headerShadowVisible: false,
            tabBarBackground: () => {
                if (isAndroid) {
                    return (
                        <View
                            style={[
                                StyleSheet.absoluteFill,
                                {
                                    width: '100%',
                                    height: '100%',
                                    backgroundColor: isDarkMode ? theme.background.val : theme['$gray-100'].val,
                                    borderColor: theme.borderColor.val,
                                    borderTopWidth: 1,
                                    borderWidth: 0,
                                },
                            ]}
                        />
                    );
                }
                return (
                    <View style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                        <BlurView tint={isDarkMode ? 'dark' : 'light'} intensity={100} style={StyleSheet.absoluteFill} />
                    </View>
                );
            },
            tabBarInactiveTintColor: blurredColor,
            tabBarActiveTintColor: theme.primary.val,
            tabBarStyle: {
                backgroundColor: theme.background.val,
                borderTopWidth: isAndroid ? 0 : 1,
                borderTopColor: isDarkMode ? theme['$gray-800'].val : theme['$gray-600'].val,
                position: 'relative',
                elevation: 0,
            },
            tabBarIcon: ({ focused }) => {
                const icon = getDefaultTabIcon(route.name);

                return <FontAwesomeIcon icon={icon} size={isAndroid ? 18 : 20} color={focused ? focusedColor : blurredColor} />;
            },
            tabBarLabelStyle: ({ focused }) => {
                return {
                    marginTop: isAndroid ? 4 : 15,
                    fontSize: isAndroid ? 13 : 15,
                    fontWeight: focued ? 600 : 300,
                };
            },
        };
    },
    screens: createTabScreens(),
});

export default DriverNavigator;
