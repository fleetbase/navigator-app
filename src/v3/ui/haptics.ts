/**
 * A tap in the hand for something the driver may not be looking at.
 *
 * Scanning is done with the phone pointed at a parcel, often at arm's length in
 * a dark van: a short tap says "read", a double one says "not that one", before
 * the driver has read a word.
 *
 * It goes through the haptics module the app already ships
 * (`react-native-haptic-feedback`), which follows the phone's own setting: a
 * driver who has turned touch vibration off gets none. The module is loaded
 * only when first used and every call is guarded, so a build without it (or a
 * test) falls back to React Native's `Vibration`, and failing that does nothing.
 */
import { Platform, Vibration } from 'react-native';

export type HapticKind = 'success' | 'rejected';

type Trigger = (type: string, options?: { enableVibrateFallback?: boolean; ignoreAndroidSystemSettings?: boolean }) => void;

let trigger: Trigger | null | undefined;

function loadTrigger(): Trigger | null {
    if (trigger !== undefined) return trigger;
    try {
        const mod = require('react-native-haptic-feedback');
        const found = mod?.trigger ?? mod?.default?.trigger;
        trigger = typeof found === 'function' ? (found as Trigger) : null;
    } catch {
        trigger = null;
    }
    return trigger;
}

/** `success`: one short tap. `rejected`: two. Never throws. */
export function haptic(kind: HapticKind): void {
    try {
        const fire = loadTrigger();
        if (fire) {
            // The module's single tap, and its two-beat warning.
            fire(kind === 'success' ? 'impactMedium' : 'notificationWarning', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
            return;
        }
        // iOS has one length of vibration, a long one: better none than that for every label.
        if (Platform.OS !== 'android') return;
        if (kind === 'success') Vibration.vibrate(40);
        else Vibration.vibrate([0, 45, 90, 45]);
    } catch {
        // A phone that cannot vibrate still scans.
    }
}

export default haptic;
