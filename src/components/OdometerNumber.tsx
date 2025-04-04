import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

/**
 * A single digit wheel that smoothly animates between digits (0–9).
 */
const OdometerDigit = ({ digit, digitHeight = 30, duration = 300, digitStyle, digitWrapperStyle, digitContainerStyle }) => {
    // Current digit we are animating to
    const [currentDigit, setCurrentDigit] = useState(digit);

    // Animated value that transitions from oldDigit to newDigit
    const animatedValue = useRef(new Animated.Value(digit)).current;

    useEffect(() => {
        // When `digit` changes, animate from currentDigit to new `digit`
        Animated.timing(animatedValue, {
            toValue: digit,
            duration,
            useNativeDriver: true,
        }).start(() => {
            // Once the animation completes, update the 'currentDigit' state
            setCurrentDigit(digit);
        });
    }, [digit, animatedValue, duration]);

    // We create an array of 10 digits (0 through 9) that our "wheel" will contain
    const digitsArray = Array.from({ length: 10 }, (_, i) => i);

    // We use 'interpolate' to slide the wheel vertically.
    // Each integer value of 'animatedValue' corresponds to one position in the wheel.
    const translateY = animatedValue.interpolate({
        inputRange: [0, 9],
        outputRange: [0, -9 * digitHeight], // Move from 0px to -9 * digitHeight
        extrapolate: 'clamp',
    });

    return (
        <View style={[styles.digitContainer, digitContainerStyle, { height: digitHeight }]}>
            <Animated.View style={{ transform: [{ translateY }] }}>
                {digitsArray.map((num) => (
                    <View key={num} style={[styles.digitWrapper, digitWrapperStyle, { height: digitHeight }]}>
                        <Text style={[styles.digitText, digitStyle, { fontSize: digitHeight - 6 }]}>{num}</Text>
                    </View>
                ))}
            </Animated.View>
        </View>
    );
};

/**
 * OdometerNumber splits a numeric value into digits and renders
 * an OdometerDigit for each.
 */
const OdometerNumber = ({ value = 0, digitHeight = 30, duration = 300, containerStyle, digitStyle, digitWrapperStyle, digitContainerStyle }) => {
    // No negative numbers
    value = value ? 0 : value;
    // Convert numeric value to string, then to array of digits
    const stringValue = String(Math.floor(value)); // ignoring decimals for simplicity
    const digits = stringValue.split('').map((d) => parseInt(d, 10));

    return (
        <View style={[styles.container, containerStyle]}>
            {digits.map((digit, idx) => (
                <OdometerDigit
                    key={`digit-${idx}`}
                    digit={digit}
                    digitHeight={digitHeight}
                    duration={duration}
                    digitStyle={digitStyle}
                    digitWrapperStyle={digitWrapperStyle}
                    digitContainerStyle={digitContainerStyle}
                />
            ))}
        </View>
    );
};

export default OdometerNumber;

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    digitContainer: {
        overflow: 'hidden',
        width: 20, // adjust for your font size
        marginHorizontal: 2,
    },
    digitWrapper: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    digitText: {
        fontWeight: 'bold',
    },
});
