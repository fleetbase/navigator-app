/**
 * Settings — R2 frame H1.
 *
 * Composed entirely from Waypoint components. Two things the frame is specific
 * about and which are easy to get wrong:
 *
 * - The tracking warning is a **banner at the top**, not a row in a list. It is
 *   a consequence ("dispatch can't see your progress"), not a preference.
 * - Theme offers five choices — System plus the four schemes — because night
 *   and sunlight are deliberate driver decisions that must never be inferred
 *   from the OS.
 */
import { ScrollView } from 'react-native';
import { XStack, YStack, Switch } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Surface, Divider } from '../ui/Surface';
import { Segmented } from '../ui/Field';
import { ListRow } from '../ui/Rows';
import { space } from '../theme/tokens';
import { useSettings, useSetSetting } from '../settings';
import type { ThemePreference, UnitPreference } from '../settings';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'night', label: 'Night' },
    { value: 'sunlight', label: 'Sunlight' },
];

const UNIT_OPTIONS: { value: UnitPreference; label: string }[] = [
    { value: 'metric', label: 'Metric' },
    { value: 'imperial', label: 'Imperial' },
];

const NAV_APPS: Record<string, string> = { apple: 'Apple Maps', google: 'Google Maps', waze: 'Waze' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <YStack gap={space[2]}>
            <Caption paddingHorizontal={space[1]}>{title}</Caption>
            <Surface>{children}</Surface>
        </YStack>
    );
}

function ToggleRow({
    label,
    hint,
    value,
    onChange,
    testID,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
    testID?: string;
}) {
    return (
        <XStack alignItems="center" gap={space[3]} paddingHorizontal={space[4]} paddingVertical={space[3]} minHeight={56}>
            <YStack flex={1} gap={2}>
                <Body fontSize={15}>{label}</Body>
                {hint ? <Micro>{hint}</Micro> : null}
            </YStack>
            <Switch
                testID={testID}
                size="$3"
                checked={value}
                onCheckedChange={onChange}
                backgroundColor={value ? '$primary' : '$surfaceRaised'}
                borderColor="$border"
                borderWidth={1}
                accessibilityLabel={label}
            >
                <Switch.Thumb animation="quick" backgroundColor="$white" />
            </Switch>
        </XStack>
    );
}

export interface SettingsScreenProps {
    /** From LocationContext. The banner is the consequence, not a preference. */
    trackingEnabled?: boolean;
    onEnableTracking?: () => void;
    onManageStorage?: () => void;
    onSendDiagnostics?: () => void;
    /** e.g. "184 MB · maps, photos, queued work" */
    cacheSummary?: string;
    appVersion?: string;
    organizationName?: string;
}

export function SettingsScreen({
    trackingEnabled = true,
    onEnableTracking,
    onManageStorage,
    onSendDiagnostics,
    cacheSummary,
    appVersion,
    organizationName,
}: SettingsScreenProps) {
    const settings = useSettings();
    const set = useSetSetting();

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[5] }} testID="settings-screen">
            {!trackingEnabled ? (
                <Banner
                    tone="warning"
                    message="Background tracking is off"
                    action={onEnableTracking ? { label: 'Turn on', onPress: onEnableTracking } : undefined}
                    testID="tracking-warning"
                />
            ) : null}
            {!trackingEnabled ? (
                <Micro paddingHorizontal={space[1]} marginTop={-space[4]}>
                    Dispatch can&apos;t see your progress · required on duty
                </Micro>
            ) : null}

            <Section title="APPEARANCE">
                <YStack padding={space[4]} gap={space[3]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Body fontSize={15}>Theme</Body>
                        <Secondary fontSize={13}>{THEME_OPTIONS.find((o) => o.value === settings.theme)?.label}</Secondary>
                    </XStack>
                    {/* Five options wrap on narrow devices rather than shrinking below the tap target. */}
                    <XStack flexWrap="wrap" gap={space[2]}>
                        <Segmented
                            options={THEME_OPTIONS.slice(0, 3)}
                            value={(settings.theme === 'night' || settings.theme === 'sunlight' ? 'system' : settings.theme) as ThemePreference}
                            onChange={(v) => set('theme', v)}
                            testID="theme-primary"
                        />
                        <Segmented
                            options={THEME_OPTIONS.slice(3)}
                            value={settings.theme}
                            onChange={(v) => set('theme', v)}
                            testID="theme-driving"
                        />
                    </XStack>
                </YStack>
                <Divider />
                <ListRow name="Language" meta={settings.language} />
                <Divider />
                <YStack padding={space[4]} gap={space[3]}>
                    <Body fontSize={15}>Units</Body>
                    <Segmented options={UNIT_OPTIONS} value={settings.units} onChange={(v) => set('units', v)} testID="units" />
                </YStack>
                <Divider />
                <ListRow name="Navigation app" meta={NAV_APPS[settings.navigationApp]} />
            </Section>

            <Section title="NOTIFICATIONS">
                <ToggleRow
                    label="New work assigned"
                    value={settings.notifyNewWork}
                    onChange={(v) => set('notifyNewWork', v)}
                    testID="notify-new-work"
                />
                <Divider />
                <ToggleRow
                    label="Dispatch messages"
                    value={settings.notifyDispatchMessages}
                    onChange={(v) => set('notifyDispatchMessages', v)}
                    testID="notify-dispatch"
                />
                <Divider />
                <ToggleRow
                    label="Nearby offers"
                    hint="Interrupts even in Do Not Disturb"
                    value={settings.notifyNearbyOffers}
                    onChange={(v) => set('notifyNearbyOffers', v)}
                    testID="notify-offers"
                />
            </Section>

            <Section title="STORAGE & DIAGNOSTICS">
                <XStack alignItems="center" gap={space[3]} padding={space[4]}>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={15}>Offline cache</Body>
                        {cacheSummary ? <Micro tabular>{cacheSummary}</Micro> : null}
                    </YStack>
                    <Button variant="secondary" height={38} onPress={onManageStorage}>
                        Manage
                    </Button>
                </XStack>
                <Divider />
                <ListRow name="Send diagnostics" onPress={onSendDiagnostics} />
            </Section>

            <Micro center paddingBottom={space[6]}>
                {[appVersion, organizationName].filter(Boolean).join(' · ')}
            </Micro>
        </ScrollView>
    );
}

export default SettingsScreen;
