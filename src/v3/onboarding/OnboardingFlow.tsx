/**
 * The first minutes after signing in — design round 3 frames s60 and s61.
 *
 * Only the steps that apply are shown: which organisation to drive for, when
 * the driver belongs to more than one; then location and notifications, each
 * explained before the system asks, and only if not already granted. A driver
 * with one organisation and both permissions sees none of this.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Spinner, XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Secondary } from '../ui/Text';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverOrganizations, useSwitchOrganization, type OrganizationRecord } from '../data';
import { checkPermission, requestPermission, openSettings, type PermissionKey, type PermissionState } from '../permissions/permissions';
import { AuthScaffold, BigButton, CARD_RADIUS, LinkButton, StepTitle } from './AuthScaffold';

type Step = 'organization' | 'location' | 'notifications';

const ICONS: Record<string, string> = {
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    pin: 'M12 21s7-6.200 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z',
    tick: 'M5 12.500l4.500 4.500L19 7.500',
    bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
    chat: 'M5 5h14v10h-8l-5 4v-4H5z',
    route: 'M4 7h11l-3-3M20 17H9l3 3',
    arrow: 'M12 2l8 19-8-4-8 4z',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
};

function Glyph({ name, size = 18, color }: { name: keyof typeof ICONS; size?: number; color: string }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <Path d={ICONS[name]} />
        </Svg>
    );
}

function Point({ icon, title, body }: { icon: keyof typeof ICONS; title: string; body: string }) {
    const theme = useTheme();
    return (
        <XStack alignItems="flex-start" gap={space[3]}>
            <YStack width={36} height={36} borderRadius={12} backgroundColor="$primaryFill" alignItems="center" justifyContent="center">
                <Glyph name={icon} color={theme.primary?.val as string} />
            </YStack>
            <YStack flex={1} gap={2}>
                <Body fontSize={16} fontWeight="800">
                    {title}
                </Body>
                <Secondary fontSize={14} lineHeight={20}>
                    {body}
                </Secondary>
            </YStack>
        </XStack>
    );
}

function Emblem({ icon }: { icon: keyof typeof ICONS }) {
    return (
        <YStack alignItems="center" justifyContent="center" height={176}>
            <YStack position="absolute" width={176} height={176} borderRadius={88} borderWidth={2} borderColor="$primary" opacity={0.18} />
            <YStack position="absolute" width={128} height={128} borderRadius={64} borderWidth={2} borderColor="$primary" opacity={0.36} />
            <YStack width={84} height={84} borderRadius={42} backgroundColor="$primary" alignItems="center" justifyContent="center">
                <Glyph name={icon} size={34} color="#FFFFFF" />
            </YStack>
        </YStack>
    );
}

function OrganizationStep({ organizations, currentId, switchingTo, error, onChoose }: { organizations: OrganizationRecord[]; currentId?: string; switchingTo: string | null; error: string | null; onChoose: (organization: OrganizationRecord) => void }) {
    const { t } = useTranslation();
    const [picked, setPicked] = useState<string | undefined>(currentId ?? organizations[0]?.id);
    const chosen = organizations.find((o) => o.id === picked) ?? organizations[0];
    return (
        <AuthScaffold
            testID="onboarding-organization"
            footer={
                <BigButton loading={!!switchingTo} onPress={() => chosen && onChoose(chosen)} testID="onboarding-organization-continue">
                    <Body fontSize={18} fontWeight="800" tone="onPrimary" numberOfLines={1}>
                        {t('onboarding.continueWith', { organization: (chosen as { name?: string })?.name ?? '' })}
                    </Body>
                </BigButton>
            }
        >
            <StepTitle title={t('onboarding.organizationTitle')} body={t('onboarding.organizationBody', { count: organizations.length })} />
            {error ? <Banner tone="danger" message={error} testID="onboarding-organization-error" /> : null}
            <YStack gap={space[2]}>
                {organizations.map((organization) => {
                    const record = organization as { id: string; name?: string; logo_url?: string | null };
                    const on = record.id === picked;
                    const initials = (record.name ?? '?').split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
                    return (
                        <XStack
                            key={record.id}
                            alignItems="center"
                            gap={14}
                            height={88}
                            paddingHorizontal={14}
                            borderRadius={CARD_RADIUS}
                            backgroundColor={on ? '$primaryFill' : '$surface'}
                            borderWidth={on ? 1.5 : 1}
                            borderColor={on ? '$primary' : '$border'}
                            onPress={() => setPicked(record.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: on }}
                            testID={`onboarding-organization-${record.id}`}
                        >
                            {record.logo_url ? (
                                <Image source={{ uri: record.logo_url }} style={{ width: 52, height: 52, borderRadius: 16 }} />
                            ) : (
                                <YStack width={52} height={52} borderRadius={16} backgroundColor="$primary" alignItems="center" justifyContent="center">
                                    <Body fontSize={18} fontWeight="800" color="#FFFFFF">
                                        {initials}
                                    </Body>
                                </YStack>
                            )}
                            <YStack flex={1} gap={3}>
                                <Body fontSize={18} fontWeight="800" numberOfLines={1}>
                                    {record.name}
                                </Body>
                                {record.id === currentId ? <Caption fontWeight="700">{t('onboarding.lastUsed')}</Caption> : null}
                            </YStack>
                            <YStack width={28} height={28} borderRadius={14} alignItems="center" justifyContent="center" backgroundColor={on ? '$primary' : '$transparent'} borderWidth={on ? 0 : 1.5} borderColor="$border">
                                {on ? <Glyph name="tick" size={14} color="#FFFFFF" /> : null}
                            </YStack>
                        </XStack>
                    );
                })}
            </YStack>
        </AuthScaffold>
    );
}

function PermissionStep({ kind, state, busy, onAllow, onSkip }: { kind: 'location' | 'notifications'; state: PermissionState; busy: boolean; onAllow: () => void; onSkip: () => void }) {
    const { t } = useTranslation();
    const blocked = state === 'blocked';
    const points: { icon: keyof typeof ICONS; key: string }[] =
        kind === 'location'
            ? [
                  { icon: 'clock', key: 'duty' },
                  { icon: 'pin', key: 'eta' },
                  { icon: 'tick', key: 'arrive' },
              ]
            : [
                  { icon: 'bolt', key: 'offers' },
                  { icon: 'route', key: 'changes' },
                  { icon: 'chat', key: 'messages' },
              ];
    return (
        <AuthScaffold
            testID={`onboarding-${kind}`}
            footer={
                <>
                    <BigButton loading={busy} onPress={blocked ? () => void openSettings() : onAllow} testID={`onboarding-${kind}-allow`}>
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {blocked ? t('onboarding.openSettings') : t(`onboarding.${kind}.allow`)}
                        </Body>
                    </BigButton>
                    <LinkButton onPress={onSkip} testID={`onboarding-${kind}-skip`}>
                        {t(`onboarding.${kind}.skip`)}
                    </LinkButton>
                </>
            }
        >
            <Emblem icon={kind === 'location' ? 'arrow' : 'bell'} />
            <StepTitle eyebrow={t(`onboarding.${kind}.eyebrow`)} title={t(`onboarding.${kind}.title`)} />
            <YStack gap={14}>
                {points.map((point) => (
                    <Point key={point.key} icon={point.icon} title={t(`onboarding.${kind}.${point.key}Title`)} body={t(`onboarding.${kind}.${point.key}Body`)} />
                ))}
            </YStack>
            {blocked ? <Banner tone="warning" message={t('onboarding.blocked')} testID={`onboarding-${kind}-blocked`} /> : kind === 'location' ? <Banner tone="neutral" message={t('onboarding.location.always')} /> : null}
        </AuthScaffold>
    );
}

export interface OnboardingFlowProps {
    driverId?: string;
    organizationId?: string;
    /** A different organisation was chosen: hands up the new driver and its token. */
    onOrganizationSwitched?: (driver: unknown) => void;
    /** Every applicable step is finished or skipped. */
    onDone: () => void;
}

