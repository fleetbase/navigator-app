/**
 * "Driving for" — the organisation switcher as a sheet.
 *
 * Opened from the organisation chip on Home, so changing organisation does not
 * take the driver away from where they were. It is the status sheet's twin on
 * purpose: the same surface, the same rows, the same tick on the current one,
 * the same Cancel underneath. Tapping another organisation switches to it.
 */
import { Spinner, XStack, YStack } from 'tamagui';
import { Body, Heading, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverOrganizations, useSwitchOrganization, type DriverRecord } from '../data';
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

    const list = organizations ?? [];
    const only = list.length === 1;

    const choose = async (id: string) => {
        const driver = await switchTo(id);
        // Left open on failure so the reason is seen next to the row that produced it.
        if (driver) {
            onSwitched?.(driver);
            onDismiss();
        }
    };

    return (
        <Surface testID="org-sheet" level="sheet" hero padding={space[4]} gap={space[3]}>
            <YStack gap={space[1]}>
                <Heading>{t('me.drivingFor')}</Heading>
                <Secondary>{only ? t('orgSwitcher.onlyOne') : !isOnline ? t('me.org.needsSignal') : t('orgSwitcher.warning')}</Secondary>
            </YStack>

            {switchError ? <Banner tone="danger" message={switchError} testID="org-sheet-error" /> : null}

            {isLoading && !list.length ? (
                <YStack height={72} alignItems="center" justifyContent="center" testID="org-sheet-loading">
                    <Spinner />
                </YStack>
            ) : failed && !list.length ? (
                <Banner tone="danger" message={t('orgSwitcher.loadFailed')} action={{ label: t('common.retry'), onPress: retry }} testID="org-sheet-failed" />
            ) : (
                <YStack gap={space[2]}>
                    {list.map((organization) => {
                        const selected = organization.id === currentOrganizationId;
                        const switching = switchingTo === organization.id;
                        const unavailable = !selected && (!isOnline || (!!switchingTo && !switching));
                        return (
                            <XStack
                                key={organization.id}
                                testID={`org-sheet-${organization.id}`}
                                alignItems="center"
                                gap={space[3]}
                                padding={space[3]}
                                borderRadius={radius.compact + 2}
                                borderWidth={selected ? 1.5 : 1}
                                borderColor={selected ? '$primary' : '$border'}
                                backgroundColor={selected ? '$primaryFill' : '$surface'}
                                opacity={unavailable ? 0.38 : 1}
                                pressStyle={selected || unavailable ? undefined : { opacity: 0.7 }}
                                onPress={selected || unavailable || switchingTo ? undefined : () => void choose(organization.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected, disabled: unavailable }}
                                accessibilityLabel={organization.name ?? organization.id}
                            >
                                <YStack flex={1} gap={2}>
                                    <Body fontWeight="700" numberOfLines={1}>
                                        {organization.name ?? organization.id}
                                    </Body>
                                    <Micro>{selected ? t('me.org.drivingNow') : t('orgSwitcher.tapToSwitch')}</Micro>
                                </YStack>
                                {switching ? <Spinner size="small" /> : selected ? <Body tone="brand">✓</Body> : null}
                            </XStack>
                        );
                    })}
                </YStack>
            )}

            <Button variant="ghost" onPress={onDismiss} testID="org-sheet-cancel">
                {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
        </Surface>
    );
}

export default OrgSheet;
