/**
 * The opening screen's motion — design round 3 frame s20: a route draws itself
 * across a quiet map, its waypoints land one by one, and the driver's dot keeps
 * breathing at the start.
 *
 * Drawn, not a video or a Lottie file, so it takes the build's brand colour,
 * costs nothing to load and works offline. With reduced motion on, the finished
 * route is shown still.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from 'tamagui';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedG = Animated.createAnimatedComponent(G);

const WIDTH = 390;
const HEIGHT = 440;
const ROUTE = 'M58 372 L112 366 L104 250 L214 240 L206 128 L322 118';
/** Generous over-estimate of the route's length; the dash only has to be at least that long. */
const ROUTE_LENGTH = 640;
const WAYPOINTS: { x: number; y: number; at: number }[] = [
    { x: 104, y: 250, at: 0.38 },
    { x: 214, y: 240, at: 0.56 },
    { x: 206, y: 128, at: 0.78 },
    { x: 322, y: 118, at: 1 },
];

export function RouteAnimation({ height = HEIGHT, testID = 'route-animation' }: { height?: number; testID?: string }) {
    const theme = useTheme();
    const primary = theme.primary?.val as string;
    const road = theme.surfaceRaised?.val as string;
    const lane = theme.surface?.val as string;
    const ink = theme.textPrimary?.val as string;
    const background = theme.background?.val as string;

    const draw = useRef(new Animated.Value(0)).current;
    const pulse = useRef(new Animated.Value(0)).current;
    const [still, setStill] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let loop: Animated.CompositeAnimation | undefined;
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    setStill(true);
                    draw.setValue(1);
                    return;
                }
                Animated.timing(draw, { toValue: 1, duration: 2600, delay: 250, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
                loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.out(Easing.quad), useNativeDriver: false }));
                loop.start();
            });
        return () => {
            cancelled = true;
            loop?.stop();
            draw.stopAnimation();
        };
    }, [draw, pulse]);

    const dashOffset = draw.interpolate({ inputRange: [0, 1], outputRange: [ROUTE_LENGTH, 0] });

    return (
        <Svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid slice" testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Rect width={WIDTH} height={HEIGHT} fill={background} />
            <G stroke={road} strokeWidth={18} strokeLinecap="round" fill="none">
                <Path d="M-10 136 L400 104" />
                <Path d="M-10 258 L400 226" />
                <Path d="M-10 384 L400 352" />
                <Path d="M98 -10 L122 450" />
                <Path d="M200 -10 L224 450" />
                <Path d="M316 -10 L334 450" />
            </G>
            <G stroke={lane} strokeWidth={8} strokeLinecap="round" fill="none">
                <Path d="M-10 194 L400 166" />
                <Path d="M-10 318 L400 290" />
                <Path d="M150 -10 L172 450" />
                <Path d="M262 -10 L282 450" />
            </G>

            <AnimatedPath d={ROUTE} fill="none" stroke={primary} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${ROUTE_LENGTH} ${ROUTE_LENGTH}`} strokeDashoffset={dashOffset} />

            {WAYPOINTS.map((point, index) => {
                const start = Math.max(0, point.at - 0.12);
                const opacity = draw.interpolate({ inputRange: [0, start, point.at, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' });
                const last = index === WAYPOINTS.length - 1;
                const size = last ? 36 : 26;
                return (
                    <AnimatedG key={`${point.x}-${point.y}`} opacity={opacity}>
                        <Rect x={point.x - size / 2} y={point.y - size / 2} width={size} height={size} rx={last ? 11 : 8} fill={last ? primary : background} stroke={last ? ink : primary} strokeWidth={last ? 2.5 : 3} />
                        {last ? <Path d={`M${point.x} ${point.y - 8}v14M${point.x - 6} ${point.y}l6 7 6-7`} fill="none" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
                    </AnimatedG>
                );
            })}

            {still ? null : (
                <AnimatedCircle
                    cx={58}
                    cy={372}
                    r={pulse.interpolate({ inputRange: [0, 1], outputRange: [10, 34] })}
                    opacity={pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] })}
                    fill="none"
                    stroke={primary}
                    strokeWidth={2}
                />
            )}
            <Circle cx={58} cy={372} r={10} fill={primary} stroke={ink} strokeWidth={3} />
        </Svg>
    );
}

export default RouteAnimation;
