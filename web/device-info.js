/** react-native-device-info, from what a browser can say about itself. */
const UNIQUE_ID_KEY = 'nv.device.id';

let memoryId;

export async function getUniqueId() {
    try {
        let id = localStorage.getItem(UNIQUE_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(UNIQUE_ID_KEY, id);
        }
        return id;
    } catch {
        // Storage can be unavailable (private browsing); keep it stable for this page load.
        memoryId = memoryId ?? crypto.randomUUID();
        return memoryId;
    }
}

export const getVersion = () => __APP_VERSION__;
export const getBuildNumber = () => 'web';
export const getReadableVersion = () => `${__APP_VERSION__}.web`;
export const getApplicationName = () => document.title;
export const getBundleId = () => window.location.hostname;
export const getSystemName = () => navigator.userAgentData?.platform ?? navigator.platform ?? 'Web';
export const getSystemVersion = () => '';
export const getBrand = () => 'Browser';
export const getModel = () => navigator.userAgent;
export const getDeviceId = () => 'web';
export const isTablet = () => false;
export const isEmulator = async () => false;
export const hasNotch = () => false;

export default {
    getUniqueId,
    getVersion,
    getBuildNumber,
    getReadableVersion,
    getApplicationName,
    getBundleId,
    getSystemName,
    getSystemVersion,
    getBrand,
    getModel,
    getDeviceId,
    isTablet,
    isEmulator,
    hasNotch,
};
