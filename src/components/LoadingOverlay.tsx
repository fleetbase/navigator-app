import React, { useMemo } from 'react';
import { YStack, Spinner, Text, useTheme } from 'tamagui';
import LinearGradient from 'react-native-linear-gradient';

interface LoadingOverlayProps {
    visible: boolean;
    text?: string;
    spinnerSize?: number | string;
    spinnerColor?: string;
    textColor?: string;
    bgColor?: string;
    overlayOpacity?: number;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    visible = false,
    text,
    spinnerSize = 'lg',
    spinnerColor = '$textPrimary',
    textColor = '$textPrimary',
    bgColor = 'gray',
    overlayOpacity = 0.85,
    numberOfLines = 1,
}) => {
    const theme = useTheme();
    const gradientColors = useMemo(() => {
        try {
            return [theme[`$black`].val, theme[`$${bgColor}-900`].val, theme[`$${bgColor}-800`].val, theme[`$${bgColor}-900`].val, theme[`$black`].val];
        } catch (e) {
            // Fallback static colors if theme lookup fails.
            return ['#111827', '#1f2937', '#374151', '#4b5563'];
        }
    }, [bgColor, theme]);

    if (!visible) return <YStack />;
    return (
        <YStack position='absolute' top={0} left={0} right={0} bottom={0} justifyContent='center' alignItems='center' zIndex={9999}>
            <LinearGradient
                colors={gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={{ position: 'absolute', opacity: overlayOpacity, top: 0, left: 0, right: 0, bottom: 0 }}
            />
            <YStack flex={1} alignItems='center' justifyContent='center'>
                <Spinner size={spinnerSize} color={spinnerColor} />
                {text && (
                    <Text
                        marginTop='$2'
                        fontSize={16}
                        color={textColor}
                        numberOfLines={numberOfLines}
                        mt='$5'
                        style={{ textShadowColor: 'rgba(0, 0, 0, 0.9)', textShadowOffset: { width: -1, height: 1 }, textShadowRadius: 10 }}
                    >
                        {text}
                    </Text>
                )}
            </YStack>
        </YStack>
    );
};

export default LoadingOverlay;
