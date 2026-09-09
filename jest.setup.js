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

/**
 * react-native-maps is native through and through. The route surface renders
 * markers and a polyline into it; the tests assert on what surrounds the map,
 * so a View that keeps its children is enough — and it keeps the markers'
 * testIDs reachable, so a test can still count the stops on the map.
 */
jest.mock('react-native-maps', () => {
    const React = require('react');
    const { View } = require('react-native');
    const MapView = React.forwardRef((props, ref) => {
        React.useImperativeHandle(ref, () => ({ fitToCoordinates: jest.fn(), animateToRegion: jest.fn() }));
        return React.createElement(View, { testID: props.testID ?? 'map-view' }, props.children);
    });
    const Marker = (props) => React.createElement(View, { testID: props.testID }, props.children);
    const Polyline = () => null;
    return { __esModule: true, default: MapView, Marker, Polyline, PROVIDER_GOOGLE: 'google', PROVIDER_DEFAULT: undefined };
});
