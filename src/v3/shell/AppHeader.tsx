/**
 * App shell header.
 *
 * v2 spent a full row on a logo, the word "Navigator" and a version string
 * ("v2.0.7 #13") — none of which a driver needs mid-shift, and the version was
 * printed twice on the Account screen as well. This shows the thing that
 * actually matters in a multi-tenant app: which organisation you are working
 * for, and whether you are on duty.
 */
import { XStack, YStack } from 'tamagui';
import { Body, Micro } from '../ui/Text';
import { radius, space } from '../theme/tokens';
import { DutyPill } from './DutyPill';
import type { DutyState } from './DutyContext';

export function AppHeader({
    organizationName,
    /** Optional second line — driver name, vehicle, or nothing. */
    subtitle,
    duty,
    isChanging,
    onDutyPress,
    testID,
}: {
    organizationName: string;
    subtitle?: string;
    duty: DutyState;
    isChanging?: boolean;
    onDutyPress?: () => void;
    testID?: string;
}) {
    // Brand mark: first letter of the organisation, so a white-label build needs
    // no asset to look intentional.
    const letter = (organizationName?.trim()?.[0] ?? '?').toUpperCase();

    return (
        <XStack
            testID={testID ?? 'app-header'}
            alignItems="center"
            gap={space[3]}
            paddingHorizontal={space[4]}
            paddingVertical={space[3]}
            backgroundColor="$background"
        >
            <YStack
                width={30}
                height={30}
                borderRadius={radius.compact - 1}
                backgroundColor="$primary"
                alignItems="center"
                justifyContent="center"
            >
                <Micro tone="onPrimary" fontSize={13}>
                    {letter}
                </Micro>
            </YStack>

            <YStack flex={1} minWidth={0}>
                <Body fontSize={15} fontWeight="800" numberOfLines={1}>
                    {organizationName}
                </Body>
                {subtitle ? <Micro numberOfLines={1}>{subtitle}</Micro> : null}
            </YStack>

            <DutyPill duty={duty} isChanging={isChanging} onPress={onDutyPress} />
        </XStack>
    );
}

export default AppHeader;
