import { useCallback, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { SettingsStore, settingsStore, resolveScheme, type Settings } from './settingsStore';
import type { SchemeName } from '../theme';

export function useSettings(store: SettingsStore = settingsStore): Settings {
    return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSetSetting(store: SettingsStore = settingsStore) {
    return useCallback(
        <K extends keyof Settings>(key: K, value: Settings[K]) => store.set(key, value),
        [store]
    );
}

/** The scheme the app should actually render, honouring `system`. */
export function useResolvedScheme(store: SettingsStore = settingsStore): SchemeName {
    const { theme } = useSettings(store);
    const systemScheme = useColorScheme();
    return resolveScheme(theme, systemScheme !== 'light');
}

export { resolveScheme };
