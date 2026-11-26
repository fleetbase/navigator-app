/**
 * A sheet that rises from the bottom over a dimmed screen.
 *
 * The two parts move differently, and that is the whole point of this
 * component: the dimming **fades** in over the screen, and only the sheet
 * **slides** up. React Native's `Modal animationType="slide"` slides its entire
 * contents, so a backdrop drawn inside it travels up with the sheet and the
 * driver watches a dark rectangle rise from the bottom of the screen. Every
 * sheet in the app goes through here so that cannot happen again.
 *
 * Closing plays the same in reverse, so the modal stays mounted until the sheet
 * has left. With reduced motion on, both parts simply appear and disappear.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';

const IN_MS = 240;
const OUT_MS = 180;
/** How far below its resting place the sheet starts. Enough to read as rising, not the whole screen. */
const TRAVEL = 360;

export interface SheetModalProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Spoken for the dimmed area, which closes the sheet when tapped. */
    dismissLabel?: string;
    testID?: string;
}

export function SheetModal({ visible, onClose, children, dismissLabel = 'Dismiss', testID }: SheetModalProps) {
    const progress = useRef(new Animated.Value(0)).current;
    // Mounted from the moment it opens until its closing animation has finished.
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let cancelled = false;
        if (visible) setMounted(true);
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    progress.setValue(visible ? 1 : 0);
                    if (!visible) setMounted(false);
                    return;
                }
                Animated.timing(progress, {
                    toValue: visible ? 1 : 0,
                    duration: visible ? IN_MS : OUT_MS,
                    easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (finished && !visible && !cancelled) setMounted(false);
                });
            });
        return () => {
            cancelled = true;
        };
    }, [visible, progress]);

    return (
        <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <View style={styles.root} testID={testID}>
                {/* The dimming: fades, never moves. */}
                <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]} pointerEvents="none" />
                <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel={dismissLabel} testID={testID ? `${testID}-dismiss` : undefined} />
                {/* The sheet: the only thing that slides. */}
                <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [TRAVEL, 0] }) }] }}>
                    {children}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
    dismiss: { flex: 1 },
});

export default SheetModal;
