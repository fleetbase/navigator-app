/**
 * The opening screen's motion — design round 3 frame s20.
 *
 * A quiet map drifts slowly. A route draws itself across it from the driver's
 * dot; each waypoint pops in, numbered, as the line reaches it; the last one
 * lands as a green tick. Then the driver's dot keeps pinging, so the screen is
 * never still.
 *
 * Drawn, not a video or a Lottie file, so it takes the build's brand colour,
 * costs nothing to load and works offline. With reduced motion on, the finished
 * route is shown still.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from 'tamagui';
import { Body } from '../ui/Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The drawing's own coordinate space; everything scales from the screen's width. */
const VIEW_W = 390;
const VIEW_H = 560;
const ROUTE = 'M40 500 L104 492 L112 330 L236 316 L246 200 L334 190 L338 100';
/** Longer than the route, so the dash covers it whatever the scale. */
const ROUTE_LENGTH = 900;
const DRAW_MS = 2600;
const START = { x: 40, y: 500 };
/** `at` is how far along the drawing the line is when it reaches the waypoint. */
const WAYPOINTS = [
    { x: 112, y: 330, at: 0.34, label: '1' },
    { x: 246, y: 200, at: 0.64, label: '2' },
    { x: 338, y: 100, at: 0.98, label: '' },
];

function Pin({ x, y, scale, size, children, progress, style }: { x: number; y: number; scale: number; size: number; children?: React.ReactNode; progress: Animated.Value; style: object }) {
    return (
        <Animated.View
            style={[
                styles.pin,
                style,
                {
                    left: x * scale - size / 2,
                    top: y * scale - size / 2,
                    width: size,
                    height: size,
                    opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
                    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                },
            ]}
        >
            {children}
        </Animated.View>
    );
}

