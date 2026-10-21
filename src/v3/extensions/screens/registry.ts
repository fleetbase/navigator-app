import { SCREEN_IDS, isScreenId } from './screen-ids';
import type { ScreenId } from './screen-ids';
import { createLoadable } from './loadable';
import type {
    LoadableComponent,
    ResolvedScreen,
    ScreenEntry,
    ScreenOverrides,
    ScreenPlatform,
    ScreenRegistryDefinition,
    ScreenVariantSelection,
} from './types';

export type ScreenRegistryOptions = {
    /** Default implementation for every screen id (see default-screens.ts). */
    defaults: ScreenRegistryDefinition;
    platform?: string;
    /** Throw on invalid overrides instead of warning and ignoring them (defaults to __DEV__). */
    strict?: boolean;
    warn?: (message: string) => void;
};

export type ScreenRegistry = {
    resolve: (id: ScreenId, variant?: string | null) => ResolvedScreen;
    preload: (ids: ScreenId[], variants?: ScreenVariantSelection) => Promise<void>;
    hasOverride: (id: ScreenId) => boolean;
};

function isValidEntry(entry: unknown): entry is ScreenEntry<any> {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as ScreenEntry<any>;
    if (typeof candidate.load !== 'function') return false;
    if (candidate.variants !== undefined) {
        if (!candidate.variants || typeof candidate.variants !== 'object') return false;
        if (Object.values(candidate.variants).some((loader) => typeof loader !== 'function')) return false;
    }
    if (candidate.platforms !== undefined && !Array.isArray(candidate.platforms)) return false;
    return true;
}

function appliesToPlatform(entry: ScreenEntry<any>, platform: string) {
    return !entry.platforms || entry.platforms.includes(platform as ScreenPlatform);
}

/**
 * Builds the screen registry from the default screens plus compiled-in overrides.
 * Invalid overrides throw in strict mode (development) and are otherwise ignored,
 * so a broken customization never replaces a working default screen.
 */
export function createScreenRegistry(overrides: ScreenOverrides, options: ScreenRegistryOptions): ScreenRegistry {
    const defaults = options.defaults;
    const platform = options.platform ?? 'ios';
    const strict = options.strict ?? (typeof __DEV__ !== 'undefined' ? __DEV__ : false);
    const warn = options.warn ?? ((message: string) => console.warn(message));

    const reject = (message: string) => {
        if (strict) throw new Error(message);
        warn(message);
    };

    const accepted: ScreenOverrides = {};
    for (const [id, entry] of Object.entries(overrides ?? {})) {
        if (!isScreenId(id)) {
            reject(`[screen-registry] Unknown screen id "${id}". Known ids: ${SCREEN_IDS.join(', ')}`);
            continue;
        }
        if (!isValidEntry(entry)) {
            reject(`[screen-registry] Invalid override for "${id}": expected { load: () => import(...) }.`);
            continue;
        }
        if (!appliesToPlatform(entry, platform)) continue;
        (accepted as any)[id] = entry;
    }

    const cache = new Map<string, LoadableComponent>();
    const loadable = (key: string, loader: () => Promise<any>) => {
        let component = cache.get(key);
        if (!component) {
            component = createLoadable(loader, key);
            cache.set(key, component);
        }
        return component;
    };

    // An unknown variant falls back quietly at runtime, but says so once — a
    // misspelt key in branding would otherwise look like the variant is broken.
    const warnedVariants = new Set<string>();

    const resolve = (id: ScreenId, variant?: string | null): ResolvedScreen => {
        const defaultEntry = defaults[id];
        if (!defaultEntry) {
            throw new Error(`[screen-registry] No default screen registered for "${id}".`);
        }
        const Default = loadable(`${id}:default`, defaultEntry.load);
        const override = accepted[id] as ScreenEntry<any> | undefined;

        if (variant) {
            // An override keeps the default's variants unless it declares its own with the same key.
            const loader = override?.variants?.[variant] ?? defaultEntry.variants?.[variant];
            if (loader) {
                return { Component: loadable(`${id}:variant:${variant}`, loader), Default, source: 'variant' };
            }
            const key = `${id}:${variant}`;
            if (!warnedVariants.has(key)) {
                warnedVariants.add(key);
                warn(`[screen-registry] Unknown variant "${variant}" for "${id}"; using the ${override ? 'override' : 'default'}.`);
            }
        }
        if (override) {
            return { Component: loadable(`${id}:override`, override.load), Default, source: 'override' };
        }
        return { Component: Default, Default, source: 'default' };
    };

    const preload = async (ids: ScreenId[], variants: ScreenVariantSelection = {}) => {
        await Promise.all(
            ids.map((id) => {
                const { Component, Default } = resolve(id, variants[id]);
                // The default too: it is what renders if the override fails.
                return Promise.all([Component.preload(), Default.preload()]).catch(() => undefined);
            })
        );
    };

    return {
        resolve,
        preload,
        hasOverride: (id) => Boolean(accepted[id]),
    };
}
