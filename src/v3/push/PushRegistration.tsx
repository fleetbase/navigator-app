/**
 * Tells the server which phone this is, so pushes reach it.
 *
 * The phone's push token is sent every time the app opens with a driver signed
 * in, and again whenever the token or the driver changes. It used to be sent
 * only at the moment of signing in, so a driver who stayed signed in for months
 * (the normal case) was never registered again: a reinstall, a new token or a
 * new server left them without pushes and nothing said so.
 *
 * With the token goes what the device is (name, model, system, app version) and
 * whether this is a development build. Apple issues development builds tokens
 * that only its sandbox push service accepts, so the server has to know.
 *
 * Signing out tells the server too (`unregisterThisDevice`), so a phone handed
 * to someone else stops receiving the last driver's notifications.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as DeviceInfo from 'react-native-device-info';
import { useFleetbase } from '../api';

type Adapter = ReturnType<typeof useFleetbase>['adapter'];

let registered: { driverId: string; token: string } | null = null;

const safe = async <T,>(read: () => T | Promise<T>): Promise<T | undefined> => {
    try {
        return await read();
    } catch {
        return undefined;
    }
};

async function describeDevice(): Promise<Record<string, string | undefined>> {
    const info = DeviceInfo as unknown as Record<string, (() => unknown) | undefined>;
    const call = (name: string) => safe(() => info[name]?.() as string | Promise<string> | undefined);
    let locale: string | undefined;
    let timezone: string | undefined;
    try {
        const options = Intl.DateTimeFormat().resolvedOptions();
        locale = options.locale;
        timezone = options.timeZone;
    } catch {
        // Left out when the runtime cannot say.
    }
    return {
        name: await call('getDeviceName'),
        model: await call('getModel'),
        manufacturer: await call('getManufacturer'),
        os_version: [await call('getSystemName'), await call('getSystemVersion')].filter(Boolean).join(' ') || undefined,
        app_version: await call('getVersion'),
        app_build: await call('getBuildNumber'),
        app_identifier: await call('getBundleId'),
        // A build run from Xcode or Android Studio; its push token belongs to the development push service.
        environment: __DEV__ ? 'development' : 'production',
        locale,
        timezone,
    };
}

/** Called before signing out, while the driver's token still works. */
export async function unregisterThisDevice(adapter: Adapter): Promise<void> {
    const current = registered;
    registered = null;
    if (!current) return;
    try {
        await adapter.post(`drivers/${current.driverId}/unregister-device`, { token: current.token });
    } catch {
        // Signing out must not wait on, or fail because of, this.
    }
}

export function PushRegistration({ driverId, deviceToken }: { driverId?: string; deviceToken?: string | null }) {
    const { adapter } = useFleetbase();

    useEffect(() => {
        if (!driverId || !deviceToken || Platform.OS === 'web') return;
        let alive = true;
        void (async () => {
            const details = await describeDevice();
            if (!alive) return;
            try {
                await adapter.post(`drivers/${driverId}/register-device`, { token: deviceToken, platform: Platform.OS, ...details });
                registered = { driverId, token: deviceToken };
            } catch {
                // Tried again the next time the app opens or the token changes.
            }
        })();
        return () => {
            alive = false;
        };
    }, [adapter, driverId, deviceToken]);

    return null;
}

export default PushRegistration;
