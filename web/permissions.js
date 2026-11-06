/**
 * react-native-permissions, on the browser's permission model.
 *
 * Native's states map across directly: "prompt" is `denied` (it can still be
 * asked) and a browser's "denied" is `blocked` (only the site settings can change it).
 */
export const RESULTS = {
    UNAVAILABLE: 'unavailable',
    BLOCKED: 'blocked',
    DENIED: 'denied',
    GRANTED: 'granted',
    LIMITED: 'limited',
};

const ids = (prefix, names) => Object.fromEntries(names.map((name) => [name, `${prefix}.${name}`]));

export const PERMISSIONS = {
    IOS: ids('ios.permission', ['CAMERA', 'LOCATION_ALWAYS', 'LOCATION_WHEN_IN_USE', 'MICROPHONE', 'PHOTO_LIBRARY']),
    ANDROID: ids('android.permission', ['ACCESS_BACKGROUND_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA', 'POST_NOTIFICATIONS', 'READ_MEDIA_IMAGES', 'RECORD_AUDIO']),
    WINDOWS: {},
};

const BROWSER_STATES = { granted: RESULTS.GRANTED, denied: RESULTS.BLOCKED, default: RESULTS.DENIED, prompt: RESULTS.DENIED };

const kindOf = (permission) => {
    const name = String(permission);
    if (name.includes('LOCATION')) return 'geolocation';
    if (name.includes('CAMERA')) return 'camera';
    if (name.includes('POST_NOTIFICATIONS')) return 'notifications';
    return null;
};

async function queryState(name) {
    try {
        const status = await navigator.permissions.query({ name });
        return BROWSER_STATES[status.state] ?? RESULTS.DENIED;
    } catch {
        // Not every browser can report every permission; it can still be asked for.
        return RESULTS.DENIED;
    }
}

const isAvailable = (kind) => {
    if (kind === 'geolocation') return 'geolocation' in navigator;
    if (kind === 'camera') return Boolean(navigator.mediaDevices?.getUserMedia);
    if (kind === 'notifications') return 'Notification' in window;
    return false;
};

export async function check(permission) {
    const kind = kindOf(permission);
    if (!isAvailable(kind)) return RESULTS.UNAVAILABLE;
    if (kind === 'notifications') return BROWSER_STATES[Notification.permission] ?? RESULTS.DENIED;
    return queryState(kind);
}

const positionRequest = () =>
    new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            () => resolve(RESULTS.GRANTED),
            (error) => resolve(error.code === error.PERMISSION_DENIED ? RESULTS.BLOCKED : RESULTS.GRANTED)
        );
    });

async function cameraRequest() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop());
        return RESULTS.GRANTED;
    } catch (error) {
        return error?.name === 'NotFoundError' ? RESULTS.UNAVAILABLE : RESULTS.BLOCKED;
    }
}

export async function request(permission) {
    const kind = kindOf(permission);
    if (!isAvailable(kind)) return RESULTS.UNAVAILABLE;
    if (kind === 'geolocation') return positionRequest();
    if (kind === 'camera') return cameraRequest();
    return BROWSER_STATES[await Notification.requestPermission()] ?? RESULTS.DENIED;
}

export const checkMultiple = async (permissions) => Object.fromEntries(await Promise.all(permissions.map(async (p) => [p, await check(p)])));
export const requestMultiple = async (permissions) => {
    const statuses = {};
    for (const permission of permissions) statuses[permission] = await request(permission);
    return statuses;
};

export const checkNotifications = async () => ({ status: await check(PERMISSIONS.ANDROID.POST_NOTIFICATIONS), settings: {} });
export const requestNotifications = async () => ({ status: await request(PERMISSIONS.ANDROID.POST_NOTIFICATIONS), settings: {} });

/** A page can't open the browser's settings; the site's permissions are behind the address bar. */
export const openSettings = async () => {};
export const openPhotoPicker = async () => {};

export default { PERMISSIONS, RESULTS, check, request, checkMultiple, requestMultiple, checkNotifications, requestNotifications, openSettings, openPhotoPicker };
