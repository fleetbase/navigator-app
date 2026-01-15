/**
 * Activity Interceptor Utility
 *
 * Provides utilities for tracking user interactions and maintaining
 * a breadcrumb trail for debugging and error reporting.
 */

import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getCrashlytics, log, setAttribute } from '@react-native-firebase/crashlytics';
import React from 'react';
import { Platform } from 'react-native';
import { isFirebaseReportingEnabled } from './firebaseHelper';

// Types
export interface ActivityBreadcrumb {
    id: string;
    timestamp: number;
    screen: string;
    action: string;
    target: string;
    targetType: string;
    functionName?: string;
    metadata?: Record<string, any>;
}

// Configuration
const MAX_BREADCRUMBS = 50;
const SYNC_INTERVAL_MS = 500;

// Circular buffer for breadcrumbs
let breadcrumbs: ActivityBreadcrumb[] = [];
let currentScreen = 'Unknown';
let syncTimeout: NodeJS.Timeout | null = null;
let pendingSync = false;

// Store original console for internal logging
const originalConsoleLog = console.log;

// Console logging toggle (default: off).
// Enable at runtime (e.g. in Debugger console): global.__ACTIVITY_TRACKER_DEBUG__ = true
const shouldDebugLog = (): boolean => {
    try {
        return __DEV__ && (global as any).__ACTIVITY_TRACKER_DEBUG__;
    } catch {
        return false;
    }
};

/**
 * Generate a unique ID for breadcrumbs
 */
const generateId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Set the current screen name for context
 */
export const setCurrentScreen = (screenName: string): void => {
    currentScreen = screenName;
};

/**
 * Get the current screen name
 */
export const getCurrentScreen = (): string => {
    return currentScreen;
};

/**
 * Add a breadcrumb to the queue
 */
export const addBreadcrumb = (breadcrumb: Omit<ActivityBreadcrumb, 'id' | 'timestamp'>): void => {
    const fullBreadcrumb: ActivityBreadcrumb = {
        ...breadcrumb,
        id: generateId(),
        timestamp: Date.now(),
    };

    // Add to circular buffer
    breadcrumbs.push(fullBreadcrumb);
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs.shift();
    }

    // Optional debug logging (off by default)

    // Schedule async sync to Crashlytics
    if (isFirebaseReportingEnabled()) {
        scheduleCrashlyticsSync();
    }
};

/**
 * Get all breadcrumbs
 */
export const getBreadcrumbs = (): ActivityBreadcrumb[] => {
    return [...breadcrumbs];
};

/**
 * Clear all breadcrumbs
 */
export const clearBreadcrumbs = (): void => {
    breadcrumbs = [];
};

/**
 * Schedule a debounced sync to Crashlytics
 */
const scheduleCrashlyticsSync = (): void => {
    if (pendingSync) return;

    pendingSync = true;

    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }

    syncTimeout = setTimeout(() => {
        syncToCrashlytics();
        pendingSync = false;
    }, SYNC_INTERVAL_MS);
};

/**
 * Sync breadcrumbs to Crashlytics
 */
const syncToCrashlytics = (): void => {
    if (!isFirebaseReportingEnabled()) {
        return;
    }

    try {
        const crashlytics = getCrashlytics();
        const recentBreadcrumbs = breadcrumbs.slice(-10); // Last 10 for attribute

        // Set last action as attribute
        if (recentBreadcrumbs.length > 0) {
            const lastAction = recentBreadcrumbs[recentBreadcrumbs.length - 1];
            setAttribute(crashlytics, 'last_user_action', `${lastAction.action}: ${lastAction.target}`);
            setAttribute(crashlytics, 'last_action_screen', lastAction.screen);
        }

        // Log recent trail
        const trail = recentBreadcrumbs
            .map((b) => {
                const time = new Date(b.timestamp).toLocaleTimeString();
                return `[${time}] ${b.screen} - ${b.action} - "${b.target}"`;
            })
            .join('\n');

        log(crashlytics, `[ACTIVITY_TRAIL]\n${trail}`);
    } catch (error) {
        // Silently fail - don't let tracking errors affect the app
        if (shouldDebugLog()) {
            originalConsoleLog('[ActivityTracker] Crashlytics sync error:', error);
        }
    }
};

