/**
 * Animation drivers for the Waypoint config.
 *
 * The v2 config inherited these implicitly by spreading @tamagui/config/v3.
 * v3 builds its own, so they have to be declared — without them any
 * `animation="quick"` prop silently does nothing.
 *
 * Durations come straight from the design's motion table, which caps everything
 * at 250ms: nothing may delay the driver's next tap.
 */
import { createAnimations } from '@tamagui/animations-react-native';
import { motion } from './tokens';

export const animations = createAnimations({
    /** Press feedback — 90ms linear, scale .97. */
    quick: { type: 'timing', duration: motion.press.duration },
    /** List reorder — 180ms ease-out. */
    reorder: { type: 'timing', duration: motion.listReorder.duration },
    /** Sync tick — 200ms ease-out. */
    tick: { type: 'timing', duration: motion.syncTick.duration },
    /** Sheet present/dismiss — 220ms spring. */
    sheet: { type: 'spring', damping: 22, mass: 1, stiffness: 220 },
    /** Status change confirmation — 240ms spring, slightly softer. */
    confirm: { type: 'spring', damping: 20, mass: 1, stiffness: 180 },
});

export default animations;
