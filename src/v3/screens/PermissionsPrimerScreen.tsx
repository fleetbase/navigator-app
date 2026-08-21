/**
 * Permissions primer — R2's onboarding primer.
 *
 * The OS shows its prompt **once**. A driver who taps "Don't Allow" out of
 * reflex has to be walked through Settings from then on, so this screen spends
 * a moment explaining what each permission actually buys them before that one
 * chance is used.
 *
 * `denied` and `blocked` are kept apart throughout: denied can be asked again,
 * blocked can only be changed in Settings. Treating them the same produces a
 * button that appears to do nothing — the single most common way a primer makes
 * things worse rather than better.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import {
    PERMISSION_DESCRIPTORS,
    checkPermission,
    requestPermission,
    isSatisfied,
    openSettings as openSystemSettings,
    type PermissionKey,
    type PermissionState,
} from '../permissions/permissions';

type States = Partial<Record<PermissionKey, PermissionState>>;

export function PermissionsPrimerScreen({
    onDone,
    /** Injected in tests; default to the real native calls. */
    check = checkPermission,
    request = requestPermission,
    openSettings = openSystemSettings,
}: {
    onDone?: () => void;
    check?: typeof checkPermission;
    request?: typeof requestPermission;
    openSettings?: () => Promise<void> | void;
}) {
    const { t } = useTranslation();
    const [states, setStates] = useState<States>({});
    const [partial, setPartial] = useState<Partial<Record<PermissionKey, boolean>>>({});
    const [busy, setBusy] = useState<PermissionKey | null>(null);

    const refresh = useCallback(async () => {
        const entries = await Promise.all(
            PERMISSION_DESCRIPTORS.map(async (d) => [d.key, await check(d.key)] as const)
        );
        setStates(Object.fromEntries(entries));
    }, [check]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const ask = useCallback(
        async (key: PermissionKey) => {
            setBusy(key);
            try {
                const outcome = await request(key);
                setStates((s) => ({ ...s, [key]: outcome.state }));
                setPartial((p) => ({ ...p, [key]: !!outcome.partial }));
            } finally {
                setBusy(null);
            }
        },
        [request]
    );

    const satisfied = isSatisfied(states);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="permissions-primer">
            <YStack gap={space[2]}>
                <Body fontSize={17} fontWeight="800">
                    {t('permissions.title')}
                </Body>
                <Secondary fontSize={14}>{t('permissions.intro')}</Secondary>
            </YStack>

            <Surface testID="permission-list">
                {PERMISSION_DESCRIPTORS.map((descriptor, i) => {
                    const state = states[descriptor.key] ?? 'unknown';
                    const isBlocked = state === 'blocked';
                    const isGranted = state === 'granted';

                    return (
                        <YStack key={descriptor.key}>
                            {i > 0 ? <Divider /> : null}
                            <YStack padding={space[3]} gap={space[2]} testID={`permission-${descriptor.key}`}>
                                <XStack justifyContent="space-between" alignItems="center" gap={space[2]}>
                                    <Body fontSize={15} fontWeight="700" flex={1}>
                                        {t(descriptor.titleKey)}
                                    </Body>
                                    {isGranted ? (
                                        <Micro tone="success" testID={`granted-${descriptor.key}`}>
                                            {t('permissions.granted')}
                                        </Micro>
                                    ) : descriptor.essential ? (
                                        <Micro tone="warning">{t('permissions.required')}</Micro>
                                    ) : (
                                        <Micro>{t('permissions.optional')}</Micro>
                                    )}
                                </XStack>

                                <Secondary fontSize={13}>{t(descriptor.bodyKey)}</Secondary>

                                {/* Granted when-in-use but refused always: the app works,
                                    but stops tracking when backgrounded. Worth saying. */}
                                {partial[descriptor.key] ? (
                                    <Micro tone="warning" testID={`partial-${descriptor.key}`}>
                                        {t('permissions.locationPartial')}
                                    </Micro>
                                ) : null}

                                {state === 'unavailable' ? (
                                    <Micro testID={`unavailable-${descriptor.key}`}>{t('permissions.unavailable')}</Micro>
                                ) : isGranted ? null : isBlocked ? (
                                    <YStack gap={space[2]}>
                                        {/* Asking again does nothing once blocked. */}
                                        <Micro tone="danger" testID={`blocked-${descriptor.key}`}>
                                            {t('permissions.blocked')}
                                        </Micro>
                                        <Button variant="secondary" onPress={() => openSettings()} testID={`settings-${descriptor.key}`}>
                                            {t('permissions.openSettings')}
                                        </Button>
                                    </YStack>
                                ) : (
                                    <Button
                                        variant="secondary"
                                        loading={busy === descriptor.key}
                                        onPress={() => ask(descriptor.key)}
                                        testID={`ask-${descriptor.key}`}
                                    >
                                        {t('permissions.allow')}
                                    </Button>
                                )}
                            </YStack>
                        </YStack>
                    );
                })}
            </Surface>

            {satisfied ? (
                <Banner tone="success" message={t('permissions.allSet')} testID="permissions-satisfied" />
            ) : (
                <Caption testID="permissions-outstanding">{t('permissions.outstanding')}</Caption>
            )}

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={onDone} testID="permissions-skip">
                    {satisfied ? t('common.back') : t('permissions.later')}
                </Button>
                {satisfied ? (
                    <Button flex={2} onPress={onDone} testID="permissions-continue">
                        {t('permissions.continue')}
                    </Button>
                ) : null}
            </XStack>
        </ScrollView>
    );
}

export default PermissionsPrimerScreen;
