/**
 * v3 cutover flag.
 *
 * `main` must stay shippable while v3 is built, so the whole presentation layer
 * is selected at the root. The two trees never coexist inside one
 * TamaguiProvider: v2 components read tokens like `$red-600` and
 * `$borderColorWithShadow` that the Waypoint config deliberately does not
 * define, and v3 components read `$surfaceRaised` / `$onPrimary` / status
 * families that v2 does not define. Mixing them silently resolves to undefined.
 *
 * Set NAVIGATOR_V3=true in .env to build the v3 shell.
 */
// Deliberately from utils/tamagui rather than utils/config: the latter
// re-exports from utils/index.js, which imports the **v2 tamagui.config** and
// would pull a second Tamagui config (and the whole v2 util graph) into the v3
// tree. utils/tamagui only reads react-native-config.
import { config } from '../utils/tamagui';

/** Local so this module keeps its single, safe dependency. */
function toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    return false;
}

export function isV3Enabled(): boolean {
    return toBoolean(config('NAVIGATOR_V3', false));
}

export const V3_FLAG_KEY = 'NAVIGATOR_V3';