/**
 * Force sync all breadcrumbs to Crashlytics (call before crash reporting)
 */
export const forceSyncBreadcrumbs = (): void => {
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    syncToCrashlytics();
};

/**
 * Log activity to Firebase Analytics
 */
export const logActivityToAnalytics = (action: string, target: string, screen: string): void => {
    if (!isFirebaseReportingEnabled()) {
        return;
    }

    setImmediate(() => {
        try {
            const analytics = getAnalytics();
            logEvent(analytics, 'user_interaction', {
                action_type: action,
                target_element: target.substring(0, 100), // Limit length
                screen_name: screen,
            });
        } catch (error) {
            // Silently fail
            if (shouldDebugLog()) {
                originalConsoleLog('[ActivityTracker] Analytics error:', error);
            }
        }
    });
};

/**
 * Wrapper to track function calls with their arguments
 *
 * Usage:
 * const handleLogin = trackFunction('handleLogin', async (provider) => {
 *   // Your code here
 * });
 */
export function trackFunction<T extends (...args: any[]) => any>(functionName: string, fn: T, options?: { trackArgs?: boolean; screen?: string }): T {
    const wrapped = ((...args: Parameters<T>): ReturnType<T> => {
        // Track the function call asynchronously
        setImmediate(() => {
            const metadata: Record<string, any> = {};

            if (options?.trackArgs && args.length > 0) {
                // Safely serialize arguments (limit size)
                try {
                    const argsPreview = args.map((arg, i) => {
                        if (arg === null) return 'null';
                        if (arg === undefined) return 'undefined';
                        if (typeof arg === 'object') {
                            try {
                                const str = JSON.stringify(arg);
                                return str.length > 100 ? str.substring(0, 100) + '...' : str;
                            } catch {
                                return '[Object]';
                            }
                        }
                        const str = String(arg);
                        return str.length > 50 ? str.substring(0, 50) + '...' : str;
                    });
                    metadata.args = argsPreview;
                } catch {
                    metadata.args = '[Unable to serialize]';
                }
            }

            addBreadcrumb({
                screen: options?.screen || currentScreen,
                action: 'function_call',
                target: functionName,
                targetType: 'Function',
                functionName,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            });
        });

        // Execute the original function immediately
        return fn(...args);
    }) as T;

    // Preserve function name for debugging
    Object.defineProperty(wrapped, 'name', { value: functionName });

    return wrapped;
}

/**
 * Extract button identifier from various sources
 */
export const extractButtonIdentifier = (props: any): string => {
    // Priority order for identification
    if (props?.testID) return props.testID;
    if (props?.accessibilityLabel) return props.accessibilityLabel;
    if (props?.title) return props.title;

    // Try to extract text content
    if (typeof props?.children === 'string') return props.children;
    if (Array.isArray(props?.children) && props.children.every((c: any) => typeof c === 'string')) {
        const joined = props.children.join(' ').trim();
        if (joined) return joined;
    }

    // Check for Button.Text in Tamagui
    if (props?.children) {
        const children = Array.isArray(props.children) ? props.children : [props.children];
        for (const child of children) {
            if (typeof child === 'string') return child;
            if (child?.props?.children) {
                if (typeof child.props.children === 'string') {
                    return child.props.children;
                }
                if (Array.isArray(child.props.children) && child.props.children.every((c: any) => typeof c === 'string')) {
                    const joined = child.props.children.join(' ').trim();
                    if (joined) return joined;
                }
            }
            // Check for nested Text components
            if (child?.type?.displayName === 'Text' || child?.type?.name === 'Text') {
                if (typeof child.props?.children === 'string') {
                    return child.props.children;
                }
            }

            // Tamagui Button.Text (sometimes has distinct displayName)
            const displayName = child?.type?.displayName || child?.type?.name;
            if (displayName && String(displayName).toLowerCase().includes('button') && child?.props?.children) {
                if (typeof child.props.children === 'string') {
                    return child.props.children;
                }
                if (Array.isArray(child.props.children) && child.props.children.every((c: any) => typeof c === 'string')) {
                    const joined = child.props.children.join(' ').trim();
                    if (joined) return joined;
                }
            }
        }
    }

    return 'Unknown Button';
};

