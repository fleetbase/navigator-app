/**
 * Driver shell — persistent chrome above the tab graph.
 *
 * Order matters: safe area → header (org + duty) → connectivity strip → tabs.
 * The strip sits below the header so it pushes content rather than covering the
 * duty control, and renders nothing at all when there is nothing to say.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SheetModal } from '../ui/SheetModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { DriverTabs, type Features } from './DriverTabs';
import type { TabBadges } from './TabBar';
import { DutySheet, OfflineBar, useDuty, useSync } from '../shell';
import { OrgSheet } from '../shell/OrgSheet';
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
    /** Opens the organisation switcher over whatever screen is in front. */
    openOrgSheet: () => void;
    /**
     * Lets the screen in front draw up to the very top of the display, under the
     * status bar (the dashboard's map does). The shell then stops padding for the
     * status bar; the screen pads its own content. Set on focus, cleared on blur.
     */
    setBleedTop: (bleed: boolean) => void;
}

const ShellContext = createContext<ShellValue>({ organizationName: '', openDutySheet: () => {}, openOrgSheet: () => {}, setBleedTop: () => {} });

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

    const [bleedTop, setBleedTop] = useState(false);
    const [orgSheetOpen, setOrgSheetOpen] = useState(false);
    const shell = useMemo<ShellValue>(() => ({ organizationName, driverName: subtitle, openDutySheet: () => setSheetOpen(true), openOrgSheet: () => setOrgSheetOpen(true), setBleedTop }), [organizationName, subtitle]);
    /*
     * The strip about signal and syncing. Under a screen with a header it sits
     * in the flow, above the screen. Over a screen that draws to the top edge
     * (Home's map) it floats under the chips instead, so it covers nothing but
     * its own width of map.
     */
    const padTop = bleedTop ? 0 : insets.top;

    return (
        <ShellContext.Provider value={shell}>
        <YStack flex={1} backgroundColor="$background" paddingTop={padTop}>
            {bleedTop ? null : (
                <YStack paddingHorizontal={space[4]}>
                    <OfflineBar />
                </YStack>
            )}

            <YStack flex={1}>
                <DriverTabs badges={badges} driverId={driverId} driverUserId={driverUserId} onSignOut={onSignOut} organizationId={organizationId} onOrganizationSwitched={onOrganizationSwitched} features={features} />
            </YStack>

            {bleedTop ? (
                <YStack position="absolute" top={insets.top + 54} left={space[3]} right={space[3]} pointerEvents="box-none" testID="shell-floating-strip">
                    {/* A solid backing: the strip's own tint is see-through, and a map shows through it. */}
                    <YStack backgroundColor="$background" borderRadius={14} overflow="hidden">
                        <OfflineBar />
                    </YStack>
                </YStack>
            ) : null}

            {/* SheetModal fades the dimming and slides only the sheet. */}
            <SheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)} testID="duty-modal">
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
            </SheetModal>

            <SheetModal visible={orgSheetOpen} onClose={() => setOrgSheetOpen(false)} testID="org-modal">
                <YStack paddingBottom={Math.max(insets.bottom, space[4])} backgroundColor="$surface" borderTopLeftRadius={26} borderTopRightRadius={26}>
                    <OrgSheet visible={orgSheetOpen} driverId={driverId} currentOrganizationId={organizationId} onSwitched={onOrganizationSwitched} onDismiss={() => setOrgSheetOpen(false)} />
                </YStack>
            </SheetModal>
        </YStack>
        </ShellContext.Provider>
    );
}

export default DriverShell;
