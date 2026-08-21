/**
 * Native modules with no JS fallback. Kept deliberately small — mock only what
 * a unit test cannot construct, so tests still exercise real code paths.
 */
jest.mock('react-native-config', () => ({}));

jest.mock('react-native-mmkv', () => {
    const store = new Map();
    const listeners = new Set();
    const instance = {
        set: (k, v) => { store.set(k, v); listeners.forEach((fn) => fn(k)); },
        getString: (k) => (typeof store.get(k) === 'string' ? store.get(k) : undefined),
        getNumber: (k) => (typeof store.get(k) === 'number' ? store.get(k) : undefined),
        getBoolean: (k) => (typeof store.get(k) === 'boolean' ? store.get(k) : undefined),
        contains: (k) => store.has(k),
        remove: (k) => { store.delete(k); listeners.forEach((fn) => fn(k)); },
        clearAll: () => store.clear(),
        getAllKeys: () => [...store.keys()],
        addOnValueChangedListener: (fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
    };
    return { createMMKV: () => instance, MMKV: function () { return instance; } };
});

jest.mock('react-native-device-info', () => ({ getVersion: () => '3.0.0', getBuildNumber: () => '1' }));

// Reanimated / worklets: the JS-side mock avoids pulling the native runtime in.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

/**
 * BootSplash is a native module with no JS fallback; V3App calls hide() on mount.
 */
jest.mock('react-native-bootsplash', () => ({
    hide: jest.fn(() => Promise.resolve()),
    show: jest.fn(() => Promise.resolve()),
    isVisible: jest.fn(() => Promise.resolve(false)),
}));

/**
 * react-native-permissions reaches for a TurboModule that does not exist under
 * Jest. The library ships an official mock for exactly this.
 */
jest.mock('react-native-permissions', () => require('react-native-permissions/mock'));
