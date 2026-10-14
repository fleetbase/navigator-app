import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

type SafeSpinnerProps = {
    color?: string;
    size?: number | 'small' | 'large' | 'lg' | string;
    style?: StyleProp<ViewStyle>;
    testID?: string;
};

const getSpinnerSize = (size: SafeSpinnerProps['size']) => {
    if (typeof size === 'number') return size;
    if (size === 'large' || size === 'lg' || size === '$6') return 36;
    return 20;
};

/**
 * A view-based spinner that avoids Android's native ProgressBar. React Native
 * 0.86 can crash while Fabric measures that native component with null data.
 */
const SafeSpinner: React.FC<SafeSpinnerProps> = ({ color = '#6b7280', size = 'small', style, testID }) => {
    const rotation = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.timing(rotation, {
                toValue: 1,
                duration: 750,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );

        animation.start();
        return () => animation.stop();
    }, [rotation]);

    const diameter = getSpinnerSize(size);
    const borderWidth = Math.max(2, Math.round(diameter / 10));
    const rotate = rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <Animated.View
            testID={testID}
            accessibilityLabel='Loading'
            style={[
                {
                    width: diameter,
                    height: diameter,
                    borderRadius: diameter / 2,
                    borderWidth,
                    borderColor: color,
                    borderTopColor: 'transparent',
                    transform: [{ rotate }],
                },
                style,
            ]}
        />
    );
};

export default SafeSpinner;
