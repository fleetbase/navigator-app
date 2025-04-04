import React, { FC } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { XStack, YStack, styled, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTruck } from '@fortawesome/free-solid-svg-icons';
import useAppTheme from '../hooks/use-app-theme';
import DashedLine from './DashedLine';

interface OrderProgressBarProps {
    progress: number;
    firstWaypointCompleted: boolean;
    lastWaypointCompleted: boolean;
}

const shadowProps = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
};

export const OrderProgressBar: FC<OrderProgressBarProps> = ({ progress, firstWaypointCompleted, lastWaypointCompleted }) => {
    const theme = useTheme();
    const { isDarkMode } = useAppTheme();
    const clampedProgress = Math.min(100, Math.max(0, progress));

    const WaypointMarker = ({ completed }) => (
        <YStack
            bg={completed ? '$success' : '$gray-800'}
            borderWidth={1}
            borderColor={completed ? '$successBorder' : '$gray-600'}
            width={24}
            height={24}
            borderRadius={Platform.OS === 'android' ? 24 : '100%'}
            alignItems='center'
            justifyContent='center'
            {...shadowProps}
            circular
        >
            <YStack
                borderWidth={1}
                borderColor={completed ? '$successBorder' : '$gray-600'}
                bg={completed ? '$successBorder' : '$gray-600'}
                width={14}
                height={14}
                borderRadius={Platform.OS === 'android' ? 14 : '100%'}
                circular
            ></YStack>
        </YStack>
    );

    return (
        <XStack alignItems='center' my='$2'>
            <WaypointMarker completed={firstWaypointCompleted} />

            <YStack flex={1} position='relative' height={20}>
                <DashedLine color={theme.borderColor.val} style={{ position: 'absolute', top: 9, left: 0, right: 0, opacity: 0.6 }} />
                <YStack position='absolute' width={`${clampedProgress}%`} top={9} left={0} right={0} height={4} bg='$success' />

                <YStack position='absolute' top={0} style={[{ transform: [{ translateX: clampedProgress === 100 ? -10 : -15 }], left: `${clampedProgress}%`, zIndex: 3 }]}>
                    <YStack
                        marginTop={-6}
                        width={34}
                        height={30}
                        borderWidth={1}
                        borderColor='$borderColor'
                        borderRadius='$2'
                        alignItems='center'
                        justifyContent='center'
                        backgroundColor={isDarkMode ? '$gray-800' : '$background'}
                    >
                        <FontAwesomeIcon icon={faTruck} size={16} color={theme.textPrimary.val} />
                    </YStack>
                </YStack>
            </YStack>

            <WaypointMarker completed={lastWaypointCompleted} />
        </XStack>
    );
};

export default OrderProgressBar;
