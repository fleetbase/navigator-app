/**
 * v3 presentation root.
 *
 * Takes plain data props and imports nothing from the v2 tree. That boundary is
 * deliberate: the v2 contexts are untyped and reach for tokens the Waypoint
 * config does not define, so the adaptation lives in App.tsx — outside this
 * tree, where it is obviously temporary — and Phase 2 deletes it rather than
 * untangling it from here.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PortalHost, PortalProvider } from '@gorhom/portal';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { NavigationContainer } from '@react-navigation/native';
import BootSplash from 'react-native-bootsplash';
import { TamaguiProvider, Theme } from 'tamagui';

import waypointConfig, { type SchemeName } from './theme';
import { useResolvedScheme } from './settings';
import SignInScreen, { type AuthMethod } from './screens/SignInScreen';
import SelfHostedConnectionScreen from './screens/SelfHostedConnectionScreen';
import OtpSignInScreen from './screens/OtpSignInScreen';
import { DriverShell } from './navigation';
import { DutyProvider, SyncProvider, LocationProvider } from './shell';
import type { TabBadges } from './navigation/TabBar';
import { FleetbaseProvider, mutationQueue, useQueue, type MutationQueue } from './api';
import { useActiveOrderCount } from './data';


/**
 * Feeds the shell's connectivity strip from the real queue rather than the
 * Phase 1 stub: the "N queued" count and the failed/retry state now reflect
 * work actually waiting to reach the server.
 */
function QueueBoundSync({ children, isConnected, queue }: { children: React.ReactNode; isConnected: boolean; queue: MutationQueue }) {
    const { pendingCount, failedCount, isFlushing } = useQueue(queue);
    return (
        <SyncProvider
            isOnline={isConnected}
            queuedCount={pendingCount + failedCount}
            syncState={failedCount > 0 ? 'failed' : isFlushing ? 'syncing' : 'idle'}
            onRetry={() => {
                queue.retryFailed();
                void queue.flush();
            }}
        >
            {children}
        </SyncProvider>
    );
}

/**
 * Derives tab badges from the order store so the count is live without the
 * navigator's `options` callbacks ever touching a hook.
 */
function DriverSurface(props: {
    organizationName: string;
    subtitle?: string;
    badges?: TabBadges;
    activeStopCount: number;
    driverId?: string;
    driverUserId?: string;
    onSignOut?: () => void;
    organizationId?: string;
    onOrganizationSwitched?: (driver: unknown) => void;
}) {
    const activeOrders = useActiveOrderCount();

    // Memoised because this object reaches `DriverTabs`, and an unstable
    // reference there re-renders the navigator on every parent render.
    const badges = React.useMemo(
        () => ({ Orders: activeOrders || undefined, ...props.badges }),
        [activeOrders, props.badges]
    );

    return (
        <DriverShell
            organizationName={props.organizationName}
            subtitle={props.subtitle}
            badges={badges}
            activeStopCount={props.activeStopCount || activeOrders}
            driverId={props.driverId}
            driverUserId={props.driverUserId}
            onSignOut={props.onSignOut}
            organizationId={props.organizationId}
            onOrganizationSwitched={props.onOrganizationSwitched}
        />
    );
}

export interface V3AppProps {
    scheme?: SchemeName;
    organizationName: string;
    subtitle?: string;
    /** Driver's online flag, from the driver resource. */
    isOnline?: boolean;
    onToggleOnline?: (online: boolean) => Promise<unknown>;
    /** True once the Phase 4a shift endpoints exist. */
    breakSupported?: boolean;
    /**
     * Connectivity. Still a proxy off the socket connection — the app has no
     * netinfo dependency — but the queued count and sync state below are now
     * real, read from the mutation queue.
     */
    isConnected?: boolean;
    /** API host. Required so the single Fleetbase instance can be built. */
    host?: string;
    platformToken?: string;
    /** Driver Sanctum token. Changing it re-authorises without rebuilding. */
    userToken?: string;
    onUnauthorized?: () => void;
    /** Explicit sign-out from Account, distinct from a 401 forcing one. */
    onSignOut?: () => void;
    /** The organisation the driver is currently working in. */
    organizationId?: string;
    /**
     * Switching organisation returns a new driver with a new token, so the host
     * app re-creates the session; v3 does not own auth.
     */
    onOrganizationSwitched?: (driver: unknown) => void;
    queue?: MutationQueue;
    badges?: TabBadges;
    activeStopCount?: number;
    /**
     * Gates the driver shell. v2 gated its navigator with `if: useIsAuthenticated`;
     * without an equivalent the shell would render for a signed-out driver.
     * The auth *screens* are Phase 3 / design round 2 — this is just the gate.
     */
    isAuthenticated?: boolean;
    /** Signed-in driver's public id; scopes order queries. */
    driverId?: string;
    /**
     * The driver's *user* id. Chat identifies people by user, not by driver:
     * a channel's participants carry `user`, and sending a message needs the
     * participant record whose `user` is this one.
     */
    driverUserId?: string;
    /**
     * Last known position, from v2's tracking. Required to file an issue, so
     * the screens must be able to tell whether there is a fix.
     */
    location?: unknown;
    /** Resolves on success, rejects with a message to show inline. */
    onSignIn?: (identity: string, password: string) => Promise<void>;
    /** Per-organisation auth alternates. */
    authMethods?: AuthMethod[];
    /**
     * Accepts a verified self-hosted origin. Omit to hide the option entirely —
     * a managed deployment should not offer to point elsewhere.
     */
    onChangeHost?: (host: string) => void;
    /** Completes an OTP sign-in; the host app creates the session. */
    onOtpVerified?: (driver: unknown) => void;
    /** Rendered inside the providers — toasts, portals the host app owns. */
    children?: React.ReactNode;
}

