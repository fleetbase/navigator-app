/**
 * Navigation hand-off — the choice of app to drive with.
 *
 * `NavigationHandoffContent` is the choice itself: where to, the apps that can
 * take the driver there, "remember this choice" and Cancel. It is drawn the way
 * the app's other sheets are (the status sheet is the reference): one raised
 * surface, a row per option, Cancel underneath.
 *
 * `NavigationHandoffSheet` presents it over whatever screen asked — the order,
 * Home — so choosing an app never leaves that screen. The `NavigationHandoff`
 * route still exists for anything that navigates to it and shows the same
 * content on a screen of its own (screens/NavigationHandoffScreen).
 *
 * Three states, all real: the picker, the remembered default (marked, first to
 * hand), and no navigation app installed at all — which on Android with none of
 * them present is entirely possible, and where the browser fallback earns its
 * place.
 *
 * "Remember this choice" writes to the same `navigationApp` setting the
 * Settings screen exposes, so the two cannot disagree.
 */
import { useCallback, useEffect, useState } from 'react';
import { XStack, YStack, useTheme } from 'tamagui';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState } from '../ui/Banner';
import { SheetModal } from '../ui/SheetModal';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings, settingsStore } from '../settings';
import { NAVIGATION_OPTIONS, availableApps, navigateTo, type Destination, type NavigationAppId } from './handoff';

export interface NavigationHandoffContentProps {
    destination?: Destination;
    /** Called once an app has been opened, and by Cancel. */
    onDone?: () => void;
    /** Injected in tests; defaults to the real Linking probe. */
    probe?: (url: string) => Promise<boolean>;
    open?: (url: string) => Promise<unknown>;
    /** Room for the home indicator when the content is the bottom of the screen (a sheet). */
    bottomInset?: number;
    /** As a sheet the surface runs to the bottom edge, so only its top corners are round. */
    sheet?: boolean;
}

