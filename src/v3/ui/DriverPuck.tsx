/**
 * The driver on the map: a dot, a ring that pulses out from it, and, when the
 * phone knows which way it is pointing, a cone showing the direction.
 *
 * Drawn by the app rather than left to the map's own blue dot, so it looks the
 * same on every phone and says which way the driver is facing.
 */
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const SIZE = 84;
const HALF = SIZE / 2;

export function DriverPuck({ color = '#3D7BFA', heading, muted }: { color?: string; /** Degrees clockwise from north; omitted when unknown. */ heading?: number | null; /** Grey and still: the driver is offline. */ muted?: boolean }) {
    const pulse = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (muted) return;
        let loop: Animated.CompositeAnimation | null = null;
        let cancelled = false;
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled || reduced) return;
                loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
                loop.start();
            });
        return () => {
            cancelled = true;
            loop?.stop();
        };
    }, [pulse, muted]);

    const ink = muted ? '#6F7F97' : color;
    const hasHeading = typeof heading === 'number' && Number.isFinite(heading) && heading >= 0;

    return (
        <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            {muted ? null : (
                <Animated.View
                    style={{
                        position: 'absolute',
                        width: SIZE,
                        height: SIZE,
                        borderRadius: HALF,
                        backgroundColor: ink,
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                    }}
                />
            )}
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                <Circle cx={HALF} cy={HALF} r={HALF - 6} fill={ink} fillOpacity={0.12} stroke={ink} strokeOpacity={0.32} strokeWidth={1} />
                {hasHeading ? <Path d={`M${HALF} ${HALF} L${HALF - 17} ${HALF - 30} A34.5 34.5 0 0 1 ${HALF + 17} ${HALF - 30} Z`} fill={ink} fillOpacity={0.42} transform={`rotate(${heading} ${HALF} ${HALF})`} /> : null}
                <Circle cx={HALF} cy={HALF} r={10} fill={ink} stroke="#FFFFFF" strokeWidth={3} />
            </Svg>
        </View>
    );
}

export default DriverPuck;
