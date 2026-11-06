/**
 * react-native-background-geolocation, on `navigator.geolocation`.
 *
 * It keeps the behaviour the app relies on: fixes in the plugin's shape, a
 * distance filter, and posting each fix to the configured URL so dispatch sees the
 * driver. What a browser can't do is run while the tab is closed or suspended.
 */
let config = {};
let watchId = null;
let lastSent = null;
const locationListeners = new Set();
const motionListeners = new Set();

const metresBetween = (a, b) => {
    const rad = (degrees) => (degrees * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLng = rad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

function toLocation(position) {
    const { latitude, longitude, altitude, heading, speed, accuracy } = position.coords;
    return {
        timestamp: new Date(position.timestamp).toISOString(),
        is_moving: (speed ?? 0) > 0.5,
        odometer: 0,
        coords: { latitude, longitude, altitude: altitude ?? 0, heading: heading ?? -1, speed: speed ?? -1, accuracy },
        activity: { type: 'unknown', confidence: 0 },
        battery: { level: -1, is_charging: false },
    };
}

function post(location) {
    if (!config.url) return;
    const { latitude, longitude, heading, speed, altitude } = location.coords;
    fetch(config.url, {
        method: 'POST',
        headers: { Authorization: config.headers?.Authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, heading, speed, altitude, timestamp: location.timestamp, activity: location.activity.type, is_moving: location.is_moving, battery: location.battery }),
    }).catch((error) => console.warn('[geolocation] Could not send the location:', error));
}

function handleFix(position) {
    const location = toLocation(position);
    locationListeners.forEach(({ success }) => success?.(location));
    if (lastSent && metresBetween(lastSent.coords, location.coords) < (config.distanceFilter ?? 10)) return;
    lastSent = location;
    post(location);
}

const handleError = (error) => locationListeners.forEach(({ failure }) => failure?.(error.code));

const hasGeolocation = () => 'geolocation' in navigator;

const state = () => ({ ...config, enabled: watchId !== null });

function finish(callback, value) {
    callback?.(value);
    return Promise.resolve(value);
}

const BackgroundGeolocation = {
    DESIRED_ACCURACY_NAVIGATION: -2,
    DESIRED_ACCURACY_HIGH: -1,
    DESIRED_ACCURACY_MEDIUM: 10,
    DESIRED_ACCURACY_LOW: 100,
    DESIRED_ACCURACY_VERY_LOW: 1000,
    DESIRED_ACCURACY_LOWEST: 3000,
    LOG_LEVEL_OFF: 0,

    ready(options = {}, callback) {
        config = { ...config, ...options };
        return finish(callback, state());
    },
    setConfig(options = {}, callback) {
        config = { ...config, ...options };
        return finish(callback, state());
    },
    getState: (callback) => finish(callback, state()),

    start(callback) {
        if (watchId === null && hasGeolocation()) {
            watchId = navigator.geolocation.watchPosition(handleFix, handleError, { enableHighAccuracy: true, maximumAge: 5000 });
        }
        return finish(callback, state());
    },
    stop(callback) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        return finish(callback, state());
    },

    getCurrentPosition: () =>
        new Promise((resolve, reject) => {
            if (!hasGeolocation()) {
                reject(new Error('Geolocation is unavailable'));
                return;
            }
            navigator.geolocation.getCurrentPosition((position) => resolve(toLocation(position)), reject, { enableHighAccuracy: true, timeout: 20000 });
        }),

    onLocation(success, failure) {
        const entry = { success, failure };
        locationListeners.add(entry);
        return { remove: () => locationListeners.delete(entry) };
    },
    onMotionChange(listener) {
        motionListeners.add(listener);
        return { remove: () => motionListeners.delete(listener) };
    },
    onActivityChange: () => ({ remove() {} }),
    onProviderChange: () => ({ remove() {} }),
    onHttp: () => ({ remove() {} }),
    removeListeners: async () => {
        locationListeners.clear();
        motionListeners.clear();
    },
};

export default BackgroundGeolocation;
