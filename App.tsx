/**
 * Root selector.
 *
 * The redesign is built in a parallel tree, so the whole presentation layer is
 * chosen here rather than screen by screen. The two must never share a
 * TamaguiProvider: v2 components read tokens (`$red-600`,
 * `$borderColorWithShadow`) that the Waypoint config does not define, and v3
 * components read tokens (`$surfaceRaised`, `$onPrimary`, the status families)
 * that v2 does not. Mixing them resolves to undefined rather than failing loudly.
 *
 * Set NAVIGATOR_V3=true to build the v3 shell.
 *
 * This file is the only place v3 touches v2. `DriverBridge` adapts the v2 auth
 * and socket contexts into the plain props V3App takes; Phase 2 replaces the
 * data layer and this bridge goes with it.
 */
import React, { useMemo } from 'react';
import { Toasts } from '@backpackapp-io/react-native-toast';

import { isV3Enabled } from './src/v3/flag';
import V3App from './src/v3/App';
import { V2App } from './App.v2';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ChatProvider, useChat } from './src/contexts/ChatContext';
import { ConfigProvider, useConfig } from './src/contexts/ConfigContext';
import useFleetbaseV2 from './src/hooks/use-fleetbase';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { LocationProvider, useLocation } from './src/contexts/LocationContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { SocketClusterProvider } from './src/contexts/SocketClusterContext';
import { TempStoreProvider } from './src/contexts/TempStoreContext';
import { navigatorConfig } from './src/utils/navigator-config';

/**
 * OrderManagerProvider is intentionally absent from the v3 branch: it reads
 * `theme['$red-600']` (OrderManagerContext.tsx:69) from the Tailwind ramp, which
 * the Waypoint config does not carry, so mounting it under the v3 provider
 * throws. Phase 2 replaces it; the screens that need it are Phase 3 and 4b.
 */
function DriverBridge(): React.JSX.Element {
    const { driver, isOnline, toggleOnline, organizations, isAuthenticated, authToken, logout, createDriverSession } = useAuth();
    const { fleetbase } = useFleetbaseV2();
    const { unreadCount } = useChat();
    const { resolveConnectionConfig, setInstanceLinkConfig } = useConfig();
    // v2 already runs background geolocation for the whole app; v3 reads its
    // last fix rather than starting a second consumer of the same hardware.
    const { location } = useLocation();

    const organizationName = useMemo(() => {
        const current = Array.isArray(organizations) ? organizations[0] : undefined;
        return current?.name ?? driver?.getAttribute?.('company_name') ?? 'Navigator';
    }, [organizations, driver]);

    // Password sign-in. The SDK's driver store already implements it; v2's
    // AuthContext only wires the SMS path, so call it directly and hand the
    // result to createDriverSession, which persists the token the adapter reads.
    const handleSignIn = React.useCallback(
        async (identity, password) => {
            const result = await fleetbase.drivers.login(identity, password);
            await createDriverSession(result);
        },
        [fleetbase, createDriverSession]
    );

    // Organisation switches, read once: the config module is not reactive.
    const features = useMemo(() => ({ earnings: Boolean(navigatorConfig('features.earnings', false)) }), []);

    return (
        <V3App
            onSignIn={handleSignIn}
            features={features}
            // One Fleetbase instance for the app; the adapter takes credentials
            // without being rebuilt, so a login or org switch no longer
            // invalidates every consumer the way v2's did.
            host={resolveConnectionConfig('FLEETBASE_HOST')}
            // FLEETBASE_KEY is the organisation's *API key* — an admin-scoped
            // credential that should never sit on a handset. The platform token
            // is the pre-auth one, scoped to onboarding.
            platformToken={resolveConnectionConfig('FLEETBASE_PLATFORM_TOKEN')}
            userToken={authToken ?? undefined}
            onUnauthorized={logout}
            onSignOut={logout}
            // Only the host is stored — never a key. v2's link flow shipped an
            // admin API credential here; the v3 screen verifies the host
            // unauthenticated instead.
            onChangeHost={(nextHost: string) => setInstanceLinkConfig('FLEETBASE_HOST', nextHost)}
            // The code route returns the same driver payload as a password
            // sign-in, so the session is created in exactly the same way.
            onOtpVerified={createDriverSession}
            // Offer signing in with a code; v2 kept it behind a separate screen.
            authMethods={['phone']}
            organizationId={(driver as { getAttribute?: (k: string) => unknown })?.getAttribute?.('company') as string | undefined}
            onOrganizationSwitched={createDriverSession}
            organizationName={organizationName}
            subtitle={driver?.getAttribute?.('name')}
            isAuthenticated={!!isAuthenticated}
            driverId={driver?.id}
            // `Resource` defines a getter for `id` only — every other attribute
            // lives in `attributes` and needs getAttribute(). `driver.user` is
            // silently undefined, which read as "I am in no conversation".
            driverUserId={(driver as { getAttribute?: (k: string) => unknown })?.getAttribute?.('user') as string | undefined}
            location={location}
            isOnline={!!isOnline}
            onToggleOnline={(next) => toggleOnline(next)}
            breakSupported={false}
            badges={{ Inbox: unreadCount || undefined }}
        >
            <Toasts extraInsets={{ bottom: 80 }} />
        </V3App>
    );
}

function App(): React.JSX.Element {
    if (!isV3Enabled()) {
        return <V2App />;
    }

    return (
        <ConfigProvider>
            <NotificationProvider>
                <LanguageProvider>
                    <AuthProvider>
                        <SocketClusterProvider>
                            <LocationProvider>
                                <TempStoreProvider>
                                    <ChatProvider>
                                        <DriverBridge />
                                    </ChatProvider>
                                </TempStoreProvider>
                            </LocationProvider>
                        </SocketClusterProvider>
                    </AuthProvider>
                </LanguageProvider>
            </NotificationProvider>
        </ConfigProvider>
    );
}

export default App;
