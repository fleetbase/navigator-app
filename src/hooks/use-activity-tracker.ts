/**
 * useActivityTracker Hook
 *
 * Provides easy access to activity tracking functionality.
 * Can be used for manual tracking of custom actions.
 */

import { useCallback } from 'react';
import {
    ActivityBreadcrumb,
    addBreadcrumb,
    clearBreadcrumbs,
    forceSyncBreadcrumbs,
    getBreadcrumbs,
    getCurrentScreen,
    logActivityToAnalytics,
    setCurrentScreen,
    trackFunction,
} from '../utils/activityInterceptor';

export interface UseActivityTrackerReturn {
    /**
     * Track a custom action (e.g., swipe, gesture, custom event)
     */
    trackAction: (action: string, target: string, metadata?: Record<string, any>) => void;

    /**
     * Track an error with context
     */
    trackError: (error: Error, metadata?: Record<string, any>) => void;

    /**
     * Get all recorded breadcrumbs
     */
    getBreadcrumbs: () => ActivityBreadcrumb[];

    /**
     * Clear all recorded breadcrumbs
     */
    clearBreadcrumbs: () => void;

    /**
     * Get the current screen name
     */
    getCurrentScreen: () => string;

    /**
     * Set the current screen name manually (if needed)
     */
    setCurrentScreen: (screen: string) => void;

    /**
     * Force sync breadcrumbs to Crashlytics immediately
     */
    forceSyncBreadcrumbs: () => void;

    /**
     * Wrap a function to automatically track its calls
     */
    trackFunction: typeof trackFunction;
}

/**
 * Hook for manual activity tracking
 *
 * Usage:
 * ```tsx
 * const { trackAction, trackError, trackFunction } = useActivityTracker();
 *
 * // Track a custom action
 * trackAction('swipe', 'order_card', { direction: 'left' });
 *
 * // Track an error
 * trackError(new Error('Something went wrong'), { orderId: '123' });
 *
 * // Wrap a function to track its calls
 * const handleSubmit = trackFunction('handleSubmit', async (data) => {
 *   // Your code here
 * }, { trackArgs: true });
 * ```
 */
export const useActivityTracker = (): UseActivityTrackerReturn => {
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
     * Track an error with current activity context
     */
    const trackError = useCallback((error: Error, metadata?: Record<string, any>) => {
        // Force sync first to ensure all breadcrumbs are available
        forceSyncBreadcrumbs();

        addBreadcrumb({
            screen: getCurrentScreen(),
            action: 'error',
            target: error.message,
            targetType: 'Error',
            metadata: {
                ...metadata,
                errorName: error.name,
                stack: error.stack?.substring(0, 500),
            },
        });
    }, []);

    return {
        trackAction,
        trackError,
        getBreadcrumbs,
        clearBreadcrumbs,
        getCurrentScreen,
        setCurrentScreen,
        forceSyncBreadcrumbs,
        trackFunction,
    };
};

export default useActivityTracker;
