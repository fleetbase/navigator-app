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
import { useTranslation } from '../i18n/useTranslation';
import type { ThemePreference, UnitPreference } from '../settings';
import { useScreenStyle } from '../ui/useScreenStyle';

/** Keys, not words — these tables are module-level and outlive a language change. */
const THEME_OPTIONS: { value: ThemePreference; labelKey: string }[] = [
    { value: 'system', labelKey: 'settings.themeSystem' },
    { value: 'light', labelKey: 'settings.themeLight' },
    { value: 'dark', labelKey: 'settings.themeDark' },
    { value: 'night', labelKey: 'settings.themeNight' },
    { value: 'sunlight', labelKey: 'settings.themeSunlight' },
];

const UNIT_OPTIONS: { value: UnitPreference; labelKey: string }[] = [
    { value: 'metric', labelKey: 'settings.unitsMetric' },
    { value: 'imperial', labelKey: 'settings.unitsImperial' },
];

/** Uber was added to the navigation hand-off but never here, so a driver whose
 *  default was Uber saw a blank row. Sourced from the hand-off's own list. */
const NAV_APP_LABEL_KEYS: Record<string, string> = {
    apple: 'handoff.apple',
    google: 'handoff.google',
    waze: 'handoff.waze',
    uber: 'handoff.uber',
};

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
    const { t } = useTranslation();
    const screen = useScreenStyle();

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[5] }} testID="settings-screen">
            {!trackingEnabled ? (
                <Banner
                    tone="warning"
                    message={t('settings.trackingOff')}
                    action={onEnableTracking ? { label: t('settings.turnOn'), onPress: onEnableTracking } : undefined}
                    testID="tracking-warning"
                />
            ) : null}
            {!trackingEnabled ? (
                <Micro paddingHorizontal={space[1]} marginTop={-space[4]}>
                    {t('settings.trackingOffHint')}
                </Micro>
            ) : null}

            <Section title={t('settings.appearance')}>
                <YStack padding={space[4]} gap={space[3]}>
                    <XStack justifyContent="space-between" alignItems="center">
                        <Body fontSize={15}>{t('settings.theme')}</Body>
                        <Secondary fontSize={13}>{t(THEME_OPTIONS.find((o) => o.value === settings.theme)?.labelKey ?? 'settings.themeSystem')}</Secondary>
                    </XStack>
                    {/* Stacked, not wrapped: five options across one row are
                        below the legible width on a phone. */}
                    <YStack gap={space[2]}>
                        {/*
                          * Each group shows a selection only when the current
                          * theme is one of *its* options. Coercing the other
                          * group's value to 'system' made picking Night or
                          * Sunlight light up System instead, so the choice
                          * looked like it had not taken.
                          */}
                        <Segmented
                            options={THEME_OPTIONS.slice(0, 3).map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                            value={settings.theme}
                            onChange={(v) => set('theme', v)}
                            testID="theme-primary"
                        />
                        <Segmented
                            options={THEME_OPTIONS.slice(3).map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                            value={settings.theme}
                            onChange={(v) => set('theme', v)}
                            testID="theme-driving"
                        />
                    </YStack>
                </YStack>
                <Divider />
                <ListRow name={t('settings.language')} meta={settings.language} />
                <Divider />
                <YStack padding={space[4]} gap={space[3]}>
                    <Body fontSize={15}>{t('settings.units')}</Body>
                    <Segmented options={UNIT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))} value={settings.units} onChange={(v) => set('units', v)} testID="units" />
                </YStack>
                <Divider />
                <ListRow
                    name={t('settings.navigationApp')}
                    meta={t(NAV_APP_LABEL_KEYS[settings.navigationApp] ?? 'handoff.apple')}
                />
            </Section>

            <Section title={t('settings.notifications')}>
                <ToggleRow
                    label={t('settings.notifyNewWork')}
                    value={settings.notifyNewWork}
                    onChange={(v) => set('notifyNewWork', v)}
                    testID="notify-new-work"
                />
                <Divider />
                <ToggleRow
                    label={t('settings.notifyDispatch')}
                    value={settings.notifyDispatchMessages}
                    onChange={(v) => set('notifyDispatchMessages', v)}
                    testID="notify-dispatch"
                />
                <Divider />
                <ToggleRow
                    label={t('settings.notifyOffers')}
                    hint={t('settings.notifyOffersHint')}
                    value={settings.notifyNearbyOffers}
                    onChange={(v) => set('notifyNearbyOffers', v)}
                    testID="notify-offers"
                />
            </Section>

            <Section title={t('settings.storage')}>
                <XStack alignItems="center" gap={space[3]} padding={space[4]}>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={15}>{t('settings.offlineCache')}</Body>
                        {cacheSummary ? <Micro tabular>{cacheSummary}</Micro> : null}
                    </YStack>
                    <Button variant="secondary" height={38} onPress={onManageStorage}>
                        {t('settings.manage')}
                    </Button>
                </XStack>
                <Divider />
                <ListRow name={t('settings.sendDiagnostics')} onPress={onSendDiagnostics} />
            </Section>

            <Micro center paddingBottom={space[6]}>
                {[appVersion, organizationName].filter(Boolean).join(' · ')}
            </Micro>
        </ScrollView>
    );
}

export default SettingsScreen;
