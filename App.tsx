import { Toasts } from '@backpackapp-io/react-native-toast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PortalHost, PortalProvider } from '@gorhom/portal';
import React, { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, Theme } from 'tamagui';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ActivityTrackerProvider, TrackedView } from './src/contexts/ActivityTrackerContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { ChatProvider } from './src/contexts/ChatContext';
import { ConfigProvider } from './src/contexts/ConfigContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { LocationProvider } from './src/contexts/LocationContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { OrderManagerProvider } from './src/contexts/OrderManagerContext';
import { SocketClusterProvider } from './src/contexts/SocketClusterContext';
import { TempStoreProvider } from './src/contexts/TempStoreContext';
import { ThemeProvider, useThemeContext } from './src/contexts/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { setCurrentScreen } from './src/utils/activityInterceptor';
import { initializeCrashlytics, isFirebaseReportingEnabled, logScreenView, setupEarlyErrorHandler } from './src/utils/firebaseHelper';
import config from './tamagui.config';

// Phase 1: Set up error catching immediately (no Firebase dependency)
setupEarlyErrorHandler();

// Helper to get recursive route name for nested navigators
const getRouteName = (state: any): string | undefined => {
    if (!state) return undefined;
    const route = state.routes[state.index];
    if (route.state) {
        return getRouteName(route.state);
    }
    return route.name;
};

function AppContent(): React.JSX.Element {
    const { appTheme } = useThemeContext();
    const routeNameRef = useRef<string>();

    // Phase 2: Connect to Crashlytics once Firebase is ready
    useEffect(() => {
        if (isFirebaseReportingEnabled()) {
            initializeCrashlytics();
        }
    }, []);

    return (
        <TamaguiProvider config={config} defaultTheme={appTheme}>
            <Theme name={appTheme}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <ActivityTrackerProvider>
                        <TrackedView style={{ flex: 1 }}>
                            <SafeAreaProvider>
                                <BottomSheetModalProvider>
                                    <ConfigProvider>
                                        <NotificationProvider>
                                            <LanguageProvider>
                                                <AuthProvider>
                                                    <SocketClusterProvider>
                                                        <LocationProvider>
                                                            <TempStoreProvider>
                                                                <ChatProvider>
                                                                    <OrderManagerProvider>
                                                                        <AppNavigator
                                                                            onStateChange={(state) => {
                                                                                const previousRouteName = routeNameRef.current;
                                                                                const currentRouteName = getRouteName(state);

                                                                                if (previousRouteName !== currentRouteName && currentRouteName) {
                                                                                    logScreenView(currentRouteName);
                                                                                    setCurrentScreen(currentRouteName); // Track screen for activity context
                                                                                    routeNameRef.current = currentRouteName;
                                                                                }
                                                                            }}
                                                                        />
                                                                        <Toasts extraInsets={{ bottom: 80 }} />
                                                                        <PortalHost name='MainPortal' />
                                                                        <PortalHost name='BottomSheetPanelPortal' />
                                                                        <PortalHost name='LocationPickerPortal' />
                                                                    </OrderManagerProvider>
                                                                </ChatProvider>
                                                            </TempStoreProvider>
                                                        </LocationProvider>
                                                    </SocketClusterProvider>
                                                </AuthProvider>
                                            </LanguageProvider>
                                        </NotificationProvider>
                                    </ConfigProvider>
                                </BottomSheetModalProvider>
                            </SafeAreaProvider>
                        </TrackedView>
                    </ActivityTrackerProvider>
                </GestureHandlerRootView>
            </Theme>
        </TamaguiProvider>
    );
}

function App(): React.JSX.Element {
    return (
        <PortalProvider>
            <ThemeProvider>
                <ErrorBoundary>
                    <AppContent />
                </ErrorBoundary>
            </ThemeProvider>
        </PortalProvider>
    );
}

export default App;