/**
 * Get function name from handler
 */
export const getFunctionName = (fn: any): string | undefined => {
    if (!fn) return undefined;
    if (typeof fn !== 'function') return undefined;

    // Check for named function
    if (fn.name && fn.name !== 'anonymous' && fn.name !== '') {
        return fn.name;
    }

    // Try to extract from toString (arrow functions)
    const fnStr = fn.toString();
    const arrowMatch = fnStr.match(/^const\s+(\w+)\s*=/);
    if (arrowMatch) return arrowMatch[1];

    return undefined;
};

/**
 * Enable global tracking by patching React.createElement
 * This allows tracking of all onPress events without manual wrapping
 */
let isTrackingEnabled = false;

let isPressabilityPatched = false;

let isJsxRuntimePatched = false;

type AnyFn = (...args: any[]) => any;

const wrapHandlerWithTracking = (opts: {
    handler: AnyFn;
    actionType: string;
    props: any;
    children: any[];
    componentName?: string;
    eventProp?: string;
    source: 'createElement' | 'jsx-runtime' | 'Pressability';
}): AnyFn => {
    const { handler, actionType, props, children, componentName, eventProp, source } = opts;

    if (typeof handler !== 'function') return handler;
    if ((handler as any).__isActivityTracked) return handler;

    const handlerName = getFunctionName(handler) || 'anonymous';

    const wrapped: AnyFn = (...args: any[]) => {
        const target = extractButtonIdentifier({
            ...props,
            children: children.length > 0 ? children : props?.children,
        });

        if (shouldDebugLog()) {
            const loc = componentName && eventProp ? ` (${componentName}.${eventProp})` : '';
            originalConsoleLog(`[ActivityTracker] ${actionType} "${target}" -> ${handlerName}() @ ${currentScreen} (${source})${loc}`);
        }

        setImmediate(() => {
            addBreadcrumb({
                screen: currentScreen,
                action: actionType,
                target,
                targetType: 'Button',
                functionName: handlerName,
                metadata: {
                    source,
                    component: componentName,
                    eventProp,
                },
            });

            logActivityToAnalytics(actionType, target, currentScreen);
        });

        return handler(...args);
    };

    // Mark + store metadata so downstream systems (Pressability/Tamagui) can still identify it.
    (wrapped as any).__isActivityTracked = true;
    (wrapped as any).__activityTrackerHandlerName = handlerName;
    (wrapped as any).__activityTrackerSource = source;
    (wrapped as any).__activityTrackerComponent = componentName;
    (wrapped as any).__activityTrackerEventProp = eventProp;
    // Best-effort label at wrap-time (useful if later systems lose access to children)
    try {
        (wrapped as any).__activityTrackerTarget = extractButtonIdentifier({
            ...props,
            children: children.length > 0 ? children : props?.children,
        });
    } catch {
        // ignore
    }

    return wrapped;
};