/**
 * Reads the driver's theme preference so the whole tree re-themes live.
 * `scheme` remains overridable for tests and screenshots.
 */
function ThemedRoot({ scheme, children }: { scheme?: SchemeName; children: (s: SchemeName) => React.JSX.Element }) {
    const resolved = useResolvedScheme();

    // react-native-bootsplash needs an explicit hide(). v2 did it in BootScreen,
    // which the v3 tree does not mount — without this the app sits on the splash
    // forever. Runs once the themed tree has committed, so there is no flash of
    // an unthemed frame.
    React.useEffect(() => {
        void BootSplash.hide({ fade: true }).catch(() => {});
    }, []);
    return children(scheme ?? resolved);
}

export function V3App({
    scheme,
    organizationName,
    subtitle,
    isOnline = false,
    onToggleOnline,
    breakSupported = false,
    isConnected = true,
    host = 'https://api.fleetbase.io',
    platformToken,
    userToken,
    onUnauthorized,
    onSignOut,
    organizationId,
    onOrganizationSwitched,
    queue = mutationQueue,
    badges,
    activeStopCount = 0,
    isAuthenticated = false,
    driverId,
    driverUserId,
    location,
    onSignIn,
    authMethods,
    onChangeHost,
    onOtpVerified,
    children,
}: V3AppProps): React.JSX.Element {
    // Pre-auth only: the driver can point the app at their own instance before
    // signing in. Deliberately local state — there is no navigator here yet.
    const [choosingHost, setChoosingHost] = React.useState(false);
    // Which sign-in the driver is using. Password remains the default; the code
    // route is offered because a driver who has forgotten theirs is otherwise
    // stuck until dispatch intervenes.
    const [usingOtp, setUsingOtp] = React.useState(false);
    return (
        <PortalProvider>
            <ThemedRoot scheme={scheme}>
                {(active) => (
            <TamaguiProvider config={waypointConfig} defaultTheme={active}>
                <Theme name={active}>
                    <GestureHandlerRootView style={{ flex: 1 }}>
                        <SafeAreaProvider>
                            <BottomSheetModalProvider>
                                <FleetbaseProvider
                                    host={host}
                                    platformToken={platformToken}
                                    userToken={userToken}
                                    onUnauthorized={onUnauthorized}
                                    queue={queue}
                                    isConnected={isConnected}
                                >
                                    <QueueBoundSync isConnected={isConnected} queue={queue}>
                                        <DutyProvider isOnline={isOnline} onToggleOnline={onToggleOnline} breakSupported={breakSupported}>
                                            <LocationProvider location={location}>
                                            <NavigationContainer>
                                                {isAuthenticated ? (
                                                    <DriverSurface
                                                        organizationName={organizationName}
                                                        subtitle={subtitle}
                                                        badges={badges}
                                                        activeStopCount={activeStopCount}
                                                        driverId={driverId}
                                                        driverUserId={driverUserId}
                                                        onSignOut={onSignOut}
                                                        organizationId={organizationId}
                                                        onOrganizationSwitched={onOrganizationSwitched}
                                                    />
                                                ) : choosingHost ? (
                                                    <SelfHostedConnectionScreen
                                                        initialHost={host}
                                                        onCancel={() => setChoosingHost(false)}
                                                        onConnected={(identity) => {
                                                            onChangeHost?.(identity.host);
                                                            setChoosingHost(false);
                                                        }}
                                                    />
                                                ) : usingOtp ? (
                                                    <OtpSignInScreen
                                                        organizationName={organizationName}
                                                        onUsePassword={() => setUsingOtp(false)}
                                                        onVerified={(driver) => onOtpVerified?.(driver)}
                                                    />
                                                ) : (
                                                    <SignInScreen
                                                        onSignIn={onSignIn ?? (() => Promise.reject(new Error('Sign-in is not configured')))}
                                                        methods={authMethods}
                                                        organizationName={organizationName}
                                                        host={host}
                                                        onChangeServer={onChangeHost ? () => setChoosingHost(true) : undefined}
                                                        onSelectMethod={(method) => {
                                                            if (method === 'phone') setUsingOtp(true);
                                                        }}
                                                    />
                                                )}
                                            </NavigationContainer>
                                            {children}
                                            <PortalHost name="MainPortal" />
                                            <PortalHost name="BottomSheetPanelPortal" />
                                            </LocationProvider>
                                        </DutyProvider>
                                    </QueueBoundSync>
                                </FleetbaseProvider>
                            </BottomSheetModalProvider>
                        </SafeAreaProvider>
                    </GestureHandlerRootView>
                </Theme>
            </TamaguiProvider>
                )}
            </ThemedRoot>
        </PortalProvider>
    );
}

export default V3App;
