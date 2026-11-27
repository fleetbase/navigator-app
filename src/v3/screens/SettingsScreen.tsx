/**
 * Settings — design round 3 (`Settings.dc.html`).
 *
 * Every preference in `settingsStore` that does something is here, grouped the
 * way the mockup groups them: the look, language and distance, which app opens
 * directions, and help.
 *
 * The "Tell me about" switches are saved on the server, which sends the pushes.
 *
 * Two things the mockup shows are deliberately absent:
 *
 *   - **"Switch to Night after dark."** Honest only if the app knows sunset
 *     where the driver is and re-checks as the evening goes on; the theme is
 *     resolved at the app root, outside the location provider, so today it
 *     cannot. Night stays a deliberate choice.
 *   - **Offline cache size.** Nothing measures it and nothing manages it.
 *
 * The tracking warning stays a banner at the top, not a row: it is a
 * consequence ("dispatch can't see your progress"), not a preference.
 */
import { useEffect, useState } from 'react';
import { Switch, XStack, YStack } from 'tamagui';
import { Body, Micro, Secondary } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { themes, type SchemeName } from '../theme';
import { useSettings, useSetSetting, useResolvedScheme } from '../settings';
import type { ThemePreference, UnitPreference, NavigationApp } from '../settings';
import { isOffered } from '../settings/settingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { applyLocale, deviceLanguageTags, resolveLocale, selectableLocales, type LocaleInfo } from '../i18n';
import { getBuildBranding } from '../branding/build-branding';
import { NAVIGATION_OPTIONS, availableApps, type NavigationAppId } from '../navigate/handoff';
import { ACTION_HEIGHT, ACTION_RADIUS, BigButton } from '../onboarding/AuthScaffold';
import { Button } from '../ui/Button';
import { useQueue, useFleetbase } from '../api';
import { useNotificationPreferences } from '../data';
import { Card, CARD_PAD, Chevron, Icon, MenuRow, RadioMark, Rule, Screen, Section } from './me/parts';

const appearance = getBuildBranding().branding.appearance;

/** The four looks, in the order the mockup shows them. Keys, not words. */
const SCHEME_TILES: { value: SchemeName; labelKey: string }[] = [
    { value: 'dark', labelKey: 'settings.themeDark' },
    { value: 'light', labelKey: 'settings.themeLight' },
    { value: 'sunlight', labelKey: 'settings.themeSunlight' },
    { value: 'night', labelKey: 'settings.themeNight' },
];
/** The looks this build offers (branding `appearance.schemes`). */
const offeredTiles = SCHEME_TILES.filter((tile) => isOffered(tile.value, appearance.schemes));
/** "Follow the phone" needs both dark and light to switch between. */
const systemOffered = isOffered('system', appearance.schemes);

const UNIT_OPTIONS: { value: UnitPreference; labelKey: string }[] = [
    { value: 'metric', labelKey: 'me.unitKm' },
    { value: 'imperial', labelKey: 'me.unitMiles' },
];

/**
 * One look, as a tile: a small picture of that theme's own background, text
 * and accent, so the choice can be made without reading the label.
 */
function ThemeTile({ scheme, label, selected, onPress, testID }: { scheme: SchemeName; label: string; selected: boolean; onPress: () => void; testID?: string }) {
    const look = themes[scheme];
    return (
        <YStack
            flex={1}
            gap={space[2]}
            padding={space[2]}
            borderRadius={16}
            borderWidth={selected ? 1.5 : 1}
            borderColor={selected ? '$primary' : '$border'}
            backgroundColor="$surface"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            testID={testID}
        >
            <YStack height={56} borderRadius={10} borderWidth={1} padding={space[2]} justifyContent="space-between" style={{ backgroundColor: look.background, borderColor: look.border }}>
                <YStack width="60%" height={6} borderRadius={3} style={{ backgroundColor: look.textPrimary }} />
                <YStack height={14} borderRadius={5} style={{ backgroundColor: look.primary }} />
            </YStack>
            <XStack alignItems="center" gap={4}>
                {/* The tick says "this one" for anyone the border colour does not reach. */}
                {selected ? <Icon name="tick" size={12} color="primary" strokeWidth={3.4} /> : null}
                <Body fontSize={13} fontWeight="800" numberOfLines={1} flexShrink={1}>
                    {label}
                </Body>
            </XStack>
        </YStack>
    );
}

