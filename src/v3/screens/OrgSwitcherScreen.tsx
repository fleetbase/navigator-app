/**
 * Organisation switcher — R2 frame A3, in the look of `OrgPick.dc.html`.
 *
 * Switching replaces the session: the API returns a **new driver with a new
 * token**, so this screen performs the request and hands the driver up to the
 * host app, which owns auth. It does not try to re-authenticate itself.
 *
 * The driver picks an organisation and then confirms with the one action at
 * the bottom; because the switch signs them in again, it should not hang off a
 * stray tap on a row.
 *
 * A driver who belongs to one organisation gets told so plainly rather than
 * being shown a one-item list that looks like a choice.
 *
 * The mockup's line under each name ("7 waypoints today", "2 orders scheduled
 * tomorrow") is not here: `GET drivers/{id}/organizations` returns the
 * organisations and nothing about the work waiting in each, and reading it
 * would mean signing in to every one of them.
 */
import { useState } from 'react';
import { YStack } from 'tamagui';
import { useSync } from '../shell';
import { Body, Secondary } from '../ui/Text';
import { EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { FailureState } from '../ui/FailureState';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverOrganizations, useSwitchOrganization, type DriverRecord } from '../data';
import { BigButton, StepTitle } from '../onboarding/AuthScaffold';
import { Avatar, Card, RadioMark, Screen } from './me/parts';

export function OrgSwitcherScreen({
    driverId,
    currentOrganizationId,
    onSwitched,
}: {
    driverId?: string;
    currentOrganizationId?: string;
    /** Hands the new driver — and its new token — to whoever owns the session. */
    onSwitched?: (driver: DriverRecord) => void;
    /** Kept for callers; the title bar's back control is the way out now. */
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { organizations, isLoading, failed, error, retry } = useDriverOrganizations(driverId);
    const { switchTo, switchingTo, error: switchError, clearError } = useSwitchOrganization(driverId);
    const [pickedId, setPickedId] = useState<string | null>(null);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} gap={space[2]} testID="orgs-loading">
                <Skeleton height={88} borderRadius={18} />
                <Skeleton height={88} borderRadius={18} />
            </YStack>
        );
    }

    if (failed) {
        return (
            <YStack flex={1} backgroundColor="$background" padding={space[4]} justifyContent="center" testID="orgs-error">
                <FailureState error={error} isOnline={isOnline} onRetry={retry} t={t} testID="orgs-error" />
            </YStack>
        );
    }

    const list = organizations ?? [];
    const only = list.length === 1;
    const picked = list.find((organization) => organization.id === pickedId && organization.id !== currentOrganizationId) ?? null;

    const confirm = async () => {
        if (!picked) return;
        const driver = await switchTo(picked.id);
        if (driver) onSwitched?.(driver);
    };

    return (
        <Screen
            gap={space[2]}
            testID="org-switcher"
            footer={
                list.length > 1 ? (
                    <>
                        <BigButton disabled={!picked || !isOnline} loading={!!switchingTo} onPress={confirm} testID="orgs-switch">
                            {picked ? t('me.org.switchTo', { name: picked.name ?? picked.id }) : t('me.org.choose')}
                        </BigButton>
                        {/* Switching signs the driver in again; said before, not after. */}
                        <Secondary fontSize={13} center testID="switch-warning">
                            {!isOnline ? t('me.org.needsSignal') : t('orgSwitcher.warning')}
                        </Secondary>
                    </>
                ) : undefined
            }
        >
            {list.length === 0 ? (
                <YStack flex={1} justifyContent="center">
                    <EmptyState testID="orgs-empty" title={t('orgSwitcher.noneTitle')} body={t('orgSwitcher.noneBody')} />
                </YStack>
            ) : (
                <>
                    <YStack paddingTop={space[2]} paddingBottom={space[4]}>
                        {/* One organisation is not a choice — say so instead of implying it is. */}
                        <StepTitle title={only ? t('orgSwitcher.onlyOne') : t('me.org.title')} body={only ? undefined : t('me.org.body', { count: list.length })} testID={only ? 'single-org' : 'orgs-title'} />
                    </YStack>

                    {switchError ? <ErrorState title={t('orgSwitcher.switchFailed')} body={switchError} onRetry={clearError} retryLabel={t('common.dismiss')} testID="switch-error" /> : null}

                    <YStack gap={space[2]} accessibilityRole="radiogroup" testID="orgs-list">
                        {list.map((organization) => {
                            const isCurrent = organization.id === currentOrganizationId;
                            const selected = picked?.id === organization.id;
                            const selectable = !isCurrent && !only && !switchingTo;
                            return (
                                <Card
                                    key={organization.id}
                                    selected={selected}
                                    flexDirection="row"
                                    alignItems="center"
                                    gap={14}
                                    minHeight={88}
                                    paddingVertical={space[3]}
                                    onPress={selectable ? () => setPickedId(organization.id) : undefined}
                                    pressStyle={selectable ? { opacity: 0.8 } : undefined}
                                    accessibilityRole={selectable ? 'radio' : 'text'}
                                    accessibilityState={{ selected }}
                                    testID={`org-${organization.id}`}
                                >
                                    <Avatar url={organization.logo_url} name={organization.name} size={52} square />
                                    <YStack flex={1} gap={3} minWidth={0}>
                                        <Body fontSize={18} fontWeight="800" numberOfLines={1}>
                                            {organization.name ?? organization.id}
                                        </Body>
                                        {isCurrent ? (
                                            <Body fontSize={14} fontWeight="700" tone="success" testID={`current-${organization.id}`}>
                                                {t('me.org.drivingNow')}
                                            </Body>
                                        ) : null}
                                    </YStack>
                                    {selectable || selected ? <RadioMark selected={selected} size={28} /> : null}
                                </Card>
                            );
                        })}
                    </YStack>
                </>
            )}
        </Screen>
    );
}

export default OrgSwitcherScreen;