export function OnboardingFlow({ driverId, organizationId, onOrganizationSwitched, onDone }: OnboardingFlowProps) {
    const { organizations, isLoading } = useDriverOrganizations(driverId);
    const { switchTo, switchingTo, error } = useSwitchOrganization(driverId);
    const [states, setStates] = useState<Partial<Record<PermissionKey, PermissionState>> | null>(null);
    const [finished, setFinished] = useState<Step[]>([]);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let live = true;
        void Promise.all([checkPermission('location'), checkPermission('notifications')]).then(([location, notifications]) => {
            if (live) setStates({ location, notifications });
        });
        return () => {
            live = false;
        };
    }, []);

    const steps = useMemo<Step[] | null>(() => {
        if (!states || isLoading) return null;
        const needed: Step[] = [];
        if ((organizations?.length ?? 0) > 1) needed.push('organization');
        const settled = (state?: PermissionState) => state === 'granted' || state === 'unavailable';
        if (!settled(states.location)) needed.push('location');
        if (!settled(states.notifications)) needed.push('notifications');
        return needed;
    }, [states, isLoading, organizations]);

    const current = steps?.find((step) => !finished.includes(step));
    const finish = useCallback((step: Step) => setFinished((done) => (done.includes(step) ? done : [...done, step])), []);

    useEffect(() => {
        if (steps && !current) onDone();
    }, [steps, current, onDone]);

    const ask = useCallback(
        async (key: 'location' | 'notifications') => {
            setBusy(true);
            const outcome = await requestPermission(key);
            setBusy(false);
            setStates((previous) => ({ ...previous, [key]: outcome.state }));
            // A refusal that can still be changed in Settings stays on screen once, so the way there is offered.
            if (outcome.state !== 'blocked') finish(key);
        },
        [finish]
    );

    if (!steps || !current) {
        return (
            <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" testID="onboarding-loading">
                <Spinner size="large" color={'$primary' as never} />
            </YStack>
        );
    }

    if (current === 'organization') {
        return (
            <OrganizationStep
                organizations={organizations ?? []}
                currentId={organizationId}
                switchingTo={switchingTo}
                error={error}
                onChoose={async (organization) => {
                    if (organization.id !== organizationId) {
                        const driver = await switchTo(organization.id);
                        if (!driver) return;
                        onOrganizationSwitched?.(driver);
                    }
                    finish('organization');
                }}
            />
        );
    }

    return <PermissionStep kind={current} state={states?.[current] ?? 'unknown'} busy={busy} onAllow={() => void ask(current)} onSkip={() => finish(current)} />;
}

export default OnboardingFlow;
