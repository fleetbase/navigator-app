/**
 * Driver preferences.
 *
 * Persisted locally rather than on the driver record: these are device
 * concerns (which map app is installed, whether this handset shows offers)
 * and several must be readable before a session exists.
 *
 * Shape follows R2's H1 frame.
 */
import { readJSON, writeJSON } from '../api/storage';
import type { SchemeName } from '../theme';
import { getBuildBranding } from '../branding/build-branding';

/** `system` follows the OS; the rest pin a scheme. */
export type ThemePreference = 'system' | SchemeName;
export type UnitPreference = 'metric' | 'imperial';
export type NavigationApp = 'apple' | 'google' | 'waze' | 'uber';

export interface Settings {
    theme: ThemePreference;
    units: UnitPreference;
    navigationApp: NavigationApp;
    /** `'system'` follows the device; otherwise a tag the i18n layer knows. */
    language: string;
    notifyNewWork: boolean;
    notifyDispatchMessages: boolean;
    /** R2: "Interrupts even in Do Not Disturb". */
    notifyNearbyOffers: boolean;
}

const appearance = getBuildBranding().branding.appearance;

export const DEFAULT_SETTINGS: Settings = {
    // The build's default (branding `appearance.defaultScheme`); `system` unless a brand says otherwise.
    theme: appearance.defaultScheme,
    units: 'metric',
    navigationApp: 'apple',
    language: 'system',
    notifyNewWork: true,
    notifyDispatchMessages: true,
    notifyNearbyOffers: false,
};

const KEY = 'settings';

export class SettingsStore {
    private state: Settings;
    private listeners = new Set<() => void>();

    constructor(initial?: Partial<Settings>) {
        this.state = { ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(KEY, {}), ...initial };
    }

    subscribe = (fn: () => void): (() => void) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };

    /** Stable reference until something actually changes. */
    getState = (): Settings => this.state;

    set<K extends keyof Settings>(key: K, value: Settings[K]): void {
        if (this.state[key] === value) return;
        this.state = { ...this.state, [key]: value };
        writeJSON(KEY, this.state);
        for (const fn of this.listeners) fn();
    }

    reset(): void {
        this.state = { ...DEFAULT_SETTINGS };
        writeJSON(KEY, this.state);
        for (const fn of this.listeners) fn();
    }
}

export const settingsStore = new SettingsStore();

/**
 * Resolve the preference to an actual scheme.
 * `system` maps to dark/light only — night and sunlight are deliberate
 * driver choices, never inferred.
 */
export function resolveScheme(pref: ThemePreference, systemIsDark: boolean, brand = appearance): SchemeName {
    // A brand that fixes the scheme, or doesn't offer the one stored, wins over the preference.
    const effective = !brand.allowUserToggle || !isOffered(pref, brand.schemes) ? brand.defaultScheme : pref;
    if (effective === 'system') return systemIsDark ? 'dark' : 'light';
    return effective;
}

/** Whether a theme preference is one this build offers (`system` needs both dark and light). */
export function isOffered(pref: ThemePreference, schemes: SchemeName[] = appearance.schemes): boolean {
    return pref === 'system' ? schemes.includes('dark') && schemes.includes('light') : schemes.includes(pref);
}
