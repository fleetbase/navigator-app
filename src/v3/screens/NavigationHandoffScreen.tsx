/**
 * Navigation hand-off — R2 frame D6.
 *
 * Three states, all real: the picker, a remembered default that skips it, and
 * no navigation app installed at all — which on Android with none of the four
 * present is entirely possible, and where the browser fallback earns its place.
 *
 * "Remember this choice" writes to the same `navigationApp` setting the
 * Settings screen exposes, so the two cannot disagree.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner, EmptyState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSettings, settingsStore } from '../settings';
import {
    NAVIGATION_OPTIONS,
    availableApps,
    navigateTo,
    type Destination,
    type NavigationAppId,
} from '../navigate/handoff';

export function NavigationHandoffScreen({
    destination,
    onDone,
    /** Injected in tests; defaults to the real Linking probe. */
    probe,
    open,
}: {
    destination?: Destination;
    onDone?: () => void;
    probe?: (url: string) => Promise<boolean>;
    open?: (url: string) => Promise<unknown>;
}) {
    const { t } = useTranslation();
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

    if (!destination) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="handoff-no-destination">
                <EmptyState title={t('handoff.noDestinationTitle')} body={t('handoff.noDestinationBody')} />
            </YStack>
        );
    }

    const nothingInstalled = installed !== null && installed.length === 0;

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="handoff">
            <YStack gap={space[1]}>
                <Caption>{t('handoff.title')}</Caption>
                <Body fontSize={15} fontWeight="700">
                    {destination.label ?? t('handoff.destination')}
                </Body>
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
                <Surface testID="handoff-options">
                    {NAVIGATION_OPTIONS.map((option, i) => {
                        // Unknown until the probe returns; assume present so the
                        // list does not flicker from empty to full.
                        const available = installed === null || installed.includes(option.id);
                        const isDefault = navigationApp === option.id;
                        return (
                            <YStack key={option.id}>
                                {i > 0 ? <Divider /> : null}
                                <XStack padding={space[3]} gap={space[3]} alignItems="center" testID={`handoff-${option.id}`}>
                                    <YStack flex={1} gap={2}>
                                        <Body fontSize={15} fontWeight={isDefault ? '800' : '600'}>
                                            {t(option.labelKey)}
                                        </Body>
                                        {isDefault ? (
                                            <Micro tone="brand" testID={`default-${option.id}`}>
                                                {t('handoff.yourDefault')}
                                            </Micro>
                                        ) : null}
                                        {!available ? (
                                            <Micro testID={`not-installed-${option.id}`}>{t('handoff.notInstalled')}</Micro>
                                        ) : null}
                                    </YStack>
                                    <Button variant="secondary" onPress={() => go(option.id)} testID={`go-${option.id}`}>
                                        {available ? t('handoff.open') : t('handoff.openInBrowser')}
                                    </Button>
                                </XStack>
                            </YStack>
                        );
                    })}
                </Surface>
            )}

            <XStack
                alignItems="center"
                justifyContent="space-between"
                gap={space[3]}
                onPress={() => setRemember((r) => !r)}
                pressStyle={{ opacity: 0.7 }}
                testID="remember-toggle"
            >
                <Body fontSize={14} flex={1}>
                    {t('handoff.remember')}
                </Body>
                <Body fontSize={17} tone={remember ? 'brand' : 'muted'} testID={remember ? 'remember-on' : 'remember-off'}>
                    {remember ? '✓' : '○'}
                </Body>
            </XStack>

            {onDone ? (
                <Button variant="ghost" fullWidth onPress={onDone} testID="handoff-cancel">
                    {t('common.cancel')}
                </Button>
            ) : null}
        </ScrollView>
    );
}

export default NavigationHandoffScreen;
