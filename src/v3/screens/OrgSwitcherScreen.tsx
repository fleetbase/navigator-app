/**
 * Organisation switcher — R2 frame A3.
 *
 * Switching replaces the session: the API returns a **new driver with a new
 * token**, so this screen performs the request and hands the driver up to the
 * host app, which owns auth. It does not try to re-authenticate itself.
 *
 * A driver who belongs to one organisation gets told so plainly rather than
 * being shown a one-item list that looks like a choice.
 */
import { ScrollView, Image } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Micro } from '../ui/Text';
import { Surface, Divider } from '../ui/Surface';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { space, radius } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverOrganizations, useSwitchOrganization, type DriverRecord, type OrganizationRecord } from '../data';

function Logo({ url, name }: { url?: string | null; name?: string }) {
    if (url) return <Image source={{ uri: url }} style={{ width: 36, height: 36, borderRadius: radius.compact }} />;
    const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
    return (
        <YStack width={36} height={36} borderRadius={radius.compact} backgroundColor="$primary" alignItems="center" justifyContent="center">
            <Body fontSize={15} fontWeight="800" color="$onPrimary">
                {initial}
            </Body>
        </YStack>
    );
}

export function OrgSwitcherScreen({
    driverId,
    currentOrganizationId,
    onSwitched,
    onDone,
}: {
    driverId?: string;
    currentOrganizationId?: string;
    /** Hands the new driver — and its new token — to whoever owns the session. */
    onSwitched?: (driver: DriverRecord) => void;
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const { organizations, isLoading, failed, error, retry } = useDriverOrganizations(driverId);
    const { switchTo, switchingTo, error: switchError, clearError } = useSwitchOrganization(driverId);

    const change = async (organization: OrganizationRecord) => {
        const driver = await switchTo(organization.id);
        if (driver) onSwitched?.(driver);
    };

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[3]} testID="orgs-loading">
                <Skeleton height={64} />
                <Skeleton height={64} />
            </YStack>
        );
    }

    if (failed) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="orgs-error">
                <ErrorState
                    title={t('orgSwitcher.loadFailed')}
                    body={error?.isTransport ? t('orgSwitcher.loadFailedBody') : error?.message}
                    onRetry={retry}
                    retryLabel={t('common.retry')}
                />
            </YStack>
        );
    }

    const list = organizations ?? [];
    const only = list.length === 1;

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="org-switcher">
            {switchError ? (
                <ErrorState title={t('orgSwitcher.switchFailed')} body={switchError} onRetry={clearError} retryLabel={t('common.dismiss')} testID="switch-error" />
            ) : null}

            {list.length === 0 ? (
                <EmptyState testID="orgs-empty" title={t('orgSwitcher.noneTitle')} body={t('orgSwitcher.noneBody')} />
            ) : (
                <>
                    {/* One organisation is not a choice — say so instead of implying it is. */}
                    {only ? <Micro testID="single-org">{t('orgSwitcher.onlyOne')}</Micro> : <Caption>{t('orgSwitcher.pick')}</Caption>}

                    <Surface testID="orgs-list">
                        {list.map((organization, i) => {
                            const isCurrent = organization.id === currentOrganizationId;
                            const isSwitching = switchingTo === organization.id;
                            return (
                                <YStack key={organization.id}>
                                    {i > 0 ? <Divider /> : null}
                                    <XStack padding={space[3]} gap={space[3]} alignItems="center" testID={`org-${organization.id}`}>
                                        <Logo url={organization.logo_url} name={organization.name} />
                                        <YStack flex={1} gap={2}>
                                            <Body fontSize={15} fontWeight={isCurrent ? '800' : '600'} numberOfLines={1}>
                                                {organization.name ?? organization.id}
                                            </Body>
                                            {organization.currency ? <Micro tabular>{organization.currency}</Micro> : null}
                                        </YStack>
                                        {isCurrent ? (
                                            <Micro tone="brand" testID={`current-${organization.id}`}>
                                                {t('orgSwitcher.current')}
                                            </Micro>
                                        ) : (
                                            <Button
                                                variant="secondary"
                                                loading={isSwitching}
                                                disabled={!!switchingTo}
                                                onPress={() => change(organization)}
                                                testID={`switch-${organization.id}`}
                                            >
                                                {t('orgSwitcher.switch')}
                                            </Button>
                                        )}
                                    </XStack>
                                </YStack>
                            );
                        })}
                    </Surface>

                    <Micro testID="switch-warning">{t('orgSwitcher.warning')}</Micro>
                </>
            )}

            {onDone ? (
                <Button variant="ghost" fullWidth onPress={onDone} testID="orgs-done">
                    {t('common.back')}
                </Button>
            ) : null}
        </ScrollView>
    );
}

export default OrgSwitcherScreen;