const tryPatchJsxRuntime = (): void => {
    if (isJsxRuntimePatched) return;

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jsxRuntime = require('react/jsx-runtime');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const jsxDevRuntime = require('react/jsx-dev-runtime');

        const patchModule = (mod: any, keys: string[]) => {
            if (!mod) return;
            for (const key of keys) {
                const original = mod[key];
                if (typeof original !== 'function' || (original as any).__activityTrackerPatched) continue;

                mod[key] = (type: any, props: any, ...rest: any[]) => {
                    try {
                        if (props && typeof props === 'object') {
                            const componentName = type?.displayName || type?.name;
                            const children = (props as any)?.children;
                            const childArray = Array.isArray(children) ? children : children != null ? [children] : [];

                            const wrapProp = (propName: string, actionType: string) => {
                                if (typeof (props as any)[propName] === 'function') {
                                    (props as any)[propName] = wrapHandlerWithTracking({
                                        handler: (props as any)[propName],
                                        actionType,
                                        props,
                                        children: childArray,
                                        componentName,
                                        eventProp: propName,
                                        source: 'jsx-runtime',
                                    });
                                }
                            };

                            // Most common interaction props
                            wrapProp('onPress', 'press');
                            wrapProp('onClick', 'click');
                            wrapProp('onPressIn', 'press_in');
                            wrapProp('onLongPress', 'long_press');
                        }
                    } catch {
                        // ignore
                    }

                    return original(type, props, ...rest);
                };

                (mod[key] as any).__activityTrackerPatched = true;
            }
        };

        patchModule(jsxRuntime, ['jsx', 'jsxs']);
        patchModule(jsxDevRuntime, ['jsxDEV']);

        isJsxRuntimePatched = true;
        if (shouldDebugLog()) {
            originalConsoleLog('[ActivityTracker] JSX runtime patch enabled (automatic runtime support)');
        }
    } catch (error) {
        if (shouldDebugLog()) {
            originalConsoleLog('[ActivityTracker] JSX runtime patch error:', error);
        }
    }
};

const tryPatchPressability = (): void => {
    if (isPressabilityPatched) return;
    // Pressability is a React Native concept; skip on web.
    if (Platform.OS === 'web') return;

    try {
        // Pressability is not part of RN public API; require dynamically and fail safely.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pressabilityModule = require('react-native/Libraries/Pressability/Pressability');
        const Pressability = pressabilityModule?.default ?? pressabilityModule;

        if (!Pressability?.prototype?.configure || typeof Pressability.prototype.configure !== 'function') {
            if (shouldDebugLog()) {
                originalConsoleLog('[ActivityTracker] Pressability patch skipped: configure() not found');
            }
            return;
        }

        const originalConfigure = Pressability.prototype.configure;

        Pressability.prototype.configure = function patchedConfigure(config: any, ...rest: any[]) {
            try {
                const wrap = (handler: any, actionType: string) => {
                    if (typeof handler !== 'function' || handler.__isActivityTracked) return handler;

                    const wrapped = (...args: any[]) => {
                        const handlerName = (handler as any).__activityTrackerHandlerName || getFunctionName(handler) || 'anonymous';
                        const buttonId = (handler as any).__activityTrackerTarget || config?.testID || config?.accessibilityLabel || config?.accessibilityRole || 'Pressable';

                        setImmediate(() => {
                            addBreadcrumb({
                                screen: currentScreen,
                                action: actionType,
                                target: String(buttonId),
                                targetType: 'Pressable',
                                functionName: handlerName,
                                metadata: {
                                    source: 'Pressability',
                                },
                            });
                            logActivityToAnalytics(actionType, String(buttonId), currentScreen);
                        });

                        return handler(...args);
                    };

                    wrapped.__isActivityTracked = true;
                    return wrapped;
                };

                if (config && typeof config === 'object') {
                    if (config.onPress) config.onPress = wrap(config.onPress, 'press');
                    if (config.onLongPress) config.onLongPress = wrap(config.onLongPress, 'long_press');
                    if (config.onPressIn) config.onPressIn = wrap(config.onPressIn, 'press_in');
                }
            } catch {
                // ignore
            }

            return originalConfigure.call(this, config, ...rest);
        };

        isPressabilityPatched = true;
        if (shouldDebugLog()) {
            originalConsoleLog('[ActivityTracker] Pressability patch enabled');
        }
    } catch (error) {
        // Silently fail - don't let tracking errors affect the app
        if (shouldDebugLog()) {
            originalConsoleLog('[ActivityTracker] Pressability patch error:', error);
        }
    }
};

