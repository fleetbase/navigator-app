import brandExtensions from '../generated/brand-extensions';
import { EXTENSIONS_SCHEMA_VERSION, type NavigatorExtensions } from './define';

let cached: NavigatorExtensions | null = null;

/**
 * The build's extensions (brand/navigator.extensions.ts, or the root template).
 * A file written for a version of the extensions API this app doesn't know is
 * ignored as a whole rather than half-applied.
 */
export function getBuildExtensions(): NavigatorExtensions {
    if (cached) return cached;
    const value = (brandExtensions ?? {}) as NavigatorExtensions;
    const version = value.schemaVersion ?? EXTENSIONS_SCHEMA_VERSION;
    if (version !== EXTENSIONS_SCHEMA_VERSION) {
        console.warn(`[extensions] navigator.extensions.ts has schemaVersion ${String(version)}; this app supports ${EXTENSIONS_SCHEMA_VERSION}. Ignoring it.`);
        cached = {};
    } else {
        cached = value;
    }
    return cached;
}