export function RouteAnimation({ width, testID = 'route-animation' }: { /** Screen width; the drawing scales to it. */ width: number; testID?: string }) {
    const theme = useTheme();
    const primary = theme.primary?.val as string;
    const road = theme.surfaceRaised?.val as string;
    const lane = theme.surface?.val as string;
    const ink = theme.textPrimary?.val as string;
    const background = theme.background?.val as string;
    const success = (theme.success?.val ?? theme.successText?.val ?? '#2FBF71') as string;

    const scale = width / VIEW_W;
    const height = VIEW_H * scale;

    const draw = useRef(new Animated.Value(0)).current;
    const drift = useRef(new Animated.Value(0)).current;
    const ping = useRef(new Animated.Value(0)).current;
    const endPing = useRef(new Animated.Value(0)).current;
    const pops = useRef(WAYPOINTS.map(() => new Animated.Value(0))).current;
    const [still, setStill] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const running: Animated.CompositeAnimation[] = [];
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    setStill(true);
                    draw.setValue(1);
                    pops.forEach((pop) => pop.setValue(1));
                    return;
                }
                const line = Animated.timing(draw, { toValue: 1, duration: DRAW_MS, delay: 300, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: false });
                const landings = Animated.parallel(
                    WAYPOINTS.map((point, index) =>
                        Animated.sequence([Animated.delay(300 + DRAW_MS * point.at), Animated.spring(pops[index], { toValue: 1, friction: 5, tension: 140, useNativeDriver: true })])
                    )
                );
                const sway = Animated.loop(
                    Animated.sequence([
                        Animated.timing(drift, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                        Animated.timing(drift, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                    ])
                );
                const pulse = Animated.loop(Animated.timing(ping, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
                // The finished waypoint starts pulsing once the route has reached it.
                const arrival = Animated.sequence([
                    Animated.delay(300 + DRAW_MS + 250),
                    Animated.loop(Animated.timing(endPing, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true })),
                ]);
                running.push(line, landings, sway, pulse, arrival);
                running.forEach((animation) => animation.start());
            });
        return () => {
            cancelled = true;
            running.forEach((animation) => animation.stop());
        };
    }, [draw, drift, ping, endPing, pops]);

    return (
        <View style={{ width, height, overflow: 'hidden' }} testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            <Animated.View
                style={{
                    width,
                    height,
                    transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14 * scale] }) }, { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -10 * scale] }) }, { scale: 1.06 }],
                }}
            >
                <Svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
                    <Rect width={VIEW_W} height={VIEW_H} fill={background} />
                    <G stroke={road} strokeWidth={14} strokeLinecap="round" fill="none">
                        <Path d="M-20 150 L420 90" />
                        <Path d="M-20 330 L420 280" />
                        <Path d="M-20 500 L420 460" />
                        <Path d="M70 -20 L110 580" />
                        <Path d="M230 -20 L250 580" />
                        <Path d="M340 -20 L330 580" />
                    </G>
                    <G stroke={lane} strokeWidth={6} strokeLinecap="round" fill="none">
                        <Path d="M-20 230 L420 200" />
                        <Path d="M-20 420 L420 380" />
                        <Path d="M160 -20 L175 580" />
                    </G>
                    <AnimatedPath
                        d={ROUTE}
                        fill="none"
                        stroke={primary}
                        strokeWidth={5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray={`${ROUTE_LENGTH} ${ROUTE_LENGTH}`}
                        strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [ROUTE_LENGTH, 0] })}
                    />
                </Svg>

                {still ? null : (
                    <Animated.View
                        style={[
                            styles.pin,
                            {
                                left: START.x * scale - 16,
                                top: START.y * scale - 16,
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: primary,
                                opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                                transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.6] }) }],
                            },
                        ]}
                    />
                )}
                <View style={[styles.pin, { left: START.x * scale - 11, top: START.y * scale - 11, width: 22, height: 22, borderRadius: 11, backgroundColor: primary, borderWidth: 3, borderColor: ink }]} />

                {WAYPOINTS.map((point, index) => {
                    const last = index === WAYPOINTS.length - 1;
                    return last ? (
                        <React.Fragment key="end">
                            {still ? null : (
                                <Animated.View
                                    style={[
                                        styles.pin,
                                        {
                                            left: point.x * scale - 20,
                                            top: point.y * scale - 20,
                                            width: 40,
                                            height: 40,
                                            borderRadius: 12,
                                            backgroundColor: success,
                                            opacity: endPing.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.55, 0] }),
                                            transform: [{ scale: endPing.interpolate({ inputRange: [0, 1], outputRange: [1, 2.3] }) }],
                                        },
                                    ]}
                                />
                            )}
                        <Pin key={point.label || 'end'} x={point.x} y={point.y} scale={scale} size={40} progress={pops[index]} style={{ borderRadius: 12, backgroundColor: success }}>
                            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#06210F" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                                <Path d="M5 12.5l4.5 4.5L19 7.5" />
                            </Svg>
                        </Pin>
                        </React.Fragment>
                    ) : (
                        <Pin key={point.label} x={point.x} y={point.y} scale={scale} size={32} progress={pops[index]} style={{ borderRadius: 10, backgroundColor: road, borderWidth: 2, borderColor: primary }}>
                            <Body fontSize={16} lineHeight={20} fontWeight="800">
                                {point.label}
                            </Body>
                        </Pin>
                    );
                })}
            </Animated.View>

            {/* The map fades into the page, so the words below sit on a clean ground. */}
            <View style={[StyleSheet.absoluteFill, { top: height * 0.5 }]}>
                <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 10 10">
                    <Defs>
                        <LinearGradient id="welcomeFade" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={background} stopOpacity={0} />
                            <Stop offset="0.78" stopColor={background} stopOpacity={1} />
                            <Stop offset="1" stopColor={background} stopOpacity={1} />
                        </LinearGradient>
                    </Defs>
                    <Rect width={10} height={10} fill="url(#welcomeFade)" />
                </Svg>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    pin: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});

export default RouteAnimation;
