/**
 * Title bar for a pushed screen.
 *
 * Every route in the v3 stack was declared `headerShown: false`, which left
 * pushed screens — fuel report, issue detail, item detail, the timeline,
 * conversations, profile, sync queue, permissions — with no title and, worse,
 * no visible way back. The iOS edge-swipe still worked, but a gesture with no
 * on-screen affordance is not a way back for someone wearing gloves in the rain,
 * and it tells the driver nothing about where they are.
 *
 * Deliberately not the native header: the shell already draws its own header
 * (organisation and duty) above the navigator, and a second native bar would
 * stack a system-styled row on top of a designed one.
 */
import { XStack, YStack } from 'tamagui';
import { backChevron } from '../i18n/direction';
import { Body } from './Text';
import { space } from '../theme/tokens';

export function ScreenHeader({
    title,
    /** Omitted at a stack root, where there is nothing to go back to. */
    onBack,
    /** Optional trailing control — a single action, never a row of them. */
    action,
    testID,
}: {
    title: string;
    onBack?: () => void;
    action?: React.ReactNode;
    testID?: string;
}) {
    return (
        <XStack
            testID={testID ?? 'screen-header'}
            alignItems="center"
            gap={space[2]}
            paddingHorizontal={space[3]}
            paddingBottom={space[2]}
            backgroundColor="$background"
        >
            {onBack ? (
                <YStack
                    // 44pt: the smallest target Apple considers reliable, and
                    // this one is used at arm's length in a moving vehicle.
                    width={44}
                    height={44}
                    alignItems="center"
                    justifyContent="center"
                    onPress={onBack}
                    pressStyle={{ opacity: 0.6 }}
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    testID="screen-back"
                >
                    <Body fontSize={26} fontWeight="400" tone="brand" lineHeight={28}>
                        {backChevron()}
                    </Body>
                </YStack>
            ) : (
                <YStack width={space[1]} />
            )}

            <Body flex={1} fontSize={17} fontWeight="800" numberOfLines={1}>
                {title}
            </Body>

            {action ?? null}
        </XStack>
    );
}

export default ScreenHeader;
