import { getAnalytics, logEvent } from '@react-native-firebase/analytics';
import { getCrashlytics, log, recordError, setAttribute } from '@react-native-firebase/crashlytics';
import type { FirebasePerformanceTypes } from '@react-native-firebase/perf';
import { getPerformance, trace } from '@react-native-firebase/perf';

// Declare ErrorUtils for TypeScript (React Native global)
declare const ErrorUtils: {
    getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
    setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

let currentTrace: FirebasePerformanceTypes.Trace | null = null;

export const isFirebaseReportingEnabled = (): boolean => {
    return !__DEV__;
};

// Lazy getters to avoid initialization at module load time
const getFirebaseInstances = () => {
    const analytics = getAnalytics();
    const crashlytics = getCrashlytics();
    const performance = getPerformance();
    return { analytics, crashlytics, performance };
};

/**
 * Logs screen view events to Firebase Analytics, Crashlytics, and Performance Monitoring.
 *
 * @param currentRouteName - The name of the current screen/route.
 */
export const logScreenView = async (currentRouteName: string) => {
    if (!currentRouteName) {
        return;
    }

    if (!isFirebaseReportingEnabled()) {
        return;
    }

    try {
        const { analytics, crashlytics, performance } = getFirebaseInstances();

        // 1. Log to Analytics using modular API - use generic logEvent for screen_view
        await logEvent(analytics, 'screen_view' as any, {
            screen_name: currentRouteName,
            screen_class: currentRouteName,
        });

        // 2. Log to Crashlytics using modular API
        log(crashlytics, `Navigated to ${currentRouteName}`);
        await setAttribute(crashlytics, 'current_screen', currentRouteName);

        // 3. Performance Tracing
        // Stop the previous trace if it exists
        if (currentTrace) {
            await currentTrace.stop();
            currentTrace = null;
        }

        // Start a new trace for the current screen using modular API
        const traceName = `screen_${currentRouteName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 32)}`;
        currentTrace = trace(performance, traceName);
        if (currentTrace) {
            await currentTrace.start();
        } else {
            console.warn('[FirebaseHelper] Failed to create performance trace for:', traceName);
        }
    } catch (error) {
        console.warn('[FirebaseHelper] logScreenView error:', error);
    }
};

/**
 * Stops the currently active performance trace.
 */
export const stopActiveTrace = async () => {
    if (currentTrace) {
        await currentTrace.stop();
        currentTrace = null;
    }
};

// Store original console methods before overriding
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// ============================================================
// TWO-PHASE ERROR HANDLING SYSTEM
// Phase 1: Set up ErrorUtils immediately (no Firebase dependency)
// Phase 2: Connect to Crashlytics once Firebase is ready
// ============================================================

let isEarlyHandlerSetup = false;
let isCrashlyticsConnected = false;

// Queue to store errors that occur before Crashlytics is ready
let pendingErrors: Array<{ error: Error; isFatal: boolean }> = [];
let crashlyticsInstance: ReturnType<typeof getCrashlytics> | null = null;

/**
 * Phase 1: Sets up ErrorUtils handler immediately.
 * This has NO Firebase dependency, so it can be safely called at module level.
 * Errors are queued until Crashlytics is connected.
 */
export const setupEarlyErrorHandler = () => {
    if (!isFirebaseReportingEnabled()) {
        return;
    }

    if (isEarlyHandlerSetup) {
        return;
    }
    isEarlyHandlerSetup = true;

    try {
        const defaultGlobalHandler = ErrorUtils.getGlobalHandler();

        ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
            // Ensure we have a proper error object
            const errorToReport = error instanceof Error ? error : new Error(String(error));

            originalConsoleLog(`[ErrorHandler] Caught ${isFatal ? 'FATAL' : 'non-fatal'} error:`, errorToReport.name, errorToReport.message);

            // If Crashlytics is ready, log immediately; otherwise queue
            if (crashlyticsInstance && isCrashlyticsConnected) {
                try {
                    recordError(crashlyticsInstance, errorToReport);
                    log(crashlyticsInstance, `Fatal: ${isFatal}, ${errorToReport.name}: ${errorToReport.message}`);
                } catch (e) {
                    originalConsoleWarn('[ErrorHandler] Failed to record to Crashlytics:', e);
                }
            } else {
                // Queue the error for later
                pendingErrors.push({ error: errorToReport, isFatal: !!isFatal });
                originalConsoleLog('[ErrorHandler] Error queued (Crashlytics not ready yet)');
            }

            // Call the default handler for standard behavior (RedBox in dev, etc.)
            if (defaultGlobalHandler) {
                defaultGlobalHandler(error, isFatal);
            }
        });

        originalConsoleLog('[FirebaseHelper] Early error handler set up');
    } catch (e) {
        originalConsoleWarn('[FirebaseHelper] Failed to set up early error handler:', e);
    }
};

/**
 * Phase 2: Connects to Crashlytics and flushes any queued errors.
 * This should be called in a useEffect after Firebase is initialized.
 */
export const initializeCrashlytics = () => {
    if (!isFirebaseReportingEnabled()) {
        return;
    }

    if (isCrashlyticsConnected) {
        return;
    }

    try {
        crashlyticsInstance = getCrashlytics();
        isCrashlyticsConnected = true;

        // Flush any queued errors
        if (pendingErrors.length > 0) {
            originalConsoleLog(`[FirebaseHelper] Flushing ${pendingErrors.length} queued error(s) to Crashlytics`);
            pendingErrors.forEach(({ error, isFatal }) => {
                try {
                    recordError(crashlyticsInstance!, error);
                    log(crashlyticsInstance!, `[Queued] Fatal: ${isFatal}, ${error.name}: ${error.message}`);
                } catch (e) {
                    originalConsoleWarn('[FirebaseHelper] Failed to flush queued error:', e);
                }
            });
            pendingErrors = [];
        }

        // Set up console interception now that Crashlytics is ready
        setupConsoleInterception();

        originalConsoleLog('[FirebaseHelper] Crashlytics connected and ready');
    } catch (e) {
        originalConsoleWarn('[FirebaseHelper] Failed to initialize Crashlytics:', e);
    }
};

/**
 * Helper to set up console interception for Crashlytics logs.
 */
const setupConsoleInterception = () => {
    if (!crashlyticsInstance) return;

    const logToCrashlytics = (type: string, args: any[]) => {
        if (!crashlyticsInstance) return;

        try {
            const message = args
                .map((arg) => {
                    if (arg === null) return 'null';
                    if (arg === undefined) return 'undefined';
                    if (typeof arg === 'object') {
                        try {
                            return JSON.stringify(arg);
                        } catch {
                            return '[Object]';
                        }
                    }
                    return String(arg);
                })
                .join(' ');

            // Limit message length to avoid excessive data
            const truncatedMessage = message.substring(0, 500);
            log(crashlyticsInstance, `[${type}] ${truncatedMessage}`);
        } catch {
            // Silently fail if logging itself fails
        }
    };

    // Intercept console methods
    console.log = (...args: any[]) => {
        logToCrashlytics('LOG', args);
        originalConsoleLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
        logToCrashlytics('WARN', args);
        originalConsoleWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
        logToCrashlytics('ERROR', args);
        originalConsoleError.apply(console, args);
    };
};

/**
 * @deprecated Use setupEarlyErrorHandler() + initializeCrashlytics() instead.
 * Kept for backward compatibility.
 */
export const setupGlobalErrorHandlers = () => {
    setupEarlyErrorHandler();
    initializeCrashlytics();
};
