/**
 * Permission primer — R2's onboarding primer.
 *
 * The app asks for three things, and the *order* it asks in is not cosmetic:
 *
 *   **iOS will not grant "always" location unless "when in use" was granted
 *   first.** Asking for always up front returns denied without showing the
 *   escalation prompt at all — the request appears to fail for no reason. So
 *   `requestPermission('location')` asks for when-in-use, and only escalates to
 *   always once that succeeded.
 *
 * The point of a primer is that the OS prompt can only be shown **once**. A
 * driver who reflexively denies it has to be talked through Settings forever
 * after, so the app explains what each permission buys them *before* spending
 * that single chance.
 *
 * check/request are injected so the whole thing is testable without native.
 */
import { Platform } from 'react-native';
import {
    check as rnCheck,
    request as rnRequest,
    PERMISSIONS,
    RESULTS,
    openSettings as rnOpenSettings,
    type Permission,
    type PermissionStatus,
} from 'react-native-permissions';

export type PermissionKey = 'location' | 'notifications' | 'camera';

/**
 * `denied` can be asked again; `blocked` cannot — only Settings will change it.
 * Collapsing the two is the usual mistake, and it produces a button that looks
 * like it does nothing.
 */
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'blocked' | 'unavailable';

export interface PermissionDescriptor {
    key: PermissionKey;
    titleKey: string;
    bodyKey: string;
    /** True when work cannot proceed without it. */
    essential: boolean;
}

export const PERMISSION_DESCRIPTORS: PermissionDescriptor[] = [
    { key: 'location', titleKey: 'permissions.locationTitle', bodyKey: 'permissions.locationBody', essential: true },
    { key: 'notifications', titleKey: 'permissions.notificationsTitle', bodyKey: 'permissions.notificationsBody', essential: true },
    { key: 'camera', titleKey: 'permissions.cameraTitle', bodyKey: 'permissions.cameraBody', essential: false },
];

type Checker = (permission: Permission) => Promise<PermissionStatus>;

/** Platform permission ids. Undefined where the platform has no equivalent. */
export function permissionIdsFor(key: PermissionKey, platform: string = Platform.OS): Permission[] {
    if (platform === 'ios') {
        switch (key) {
            case 'location':
                // When-in-use first; always is an escalation of it, not an alternative.
                return [PERMISSIONS.IOS.LOCATION_WHEN_IN_USE, PERMISSIONS.IOS.LOCATION_ALWAYS];
            case 'camera':
                return [PERMISSIONS.IOS.CAMERA];
            case 'notifications':
                // Handled by the notifications API, not the permissions matrix.
                return [];
        }
    }
    switch (key) {
        case 'location':
            return [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION];
        case 'camera':
            return [PERMISSIONS.ANDROID.CAMERA];
        case 'notifications':
            return [PERMISSIONS.ANDROID.POST_NOTIFICATIONS];
    }
}

export function toState(status: PermissionStatus): PermissionState {
    switch (status) {
        case RESULTS.GRANTED:
        // `limited` is granted-with-conditions; the driver said yes.
        case RESULTS.LIMITED:
            return 'granted';
        case RESULTS.DENIED:
            return 'denied';
        case RESULTS.BLOCKED:
            return 'blocked';
        case RESULTS.UNAVAILABLE:
        default:
            return 'unavailable';
    }
}

/**
 * The state of a group. `location` covers two ids, and the *first* — when in
 * use — is what decides whether the app works at all; always is an upgrade.
 */
export async function checkPermission(
    key: PermissionKey,
    check: Checker = rnCheck,
    platform: string = Platform.OS
): Promise<PermissionState> {
    const ids = permissionIdsFor(key, platform);
    if (ids.length === 0) return 'unknown';

    try {
        return toState(await check(ids[0]));
    } catch {
        return 'unknown';
    }
}

export interface RequestOutcome {
    state: PermissionState;
    /** True when iOS granted when-in-use but refused the always escalation. */
    partial?: boolean;
}

export async function requestPermission(
    key: PermissionKey,
    request: Checker = rnRequest,
    platform: string = Platform.OS
): Promise<RequestOutcome> {
    const ids = permissionIdsFor(key, platform);
    if (ids.length === 0) return { state: 'unknown' };

    let state: PermissionState;
    try {
        state = toState(await request(ids[0]));
    } catch {
        return { state: 'unknown' };
    }

    // Only escalate once the base grant exists — asking for always first is
    // refused silently, which looks like the request simply failed.
    if (state === 'granted' && ids.length > 1) {
        try {
            const escalated = toState(await request(ids[1]));
            return escalated === 'granted' ? { state: 'granted' } : { state: 'granted', partial: true };
        } catch {
            return { state: 'granted', partial: true };
        }
    }

    return { state };
}

export const openSettings = rnOpenSettings;

/** Nothing essential outstanding — the primer can be dismissed for good. */
export function isSatisfied(states: Partial<Record<PermissionKey, PermissionState>>): boolean {
    return PERMISSION_DESCRIPTORS.filter((d) => d.essential).every((d) => {
        const state = states[d.key];
        return state === 'granted' || state === 'unavailable';
    });
}