export function NavigationHandoffContent({ destination, onDone, probe, open, bottomInset = 0, sheet }: NavigationHandoffContentProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { navigationApp } = useSettings();

    const [installed, setInstalled] = useState<NavigationAppId[] | null>(null);
    const [remember, setRemember] = useState(true);
    const [usedFallback, setUsedFallback] = useState<NavigationAppId | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        void availableApps(probe).then((apps) => {
            if (alive) setInstalled(apps);
        });
        return () => {
            alive = false;
        };
    }, [probe]);

    const go = useCallback(
        async (app: NavigationAppId) => {
            if (!destination) return;
            setFailed(false);
            setUsedFallback(null);

            if (remember) settingsStore.set('navigationApp', app);

            const result = await navigateTo(app, destination, open, probe);
            if (!result.opened) {
                setFailed(true);
                return;
            }
            if (result.usedFallback) {
                setUsedFallback(app);
                return;
            }
            onDone?.();
        },
        [destination, remember, onDone, open, probe]
    );

    const frame = {
        level: 'sheet',
        hero: true,
        padding: space[4],
        paddingBottom: Math.max(bottomInset, space[4]),
        gap: space[3],
        ...(sheet ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0 } : {}),
    } as const;

    const cancel = onDone ? (
        // The dimmed area is at the top of the screen; the sheet has its own way out, in reach of a thumb.
        <Button variant="ghost" fullWidth onPress={onDone} testID="handoff-cancel">
            {t('common.cancel')}
        </Button>
    ) : null;

    if (!destination) {
        return (
            <Surface {...frame} testID="handoff-no-destination">
                <EmptyState title={t('handoff.noDestinationTitle')} body={t('handoff.noDestinationBody')} />
                {cancel}
            </Surface>
        );
    }

    const nothingInstalled = installed !== null && installed.length === 0;

    return (
        <Surface {...frame} testID="handoff">
            <YStack gap={space[1]}>
                <Heading>{t('handoff.title')}</Heading>
                <Secondary fontWeight="700">{destination.label ?? t('handoff.destination')}</Secondary>
                <Micro tabular testID="handoff-coordinates">
                    {destination.latitude.toFixed(4)}, {destination.longitude.toFixed(4)}
                </Micro>
            </YStack>

            {failed ? <Banner tone="danger" message={t('handoff.failed')} testID="handoff-failed" /> : null}
            {usedFallback ? <Banner tone="neutral" message={t('handoff.usedBrowser')} testID="handoff-fallback" /> : null}

            {nothingInstalled ? (
                <EmptyState
                    testID="handoff-none-installed"
                    title={t('handoff.noneInstalledTitle')}
                    body={t('handoff.noneInstalledBody')}
                    action={{ label: t('handoff.openInBrowser'), onPress: () => go('google') }}
                />
            ) : (
                <YStack gap={space[2]} testID="handoff-options">
                    {NAVIGATION_OPTIONS.map((option) => {
                        // Unknown until the probe returns; assume present so the
                        // list does not flicker from empty to full.
                        const available = installed === null || installed.includes(option.id);
                        const isDefault = navigationApp === option.id;
                        const name = t(option.labelKey);
                        const does = available ? t('handoff.open') : t('handoff.openInBrowser');
                        return (
                            <YStack key={option.id} testID={`handoff-${option.id}`}>
                                <XStack
                                    alignItems="center"
                                    gap={space[3]}
                                    minHeight={56}
                                    padding={space[3]}
                                    borderRadius={radius.compact + 2}
                                    borderWidth={isDefault ? 1.5 : 1}
                                    borderColor={isDefault ? '$primary' : '$border'}
                                    backgroundColor={isDefault ? '$primaryFill' : '$surface'}
                                    pressStyle={{ opacity: 0.7 }}
                                    onPress={() => go(option.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={[name, isDefault ? t('handoff.yourDefault') : null, available ? null : t('handoff.notInstalled'), does].filter(Boolean).join('. ')}
                                    testID={`go-${option.id}`}
                                >
                                    <YStack flex={1} minWidth={0} gap={2}>
                                        <Body fontWeight="700">{name}</Body>
                                        {/* Said in words: the default is never marked by its colour alone. */}
                                        {isDefault ? (
                                            <Micro tone="brand" testID={`default-${option.id}`}>
                                                {t('handoff.yourDefault')}
                                            </Micro>
                                        ) : null}
                                        {!available ? <Micro testID={`not-installed-${option.id}`}>{t('handoff.notInstalled')}</Micro> : null}
                                    </YStack>
                                    <Secondary flexShrink={0} fontSize={13} fontWeight="700" numberOfLines={1}>
                                        {does}
                                    </Secondary>
                                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.textSecondary?.val as string} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                                        <Path d="M9 5l7 7-7 7" />
                                    </Svg>
                                </XStack>
                            </YStack>
                        );
                    })}
                </YStack>
            )}

            <XStack
                alignItems="center"
                justifyContent="space-between"
                gap={space[3]}
                minHeight={48}
                onPress={() => setRemember((r) => !r)}
                pressStyle={{ opacity: 0.7 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: remember }}
                accessibilityLabel={t('handoff.remember')}
                testID="remember-toggle"
            >
                <Body fontSize={14} flex={1}>
                    {t('handoff.remember')}
                </Body>
                <Body fontSize={17} tone={remember ? 'brand' : 'muted'} testID={remember ? 'remember-on' : 'remember-off'}>
                    {remember ? '✓' : '○'}
                </Body>
            </XStack>

            {cancel}
        </Surface>
    );
}

/**
 * The hand-off as a sheet over the current screen. The destination shown is
 * kept while the sheet slides away, so it does not flash "no destination" on
 * its way out.
 */
export function NavigationHandoffSheet({ visible, destination, onClose }: { visible: boolean; destination?: Destination; onClose: () => void }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [shown, setShown] = useState(destination);
    // Each opening starts clean: no banner left from the last one.
    const [opening, setOpening] = useState(0);
    useEffect(() => {
        if (!visible) return;
        setShown(destination);
    }, [visible, destination]);
    useEffect(() => {
        if (visible) setOpening((count) => count + 1);
    }, [visible]);
    return (
        <SheetModal visible={visible} onClose={onClose} dismissLabel={t('common.cancel')} testID="handoff-sheet">
            <NavigationHandoffContent key={opening} destination={visible ? destination : shown} onDone={onClose} bottomInset={insets.bottom} sheet />
        </SheetModal>
    );
}

export default NavigationHandoffSheet;