function ToggleRow({ label, hint, value, onChange, testID }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
    return (
        <XStack alignItems="center" gap={space[3]} minHeight={60} paddingHorizontal={CARD_PAD} paddingVertical={space[2]}>
            <YStack flex={1} gap={1}>
                <Body fontSize={15} fontWeight="800">
                    {label}
                </Body>
                {hint ? <Secondary fontSize={13}>{hint}</Secondary> : null}
            </YStack>
            <Switch testID={testID} size="$3" checked={value} onCheckedChange={onChange} backgroundColor={value ? '$primary' : '$surfaceRaised'} borderColor="$border" borderWidth={1} accessibilityLabel={label}>
                <Switch.Thumb animation="quick" backgroundColor="$white" />
            </Switch>
        </XStack>
    );
}

/**
 * One language, as a selectable row. The name is the language's own — a
 * picker that translates "Español" into the current language defeats the
 * driver who cannot read the current language.
 */
function LanguageRow({ name, selected, onPress, testID }: { name: string; selected: boolean; onPress: () => void; testID?: string }) {
    return (
        <XStack
            alignItems="center"
            gap={space[3]}
            paddingHorizontal={CARD_PAD}
            minHeight={52}
            borderTopWidth={1}
            borderTopColor="$border"
            onPress={onPress}
            pressStyle={{ backgroundColor: '$surfaceRaised' }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={testID}
        >
            <Body flex={1} fontSize={15} fontWeight={selected ? '800' : '600'}>
                {name}
            </Body>
            <RadioMark selected={selected} size={24} />
        </XStack>
    );
}

export interface SettingsScreenProps {
    /** From LocationContext. The banner is the consequence, not a preference. */
    trackingEnabled?: boolean;
    onEnableTracking?: () => void;
    /** Opens the report-a-problem form, which carries the diagnostics. */
    onSendDiagnostics?: () => void;
    onSignOut?: () => void;
    /** The native build's version and build number: "3.0.0 (412)". */
    appVersion?: string;
    organizationName?: string;
    /** Injected in tests; defaults to the real `Linking.canOpenURL` probe. */
    probe?: (url: string) => Promise<boolean>;
    /** The signed-in driver; with it the alert switches are shown. */
    driverId?: string;
}

export function SettingsScreen({ trackingEnabled = true, onEnableTracking, onSendDiagnostics, onSignOut, appVersion, organizationName, probe, driverId }: SettingsScreenProps) {
    const alerts = useNotificationPreferences(driverId);
    const settings = useSettings();
    const set = useSetSetting();
    const resolved = useResolvedScheme();
    const { t, locale } = useTranslation();
    const [needsRestart, setNeedsRestart] = useState(false);
    const [pickingLanguage, setPickingLanguage] = useState(false);
    const [installed, setInstalled] = useState<NavigationAppId[] | null>(null);
    const [confirmingSignOut, setConfirmingSignOut] = useState(false);
    const { queue } = useFleetbase();
    const { pendingCount, failedCount } = useQueue(queue);
    const waiting = pendingCount + failedCount;

    useEffect(() => {
        let alive = true;
        void availableApps(probe).then((apps) => {
            if (alive) setInstalled(apps);
        });
        return () => {
            alive = false;
        };
    }, [probe]);

    const locales: LocaleInfo[] = selectableLocales();
    const chooseLanguage = (preference: string) => {
        set('language', preference);
        const target = resolveLocale(preference, deviceLanguageTags());
        // Direction is applied on the next launch; say so rather than leave
        // the driver on a half-flipped screen.
        setNeedsRestart(applyLocale(target).needsRestart);
        setPickingLanguage(false);
    };
    const languageName = settings.language === 'system' ? t('settings.languageSystem') : (locales.find((l) => l.tag === settings.language)?.name ?? settings.language);

    const followsPhone = settings.theme === 'system';
    // The apps this phone can open, plus the stored choice even if it has gone,
    // so the driver can see what is set and move off it.
    const navigationApps = NAVIGATION_OPTIONS.filter((option) => !installed || installed.includes(option.id) || option.id === settings.navigationApp);

    return (
        <Screen
            gap={20}
            testID="settings-screen"
            footer={
                !onSignOut ? undefined : confirmingSignOut ? (
                    /*
                     * Same warning as on Me: queued work stays on the phone and
                     * only this driver can send it, so the count is named
                     * before they leave it behind.
                     */
                    <YStack gap={space[2]} testID="settings-sign-out-confirm">
                        <Secondary fontSize={14} lineHeight={20}>
                            {waiting > 0 ? t('account.signOutWithQueued', { count: waiting }) : t('account.signOutBody')}
                        </Secondary>
                        <XStack gap={space[2]}>
                            <Button flex={1} height={ACTION_HEIGHT} borderRadius={ACTION_RADIUS} variant="secondary" onPress={() => setConfirmingSignOut(false)} testID="settings-sign-out-cancel">
                                {t('common.cancel')}
                            </Button>
                            <Button flex={1} height={ACTION_HEIGHT} borderRadius={ACTION_RADIUS} variant="destructive" onPress={onSignOut} testID="settings-sign-out-yes">
                                {t('account.signOutConfirm')}
                            </Button>
                        </XStack>
                    </YStack>
                ) : (
                    <BigButton variant="destructive" backgroundColor="$transparent" onPress={() => setConfirmingSignOut(true)} testID="settings-sign-out">
                        {t('account.signOut')}
                    </BigButton>
                )
            }
        >
            {!trackingEnabled ? (
                <YStack gap={space[2]}>
                    <Banner
                        tone="warning"
                        message={t('settings.trackingOff')}
                        action={onEnableTracking ? { label: t('settings.turnOn'), onPress: onEnableTracking } : undefined}
                        testID="tracking-warning"
                    />
                    <Micro paddingHorizontal={space[1]}>{t('settings.trackingOffHint')}</Micro>
                </YStack>
            ) : null}

            {/* A brand may fix the scheme (branding `appearance.allowUserToggle`) or offer fewer. */}
            {appearance.allowUserToggle && offeredTiles.length > 1 ? (
                <Section title={t('me.look')}>
                    <XStack gap={space[2]} accessibilityRole="radiogroup" accessibilityLabel={t('settings.theme')} testID="theme-tiles">
                        {offeredTiles.map((tile) => (
                            <ThemeTile
                                key={tile.value}
                                scheme={tile.value}
                                label={t(tile.labelKey)}
                                // While following the phone, the tile lit is the look it resolved to.
                                selected={followsPhone ? resolved === tile.value : settings.theme === tile.value}
                                onPress={() => set('theme', tile.value as ThemePreference)}
                                testID={`theme-${tile.value}`}
                            />
                        ))}
                    </XStack>
                    {systemOffered ? (
                        <Card flush>
                            <ToggleRow
                                label={t('me.followPhone')}
                                hint={t('me.followPhoneHint')}
                                value={followsPhone}
                                // Turning it off keeps the look that is on screen rather than jumping to another.
                                onChange={(on) => set('theme', on ? 'system' : resolved)}
                                testID="theme-system"
                            />
                        </Card>
                    ) : null}
                </Section>
            ) : null}

            <Section title={t('me.languageAndUnits')}>
                <Card flush>
                    <XStack
                        alignItems="center"
                        gap={space[3]}
                        minHeight={60}
                        paddingHorizontal={CARD_PAD}
                        onPress={() => setPickingLanguage((open) => !open)}
                        pressStyle={{ backgroundColor: '$surfaceRaised' }}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: pickingLanguage }}
                        testID="language-row"
                    >
                        <Body flex={1} fontSize={15} fontWeight="800">
                            {t('settings.language')}
                        </Body>
                        <Secondary fontSize={15} numberOfLines={1} flexShrink={1}>
                            {languageName}
                        </Secondary>
                        {pickingLanguage ? <Icon name="chevronDown" size={16} color="textMuted" strokeWidth={2.4} /> : <Chevron />}
                    </XStack>
                    {pickingLanguage ? (
                        <YStack accessibilityRole="radiogroup" testID="language-list">
                            <LanguageRow name={t('settings.languageSystem')} selected={settings.language === 'system'} onPress={() => chooseLanguage('system')} testID="language-system" />
                            {locales.map((l) => (
                                <LanguageRow
                                    key={l.tag}
                                    name={l.pseudo ? `${l.name} · ${t('settings.pseudoNote')}` : l.name}
                                    selected={settings.language === l.tag}
                                    onPress={() => chooseLanguage(l.tag)}
                                    testID={`language-${l.tag}`}
                                />
                            ))}
                        </YStack>
                    ) : null}
                    {needsRestart ? (
                        <YStack padding={space[3]} gap={space[2]} borderTopWidth={1} borderTopColor="$border">
                            <Banner tone="brand" message={t('settings.restartTitle')} meta={locale} testID="language-restart" />
                            <Micro>{t('settings.restartBody')}</Micro>
                        </YStack>
                    ) : null}
                    <Rule />
                    <XStack alignItems="center" gap={space[3]} minHeight={60} paddingHorizontal={CARD_PAD}>
                        <Body flex={1} fontSize={15} fontWeight="800">
                            {t('me.distance')}
                        </Body>
                        {/* The organisation's choice (its routing settings), so it is shown, not offered. */}
                        <YStack alignItems="flex-end" gap={1} testID="units">
                            <Body fontSize={15} fontWeight="700">
                                {t(settings.units === 'imperial' ? 'me.unitMiles' : 'me.unitKm')}
                            </Body>
                            <Micro>{t('settings.unitsSetByOrganisation')}</Micro>
                        </YStack>
                    </XStack>
                </Card>
            </Section>

            {navigationApps.length ? (
                <Section title={t('me.openDirectionsIn')}>
                    <Card flush accessibilityRole="radiogroup" testID="navigation-apps">
                        {navigationApps.map((option, i) => {
                            const selected = settings.navigationApp === option.id;
                            const missing = !!installed && !installed.includes(option.id);
                            return (
                                <XStack
                                    key={option.id}
                                    alignItems="center"
                                    gap={space[3]}
                                    minHeight={56}
                                    paddingHorizontal={CARD_PAD}
                                    borderTopWidth={i === 0 ? 0 : 1}
                                    borderTopColor="$border"
                                    onPress={() => set('navigationApp', option.id as NavigationApp)}
                                    pressStyle={{ backgroundColor: '$surfaceRaised' }}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    testID={`navigation-app-${option.id}`}
                                >
                                    <YStack flex={1} gap={1}>
                                        <Body fontSize={15} fontWeight="800">
                                            {t(option.labelKey)}
                                        </Body>
                                        {missing ? <Secondary fontSize={13}>{t('handoff.notInstalled')}</Secondary> : null}
                                    </YStack>
                                    <RadioMark selected={selected} size={24} />
                                </XStack>
                            );
                        })}
                    </Card>
                </Section>
            ) : null}

            {alerts.preferences ? (
                <Section title={t('settings.alerts.title')} testID="settings-alerts">
                    <Card flush>
                        {(['new_work', 'order_changes', 'messages', 'offers'] as const).map((kind, index) => (
                            <YStack key={kind}>
                                {index > 0 ? <Rule /> : null}
                                <ToggleRow
                                    label={t(`settings.alerts.${kind}`)}
                                    hint={t(`settings.alerts.${kind}Hint`)}
                                    value={alerts.preferences?.[kind] ?? true}
                                    onChange={(value) => void alerts.set(kind, value)}
                                    testID={`settings-alert-${kind}`}
                                />
                            </YStack>
                        ))}
                    </Card>
                    {alerts.failed ? <Banner tone="danger" message={t('settings.alerts.failed')} testID="settings-alerts-failed" /> : null}
                    <Micro>{t('settings.alerts.note')}</Micro>
                </Section>
            ) : null}

            {onSendDiagnostics || appVersion || organizationName ? (
            <Section title={t('me.helpSection')}>
                <Card flush>
                    {onSendDiagnostics ? <MenuRow first height={60} label={t('me.sendDiagnostics')} onPress={onSendDiagnostics} testID="send-diagnostics" /> : null}
                    {appVersion ? (
                        <XStack alignItems="center" gap={space[3]} minHeight={60} paddingHorizontal={CARD_PAD} borderTopWidth={onSendDiagnostics ? 1 : 0} borderTopColor="$border" testID="settings-version">
                            <Body flex={1} fontSize={15} fontWeight="800">
                                {t('me.versionLabel')}
                            </Body>
                            <Body fontFamily="$mono" fontSize={14} fontWeight="500" tone="secondary" selectable>
                                {appVersion}
                            </Body>
                        </XStack>
                    ) : null}
                    {organizationName ? (
                        <XStack alignItems="center" gap={space[3]} minHeight={60} paddingHorizontal={CARD_PAD} borderTopWidth={onSendDiagnostics || appVersion ? 1 : 0} borderTopColor="$border">
                            <Body flex={1} fontSize={15} fontWeight="800">
                                {t('account.organization')}
                            </Body>
                            <Secondary fontSize={14} numberOfLines={1} flexShrink={1}>
                                {organizationName}
                            </Secondary>
                        </XStack>
                    ) : null}
                </Card>
            </Section>
            ) : null}
        </Screen>
    );
}

export default SettingsScreen;
