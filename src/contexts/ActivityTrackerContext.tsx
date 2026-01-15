/**
 * Activity Tracker Context
 *
 * Provides global activity tracking for all user interactions.
 * Automatically intercepts button presses and tracks screen navigation.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { View, ViewProps } from 'react-native';
import {
    ActivityBreadcrumb,
    addBreadcrumb,
    clearBreadcrumbs,
    extractButtonIdentifier,
    forceSyncBreadcrumbs,
    getBreadcrumbs,
    getCurrentScreen,
    getFunctionName,
    logActivityToAnalytics,
    setCurrentScreen,
} from '../utils/activityInterceptor';

// Context interface
interface ActivityTrackerContextType {
    trackAction: (action: string, target: string, metadata?: Record<string, any>) => void;
    trackButtonPress: (buttonId: string, handler?: Function) => void;
    setScreen: (screenName: string) => void;
    getScreen: () => string;
    getBreadcrumbs: () => ActivityBreadcrumb[];
    clearBreadcrumbs: () => void;
}

// Create context with default values
const ActivityTrackerContext = createContext<ActivityTrackerContextType>({
    trackAction: () => { },
    trackButtonPress: () => { },
    setScreen: () => { },
    getScreen: () => 'Unknown',
    getBreadcrumbs: () => [],
    clearBreadcrumbs: () => { },
});

// Custom hook to use activity tracker
export const useActivityTracker = (): ActivityTrackerContextType => {
    return useContext(ActivityTrackerContext);
};

// Props for the provider
interface ActivityTrackerProviderProps {
    children: React.ReactNode;
}

/**
 * ActivityTrackerProvider
 *
 * Wraps the app to provide automatic activity tracking.
 * Intercepts all press events and tracks them automatically.
 */
export const ActivityTrackerProvider: React.FC<ActivityTrackerProviderProps> = ({ children }) => {
    const lastTrackTime = useRef<number>(0);
    const DEBOUNCE_MS = 50; // Prevent duplicate tracking

    /**
     * Track a custom action
     */
    const trackAction = useCallback((action: string, target: string, metadata?: Record<string, any>) => {
        setImmediate(() => {
            addBreadcrumb({
                screen: getCurrentScreen(),
                action,
                target,
                targetType: 'Custom',
                metadata,
            });

            logActivityToAnalytics(action, target, getCurrentScreen());
        });
    }, []);

    /**
     * Track a button press
     */
    const trackButtonPress = useCallback((buttonId: string, handler?: Function) => {
        const now = Date.now();
        if (now - lastTrackTime.current < DEBOUNCE_MS) return;
        lastTrackTime.current = now;

        setImmediate(() => {
            const functionName = getFunctionName(handler);

            addBreadcrumb({
                screen: getCurrentScreen(),
                action: 'press',
                target: buttonId,
                targetType: 'Button',
                functionName,
            });

            logActivityToAnalytics('press', buttonId, getCurrentScreen());
        });
    }, []);

    /**
     * Set current screen
     */
    const setScreen = useCallback((screenName: string) => {
        setCurrentScreen(screenName);

        setImmediate(() => {
            addBreadcrumb({
                screen: screenName,
                action: 'screen_view',
                target: screenName,
                targetType: 'Screen',
            });
        });
    }, []);

    /**
     * Get current screen
     */
    const getScreen = useCallback(() => {
        return getCurrentScreen();
    }, []);

    // Memoize context value
    const contextValue = useMemo(
        () => ({
            trackAction,
            trackButtonPress,
            setScreen,
            getScreen,
            getBreadcrumbs,
            clearBreadcrumbs,
        }),
        [trackAction, trackButtonPress, setScreen, getScreen]
    );

    // Sync breadcrumbs on unmount
    useEffect(() => {
        return () => {
            forceSyncBreadcrumbs();
        };
    }, []);

    return <ActivityTrackerContext.Provider value={contextValue}>{children}</ActivityTrackerContext.Provider>;
};

/**
 * TrackedView - A wrapper component that intercepts all press events from children
 *
 * This component wraps its children and captures press events bubbling up.
 * It extracts button information and tracks it automatically.
 */
interface TrackedViewProps extends ViewProps {
    children: React.ReactNode;
}

export const TrackedView: React.FC<TrackedViewProps> = ({ children, ...props }) => {
    const { trackButtonPress } = useActivityTracker();
    const lastPressTime = useRef<number>(0);
    const DEBOUNCE_MS = 100;

    /**
     * Intercept touch events
     */
    const handleStartShouldSetResponder = useCallback(() => {
        // Don't capture, just observe
        return false;
    }, []);

    /**
     * Create wrapped children with intercepted onPress
     */
    const wrapChildren = useCallback(
        (node: React.ReactNode): React.ReactNode => {
            if (!React.isValidElement(node)) {
                return node;
            }

            const element = node as React.ReactElement<any>;
            const { onPress, onPressIn, ...otherProps } = element.props || {};

            // Check if this is a pressable component
            const elementType = element.type;
            const isPressable =
                typeof onPress === 'function' ||
                (typeof elementType === 'function' && (elementType as any).displayName === 'Button') ||
                (typeof elementType === 'function' && (elementType as any).name === 'Button') ||
                (typeof elementType === 'string' &&
                    ['Button', 'Pressable', 'TouchableOpacity', 'TouchableHighlight'].includes(elementType));

            if (isPressable && typeof onPress === 'function') {
                // Wrap the onPress handler
                const wrappedOnPress = (...args: any[]) => {
                    const now = Date.now();
                    if (now - lastPressTime.current >= DEBOUNCE_MS) {
                        lastPressTime.current = now;

                        // Extract button identifier
                        const buttonId = extractButtonIdentifier(element.props);

                        // Track asynchronously
                        setImmediate(() => {
                            trackButtonPress(buttonId, onPress);
                        });
                    }

                    // Call original handler immediately
                    return onPress(...args);
                };

                // Clone with wrapped handler
                return React.cloneElement(element, {
                    ...otherProps,
                    onPress: wrappedOnPress,
                    onPressIn,
                    children: element.props.children
                        ? React.Children.map(element.props.children, wrapChildren)
                        : undefined,
                });
            }

            // Recursively wrap children
            if (element.props?.children) {
                return React.cloneElement(element, {
                    ...element.props,
                    children: React.Children.map(element.props.children, wrapChildren),
                });
            }

            return node;
        },
        [trackButtonPress]
    );

    return (
        <View {...props} onStartShouldSetResponder={handleStartShouldSetResponder}>
            {React.Children.map(children, wrapChildren)}
        </View>
    );
};

export default ActivityTrackerContext;
