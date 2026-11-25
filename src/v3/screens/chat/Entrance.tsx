/**
 * A card arriving: a short fade and rise, staggered down the list.
 *
 * Only the first screenful is staggered (a row scrolled into view later should
 * simply be there), and a driver who asked the system for less motion gets
 * none at all.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

let reduceMotion: boolean | undefined;
void AccessibilityInfo.isReduceMotionEnabled()
    .then((value) => {
        reduceMotion = value;
    })
    .catch(() => {});

export function Entrance({ index, children }: { index: number; children: React.ReactNode }) {
    // Unknown counts as "reduce": better a still card than motion nobody agreed to.
    const animate = reduceMotion === false && index < 8;
    const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

    useEffect(() => {
        if (!animate) return;
        const animation = Animated.timing(progress, { toValue: 1, duration: 350, delay: index * 60, easing: Easing.out(Easing.ease), useNativeDriver: true });
        animation.start();
        return () => animation.stop();
        // Runs once, when the card first appears.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>{children}</Animated.View>;
}

export default Entrance;
