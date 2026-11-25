/**
 * The v3 tree and its adaptation of the v2 contexts, shared by the native selector
 * (App.tsx) and the web entry (App.web.tsx).
 */
import React, { useMemo } from 'react';
import { Linking } from 'react-native';
import { Toasts } from '@backpackapp-io/react-native-toast';

import V3App from './src/v3/App';
import { isInstanceLinkUrl, parseInstanceLink, type InstanceLink } from './src/v3/connection/instanceLink';
import useStorage from './src/hooks/use-storage';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { ChatProvider } from './src/contexts/ChatContext';
import { ConfigProvider, useConfig } from './src/contexts/ConfigContext';
import useFleetbaseV2 from './src/hooks/use-fleetbase';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { LocationProvider, useLocation } from './src/contexts/LocationContext';
import { NotificationProvider, useNotification } from './src/contexts/NotificationContext';
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
    const { driver, isOnline, toggleOnline, organizations, isAuthenticated, authToken, sessionEpoch, logout, createDriverSession } = useAuth();
    const { fleetbase } = useFleetbaseV2();
    const { resolveConnectionConfig, setInstanceLinkConfig, clearInstanceLinkConfig, instanceLinkConfig } = useConfig();
    const { addNotificationListener, removeNotificationListener } = useNotification();
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

    /*
     * The same SocketCluster connection config v2's SocketClusterProvider
     * builds — env defaults, overridden by a linked self-hosted instance.
     * Without it v3 mounted its SocketProvider disabled and never heard a
     * single event. Memoised on the primitives so the socket is not torn
     * down and rebuilt on every render.
     */
    const socketHost = resolveConnectionConfig('SOCKETCLUSTER_HOST');
    const socketPort = resolveConnectionConfig('SOCKETCLUSTER_PORT');
    const socketPath = resolveConnectionConfig('SOCKETCLUSTER_PATH');
    const socketSecure = resolveConnectionConfig('SOCKETCLUSTER_SECURE');
    const socket = useMemo(
        () =>
            socketHost
                ? {
                      hostname: String(socketHost),
                      port: socketPort ? Number(socketPort) : undefined,
                      path: socketPath ? String(socketPath) : undefined,
                      secure: socketSecure === undefined ? undefined : Boolean(socketSecure),
                  }
                : undefined,
        [socketHost, socketPort, socketPath, socketSecure]
    );

    /*
     * v2's NotificationProvider owns the native listeners; v3 subscribes.
     * Its add/remove functions are recreated on every provider render but act
     * on one stable list, so they are read through a ref — a subscribe whose
     * identity changed per render would re-register v3's listener constantly.
     */
    const notificationApi = React.useRef({ add: addNotificationListener, remove: removeNotificationListener });
    notificationApi.current = { add: addNotificationListener, remove: removeNotificationListener };
    const subscribeToPush = React.useCallback(
        (listener: (notification: { payload?: Record<string, unknown> | null }, action: 'received' | 'opened') => void) => {
            notificationApi.current.add(listener);
            return () => notificationApi.current.remove(listener);
        },
        []
    );

    /*
     * Linking to another server. The Console hands over one link (as a QR code or
     * a URL) carrying the server's address, its access key and where its live
     * updates are served. Scanned and typed links arrive from v3's own screens;
     * an opened one arrives here, from the OS, and waits for the driver to
     * confirm it. Saving a link ends the current session: its token belongs to
     * the server being left.
     */
    const [openedLink, setOpenedLink] = React.useState<InstanceLink | null>(null);
    React.useEffect(() => {
        const take = (url?: string | null) => {
            if (!isInstanceLinkUrl(url)) return;
            const link = parseInstanceLink(url);
            if (link) setOpenedLink(link);
        };
        void Linking.getInitialURL().then(take).catch(() => {});
        const subscription = Linking.addEventListener('url', ({ url }) => take(url));
        return () => subscription.remove();
    }, []);

    const linkInstance = React.useCallback(
        (link: InstanceLink) => {
            setInstanceLinkConfig('FLEETBASE_HOST', link.host);
            setInstanceLinkConfig('FLEETBASE_KEY', link.key);
            setInstanceLinkConfig('SOCKETCLUSTER_HOST', link.socketHost);
            setInstanceLinkConfig('SOCKETCLUSTER_PORT', link.socketPort);
            setInstanceLinkConfig('SOCKETCLUSTER_SECURE', link.socketSecure === undefined ? undefined : String(link.socketSecure));
            setOpenedLink(null);
            if (isAuthenticated) logout();
        },
        [setInstanceLinkConfig, isAuthenticated, logout]
    );
    const unlinkInstance = React.useCallback(() => {
        clearInstanceLinkConfig();
        setOpenedLink(null);
        if (isAuthenticated) logout();
    }, [clearInstanceLinkConfig, isAuthenticated, logout]);
    const linkedHost = (instanceLinkConfig?.FLEETBASE_HOST as string | undefined) || undefined;

    /*
     * First-run steps (organisation, location, notifications) are shown once per
     * person on this phone. Keyed on the user, not the driver: switching
     * organisation makes a new driver and must not start them over.
     */
    const personId = ((driver as { getAttribute?: (k: string) => unknown })?.getAttribute?.('user') as string | undefined) ?? driver?.id;
    const [onboarded, setOnboarded] = useStorage<Record<string, boolean>>('V3_ONBOARDED', {});
    const onboardingComplete = !personId || !!onboarded?.[personId];
    const completeOnboarding = React.useCallback(() => {
        if (personId) setOnboarded({ ...(onboarded ?? {}), [personId]: true });
    }, [personId, onboarded, setOnboarded]);

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
            socket={socket}
            // The socket authenticates as the driver with `userToken`; this
            // re-handshakes it on every sign-in, sign-out and org switch.
            socketSession={sessionEpoch}
            subscribeToPush={subscribeToPush}
            // What the app presents until a driver signs in: the instance's
            // platform token, which only opens the sign-in routes. A build tied
            // to one organisation may still use that organisation's API key.
            platformToken={resolveConnectionConfig('FLEETBASE_SIGN_IN_CREDENTIAL')}
            userToken={authToken ?? undefined}
            onUnauthorized={logout}
            onSignOut={logout}
            // Moving to another server takes that server's own link (address,
            // access key and live-update settings together), never a bare host.
            onLinkInstance={linkInstance}
            onUnlinkInstance={unlinkInstance}
            linkedHost={linkedHost}
            openedLink={openedLink}
            onOpenedLinkHandled={() => setOpenedLink(null)}
            onboardingComplete={onboardingComplete}
            onOnboardingComplete={completeOnboarding}
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
            // The Inbox badge is v3's own now (chat-channels unread counts,
            // kept live by the chat channels' events) rather than v2's
            // ChatContext, which counted from a different source.
        >
            <Toasts extraInsets={{ bottom: 80 }} />
        </V3App>
    );
}

function AppV3(): React.JSX.Element {
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

export default AppV3;
