/**
 * "Driving for" — the organisation switcher as a sheet.
 *
 * Opened from the organisation chip on Home, so changing organisation does not
 * take the driver away from where they were. The same rules as the full screen
 * under Me: pick one, then confirm, because switching signs the driver in again
 * under the other organisation and that should never be a mis-tap.
 */
import { useEffect, useState } from 'react';
import { Spinner, XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { ScrollView } from '../ui/Scroll';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverOrganizations, useSwitchOrganization, type DriverRecord } from '../data';
import { BigButton } from '../onboarding/AuthScaffold';
import { Avatar, RadioMark } from '../screens/me/parts';
import { useSync } from './SyncContext';

export function OrgSheet({
    visible,
    driverId,
    currentOrganizationId,
    onSwitched,
    onDismiss,
}: {
    /** The list is only asked for once the sheet is opened. */
    visible: boolean;
    driverId?: string;
    currentOrganizationId?: string;
    onSwitched?: (driver: DriverRecord) => void;
    onDismiss: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { organizations, isLoading, failed, retry } = useDriverOrganizations(visible ? driverId : undefined);
    const { switchTo, switchingTo, error: switchError } = useSwitchOrganization(driverId);
    const [pickedId, setPickedId] = useState<string | null>(null);

    // Opening the sheet again starts from no choice.
    useEffect(() => {
        if (!visible) setPickedId(null);
    }, [visible]);

    const list = organizations ?? [];
    const only = list.length === 1;
    const picked = list.find((organization) => organization.id === pickedId && organization.id !== currentOrganizationId) ?? null;

    const confirm = async () => {
        if (!picked) return;
        const driver = await switchTo(picked.id);
        if (driver) {
            onSwitched?.(driver);
            onDismiss();
        }
    };

    return (
        <YStack
            paddingTop={10}
            paddingHorizontal={space[4]}
            gap={space[3]}
            borderTopLeftRadius={26}
            borderTopRightRadius={26}
            backgroundColor="$surface"
            borderTopWidth={1}
            borderColor="$border"
            testID="org-sheet"
        >
            <YStack alignSelf="center" width={40} height={5} borderRadius={3} backgroundColor="$border" />
            <YStack gap={2}>
                <Body fontSize={20} lineHeight={26} fontWeight="800" accessibilityRole="header">
                    {t('me.drivingFor')}
                </Body>
                {only ? <Secondary fontSize={14}>{t('orgSwitcher.onlyOne')}</Secondary> : null}
            </YStack>

            {switchError ? <Banner tone="danger" message={switchError} testID="org-sheet-error" /> : null}

            {isLoading && !list.length ? (
                <YStack height={96} alignItems="center" justifyContent="center" testID="org-sheet-loading">
                    <Spinner />
                </YStack>
            ) : failed && !list.length ? (
                <Banner tone="danger" message={t('orgSwitcher.loadFailed', { defaultValue: 'Your organisations could not be loaded.' })} action={{ label: t('common.retry'), onPress: retry }} testID="org-sheet-failed" />
            ) : (
                <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: space[2] }} bounces={false}>
                    {list.map((organization) => {
                        const isCurrent = organization.id === currentOrganizationId;
                        const selected = picked?.id === organization.id;
                        const selectable = !isCurrent && !only && !switchingTo;
                        return (
                            <XStack
                                key={organization.id}
                                alignItems="center"
                                gap={12}
                                minHeight={68}
                                paddingVertical={10}
                                paddingHorizontal={12}
                                borderRadius={18}
                                borderWidth={selected ? 1.5 : 1}
                                borderColor={selected ? '$primary' : '$border'}
                                backgroundColor={selected ? '$primaryFill' : '$surfaceRaised'}
                                onPress={selectable ? () => setPickedId(organization.id) : undefined}
                                pressStyle={selectable ? { opacity: 0.8 } : undefined}
                                accessibilityRole={selectable ? 'radio' : 'text'}
                                accessibilityState={{ selected }}
                                testID={`org-sheet-${organization.id}`}
                            >
                                <Avatar url={organization.logo_url} name={organization.name} size={44} square />
                                <YStack flex={1} gap={2} minWidth={0}>
                                    <Body fontSize={17} fontWeight="800" numberOfLines={1}>
                                        {organization.name ?? organization.id}
                                    </Body>
                                    {isCurrent ? (
                                        <Body fontSize={13} fontWeight="700" tone="success">
                                            {t('me.org.drivingNow')}
                                        </Body>
                                    ) : null}
                                </YStack>
                                {selectable || selected ? <RadioMark selected={selected} size={26} /> : null}
                            </XStack>
                        );
                    })}
                </ScrollView>
            )}

            {list.length > 1 ? (
                <YStack gap={space[2]}>
                    <BigButton disabled={!picked || !isOnline} loading={!!switchingTo} onPress={confirm} testID="org-sheet-switch">
                        {picked ? t('me.org.switchTo', { name: picked.name ?? picked.id }) : t('me.org.choose')}
                    </BigButton>
                    <Secondary fontSize={13} center>
                        {!isOnline ? t('me.org.needsSignal') : t('orgSwitcher.warning')}
                    </Secondary>
                </YStack>
            ) : null}
        </YStack>
    );
}

export default OrgSheet;