export const enableGlobalTracking = (): void => {
    if (isTrackingEnabled) return;
    isTrackingEnabled = true;

    if (shouldDebugLog()) {
        originalConsoleLog('[ActivityTracker] Enabling global interaction tracking...');
    }

    // Works even if JSX uses the automatic runtime (no React.createElement).
    tryPatchJsxRuntime();

    // More reliable than JSX interception for RN: hooks into the press system.
    tryPatchPressability();

    const originalCreateElement = React.createElement;
    let didLogCreateElementPatched = false;

    // @ts-ignore - Patching React internals
    React.createElement = (type: any, props: any, ...children: any[]) => {
        if (shouldDebugLog() && !didLogCreateElementPatched) {
            didLogCreateElementPatched = true;
            originalConsoleLog('[ActivityTracker] React.createElement patch active');
        }
        // Skip if no props or props is not an object
        if (!props || typeof props !== 'object') {
            return originalCreateElement.apply(React, [type, props, ...children]);
        }

        let newProps: any = props;
        let hasChanges = false;

        // Helper to check and wrap a specific event prop
        const checkAndWrap = (propName: string, actionType: string) => {
            if (typeof props[propName] === 'function' && !(props[propName] as any).__isActivityTracked) {
                const originalHandler = props[propName];
                const typeName = type?.displayName || type?.name || 'UnknownComponent';
                const handlerName = getFunctionName(originalHandler) || 'anonymous';

                const wrappedHandler = (...args: any[]) => {
                    const buttonId = extractButtonIdentifier({
                        ...props,
                        children: children.length > 0 ? children : props.children,
                    });

                    if (shouldDebugLog()) {
                        originalConsoleLog(`[ActivityTracker] ${actionType} "${buttonId}" -> ${handlerName}() @ ${currentScreen} (${typeName}.${propName})`);
                    }

                    setImmediate(() => {
                        addBreadcrumb({
                            screen: currentScreen,
                            action: actionType,
                            target: buttonId,
                            targetType: 'Button',
                            functionName: handlerName,
                            metadata: {
                                component: typeName,
                                eventProp: propName,
                                source: 'createElement',
                            },
                        });

                        logActivityToAnalytics(actionType, buttonId, currentScreen);
                    });

                    return originalHandler(...args);
                };

                // Mark as tracked
                (wrappedHandler as any).__isActivityTracked = true;

                // If we haven't cloned props yet, check if we need to (we reuse newProps if it's already a clone)
                if (!hasChanges) {
                    newProps = { ...props };
                    hasChanges = true;
                }

                newProps[propName] = wrappedHandler;
                return true;
            }
            return false;
        };

        // Check for common interaction handlers
        const wrappedPress = checkAndWrap('onPress', 'press');
        const wrappedClick = checkAndWrap('onClick', 'click');

        // Also check onPressIn as some components use it
        checkAndWrap('onPressIn', 'press_in');

        // Debug log for buttons that SHOULD be tracked but maybe aren't matching
        if (shouldDebugLog()) {
            const typeName = type?.displayName || type?.name || '';
            if (typeName.includes('Button') || (props.testID && props.testID.includes('btn'))) {
                if (!wrappedPress && !wrappedClick && !props.disabled) {
                    // console.log(`[ActivityTracker] Button detected but no handler wrapped: ${typeName}`, Object.keys(props));
                }
                if (wrappedPress || wrappedClick) {
                    // console.log(`[ActivityTracker] Successfully wrapped Button: ${typeName}`);
                }
            }
        }

        return originalCreateElement.apply(React, [type, newProps, ...children]);
    };
};
