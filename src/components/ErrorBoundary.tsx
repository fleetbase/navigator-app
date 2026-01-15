import { getCrashlytics, log, recordError, setAttribute, setCrashlyticsCollectionEnabled } from '@react-native-firebase/crashlytics';
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { isFirebaseReportingEnabled } from '../utils/firebaseHelper';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log the error to Crashlytics using modular API
        this.logToCrashlytics(error, errorInfo);

        this.setState({
            error,
            errorInfo,
        });
    }

    logToCrashlytics = async (error: Error, errorInfo: ErrorInfo) => {
        if (!isFirebaseReportingEnabled()) {
            return;
        }

        try {
            const crashlytics = getCrashlytics();

            // Ensure crash reporting is enabled
            await setCrashlyticsCollectionEnabled(crashlytics, true);

            // Set context attributes first
            await setAttribute(crashlytics, 'error_boundary', 'true');
            await setAttribute(crashlytics, 'error_message', error.message || 'Unknown error');
            await setAttribute(crashlytics, 'error_name', error.name || 'Error');
            await setAttribute(crashlytics, 'platform', Platform.OS);
            await setAttribute(crashlytics, 'app_version', DeviceInfo.getVersion());
            await setAttribute(crashlytics, 'build_number', DeviceInfo.getBuildNumber());

            // Log component stack (truncated to avoid limits)
            const componentStack = errorInfo.componentStack || '';
            await setAttribute(crashlytics, 'component_stack', componentStack.substring(0, 1000));

            // Extract and log the likely source component
            const sourceComponent = this.extractSourceComponent(componentStack);
            if (sourceComponent) {
                await setAttribute(crashlytics, 'source_component', sourceComponent);
            }

            // Log breadcrumb
            log(crashlytics, `[ErrorBoundary] ${error.name}: ${error.message}`);
            log(crashlytics, `[ErrorBoundary] Source: ${sourceComponent || 'Unknown'}`);

            // Record the error - this is a non-fatal error report
            // Create a proper Error object if needed
            const errorToRecord = error instanceof Error ? error : new Error(String(error));
            await recordError(crashlytics, errorToRecord);

            console.log('[ErrorBoundary] Error logged to Crashlytics successfully');
        } catch (e) {
            console.warn('[ErrorBoundary] Failed to log to Crashlytics:', e);
        }
    };

    // Extract the most likely source component from the stack
    extractSourceComponent = (componentStack: string | null): string | null => {
        if (!componentStack) return null;

        // Parse component stack to find user components (skip RCT*, View, etc.)
        const lines = componentStack.split('\n').filter(line => line.trim());
        const userComponents: string[] = [];

        for (const line of lines) {
            const match = line.match(/in\s+(\w+)/);
            if (match) {
                const componentName = match[1];
                // Skip React Native internal components
                if (!componentName.startsWith('RCT') &&
                    !['View', 'Text', 'ScrollView', 'TouchableOpacity'].includes(componentName)) {
                    userComponents.push(componentName);
                }
            }
        }

        // Return first few user components as likely source
        return userComponents.slice(0, 3).join(' → ') || null;
    };

    handleRestart = () => {
        // Simple state reset to attempt recovery
        try {
            this.setState({ hasError: false, error: null, errorInfo: null });
        } catch (e) {
            console.log('Restart failed', e);
        }
    };

    render() {
        if (this.state.hasError) {
            // Use ONLY React Native primitives - no Tamagui components!
            // This ensures the fallback UI renders even if TamaguiProvider is broken
            return (
                <View style={styles.container}>
                    <Text style={styles.emoji}>😕</Text>
                    <Text style={styles.title}>Oops! Something went wrong.</Text>
                    <Text style={styles.subtitle}>
                        We have logged this issue and will fix it as soon as possible.
                    </Text>

                    {/* Show error details in DEV mode only */}
                    {__DEV__ && this.state.error && (
                        <ScrollView style={styles.debugScroll}>
                            <Text style={styles.errorText}>
                                {this.state.error.toString()}
                            </Text>
                            {this.state.errorInfo && (
                                <Text style={styles.stackText}>
                                    {this.state.errorInfo.componentStack}
                                </Text>
                            )}
                        </ScrollView>
                    )}



                    <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
                        <Text style={styles.buttonText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a2e',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    emoji: {
        fontSize: 60,
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#a0a0a0',
        textAlign: 'center',
        marginBottom: 24,
    },
    debugScroll: {
        maxHeight: 200,
        width: '100%',
        backgroundColor: '#0d0d1a',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        fontSize: 12,
        color: '#ff6b6b',
        fontFamily: 'monospace',
    },
    stackText: {
        fontSize: 10,
        color: '#888888',
        fontFamily: 'monospace',
        marginTop: 8,
    },
    button: {
        backgroundColor: '#4a90d9',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 8,
        marginTop: 8,
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '600',
    },
});
