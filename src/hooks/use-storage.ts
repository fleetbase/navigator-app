import { useCallback, useRef, useSyncExternalStore } from 'react';
import { createMMKV, type MMKV } from 'react-native-mmkv';

type StorageValue = string | number | boolean | object | null | undefined;
type StorageSetter<T> = (value: T | ((current: T | undefined) => T | undefined) | undefined) => void;

const nativeStorage = createMMKV();
const parsedValueCache = new Map<string, { rawValue: string; value: StorageValue }>();

function deserializeStoredString(key: string, value: string): StorageValue {
    const cached = parsedValueCache.get(key);
    if (cached?.rawValue === value) {
        return cached.value;
    }

    try {
        const parsed = JSON.parse(value);
        const normalizedValue = typeof parsed === 'object' || Array.isArray(parsed) ? parsed : value;
        parsedValueCache.set(key, { rawValue: value, value: normalizedValue });
        return normalizedValue;
    } catch {
        parsedValueCache.set(key, { rawValue: value, value });
        return value;
    }
}

function getStoredValue<T = StorageValue>(key: string, instance: MMKV = nativeStorage): T | undefined {
    if (!instance.contains(key)) {
        return undefined;
    }

    const stringValue = instance.getString(key);
    if (stringValue !== undefined) {
        return deserializeStoredString(key, stringValue) as T;
    }

    const numberValue = instance.getNumber(key);
    if (numberValue !== undefined) {
        return numberValue as T;
    }

    return instance.getBoolean(key) as T | undefined;
}

function setStoredValue(key: string, value: StorageValue | ArrayBuffer, instance: MMKV = nativeStorage): void {
    if (value === undefined) {
        instance.remove(key);
        parsedValueCache.delete(key);
        return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof ArrayBuffer) {
        instance.set(key, value);
        parsedValueCache.delete(key);
        return;
    }

    instance.set(key, JSON.stringify(value));
    parsedValueCache.delete(key);
}

function createStorageCompatibility(instance: MMKV) {
    return Object.assign(instance, {
        setString: (key: string, value: string) => instance.set(key, value),
        getInt: (key: string) => instance.getNumber(key),
        setInt: (key: string, value: number) => instance.set(key, value),
        getBool: (key: string) => instance.getBoolean(key),
        setBool: (key: string, value: boolean) => instance.set(key, value),
        getArray: (key: string) => {
            const value = getStoredValue(key, instance);
            return Array.isArray(value) ? value : undefined;
        },
        setArray: (key: string, value: unknown[]) => setStoredValue(key, value, instance),
        getMap: (key: string) => getStoredValue(key, instance),
        setMap: (key: string, value: StorageValue) => setStoredValue(key, value, instance),
        removeItem: (key: string) => instance.remove(key),
        clearStore: () => instance.clearAll(),
    });
}

// Initialize MMKV storage once, ensuring it is a singleton.
export const storage = createStorageCompatibility(nativeStorage);

// Preserve the legacy tuple contract while using the maintained native module.
function useStorage<T = StorageValue>(key: string, defaultValue?: T): [T | undefined, StorageSetter<T>] {
    const defaultValueRef = useRef(defaultValue);
    const keyRef = useRef(key);

    if (keyRef.current !== key) {
        keyRef.current = key;
        defaultValueRef.current = defaultValue;
    }

    const value = useSyncExternalStore(
        useCallback(
            (onStoreChange) => {
                const listener = storage.addOnValueChangedListener((changedKey) => {
                    if (changedKey === key) {
                        onStoreChange();
                    }
                });

                return () => listener.remove();
            },
            [key]
        ),
        useCallback(() => getStoredValue<T>(key), [key]),
        useCallback(() => getStoredValue<T>(key), [key])
    );

    const setValue = useCallback<StorageSetter<T>>(
        (nextValue) => {
            const valueToStore = typeof nextValue === 'function' ? nextValue(getStoredValue<T>(key) ?? defaultValueRef.current) : nextValue;
            setStoredValue(key, valueToStore as StorageValue);
        },
        [key]
    );

    return [value === undefined ? defaultValueRef.current : value, setValue];
}

function useMMKVStorage<T = StorageValue>(key: string, _storage = storage, defaultValue?: T): [T | undefined, StorageSetter<T>] {
    return useStorage<T>(key, defaultValue);
}

// Utility functions for direct access.
const getString = (key: string) => storage.getString(key);
const setString = (key: string, value: string) => storage.setString(key, value);
const getInt = (key: string) => storage.getInt(key);
const setInt = (key: string, value: number) => storage.setInt(key, value);
const getBool = (key: string) => storage.getBool(key);
const setBool = (key: string, value: boolean) => storage.setBool(key, value);
const getArray = (key: string) => storage.getArray(key);
const setArray = (key: string, value: any[]) => storage.setArray(key, value);

// Custom methods for setting, getting, removing, and clearing maps
const set = (key: string, value: any) => storage.setMap(key, value);
const get = (key: string) => storage.getMap(key);
const getMap = (key: string) => storage.getMap(key);
const setMap = (key: string, value: any) => storage.setMap(key, value);
const remove = (key: string) => storage.removeItem(key);
const clear = () => storage.clearStore();

// Export the hook and individual utility functions
export { useStorage, useMMKVStorage, getString, setString, getInt, setInt, getBool, setBool, getArray, setArray, set, get, getMap, setMap, remove, clear };

export default useStorage;
