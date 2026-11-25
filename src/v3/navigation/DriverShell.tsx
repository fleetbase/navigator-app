/**
 * Driver shell — persistent chrome above the tab graph.
 *
 * Order matters: safe area → header (org + duty) → connectivity strip → tabs.
 * The strip sits below the header so it pushes content rather than covering the
 * duty control, and renders nothing at all when there is nothing to say.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { DriverTabs, type Features } from './DriverTabs';
import type { TabBadges } from './TabBar';
import { DutySheet, OfflineBar, useDuty } from '../shell';
import { space } from '../theme/tokens';

/**
 * What the shell knows that a screen may show: whose work this is, and how to
 * open the duty sheet. Round 3 has no shared header row; each screen draws its
 * own, and the dashboard carries the duty control.
 */
export interface ShellValue {
    organizationName: string;
    /** The driver's name, when known. */
    driverName?: string;
    openDutySheet: () => void;
}

const ShellContext = createContext<ShellValue>({ organizationName: '', openDutySheet: () => {} });

export function useShell(): ShellValue {
    return useContext(ShellContext);
}

export function DriverShell({
    organizationName,
    subtitle,
    badges,
    activeStopCount = 0,
    driverId,
    driverUserId,
    onSignOut,
    organizationId,
    onOrganizationSwitched,
    features,
}: {
    organizationName: string;
    subtitle?: string;
    badges?: TabBadges;
    activeStopCount?: number;
    /** Scopes order queries to the signed-in driver. */
    driverId?: string;
    driverUserId?: string;
    onSignOut?: () => void;
    organizationId?: string;
    onOrganizationSwitched?: (driver: unknown) => void;
    features?: Features;
}) {
    const insets = useSafeAreaInsets();
    const { duty, isChanging, breakSupported, setDuty, error } = useDuty();
    const [sheetOpen, setSheetOpen] = useState(false);

    const handleSelect = useCallback(
        async (next: typeof duty) => {
            await setDuty(next);
            // Keep the sheet open on failure so the error is visible next to the
            // control that produced it.
            setSheetOpen(false);
        },
        [setDuty]
    );

    const shell = useMemo<ShellValue>(() => ({ organizationName, driverName: subtitle, openDutySheet: () => setSheetOpen(true) }), [organizationName, subtitle]);

    return (
        <ShellContext.Provider value={shell}>
        <YStack flex={1} backgroundColor="$background" paddingTop={insets.top}>
            <YStack paddingHorizontal={space[4]}>
                <OfflineBar />
            </YStack>

            <YStack flex={1}>
                <DriverTabs badges={badges} driverId={driverId} driverUserId={driverUserId} onSignOut={onSignOut} organizationId={organizationId} onOrganizationSwitched={onOrganizationSwitched} features={features} />
            </YStack>

            <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
                <Pressable style={{ flex: 1, backgroundColor: '#0008' }} onPress={() => setSheetOpen(false)} accessibilityLabel="Dismiss" />
                <YStack paddingBottom={Math.max(insets.bottom, space[4])} paddingHorizontal={space[3]} backgroundColor="$transparent">
                    <DutySheet
                        duty={duty}
                        breakSupported={breakSupported}
                        isChanging={isChanging}
                        error={error}
                        activeStopCount={activeStopCount}
                        onSelect={handleSelect}
                        onDismiss={() => setSheetOpen(false)}
                    />
                </YStack>
            </Modal>
        </YStack>
        </ShellContext.Provider>
    );
}

export default DriverShell;
