import { RESULTS, PERMISSIONS } from 'react-native-permissions';
import {
    permissionIdsFor,
    toState,
    checkPermission,
    requestPermission,
    isSatisfied,
    PERMISSION_DESCRIPTORS,
} from '../permissions';

describe('permissionIdsFor', () => {
    it('asks for when-in-use before always on iOS', () => {
        // Requesting always first is refused without showing the escalation.
        const ids = permissionIdsFor('location', 'ios');
        expect(ids[0]).toBe(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        expect(ids[1]).toBe(PERMISSIONS.IOS.LOCATION_ALWAYS);
    });

    it('asks for foreground before background on Android', () => {
        const ids = permissionIdsFor('location', 'android');
        expect(ids[0]).toBe(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        expect(ids[1]).toBe(PERMISSIONS.ANDROID.ACCESS_BACKGROUND_LOCATION);
    });

    it('has no permissions-matrix entry for iOS notifications', () => {
        expect(permissionIdsFor('notifications', 'ios')).toEqual([]);
    });
});

describe('toState', () => {
    it('treats limited as granted — the driver did say yes', () => {
        expect(toState(RESULTS.LIMITED)).toBe('granted');
        expect(toState(RESULTS.GRANTED)).toBe('granted');
    });

    it('keeps denied and blocked apart, because only one can be asked again', () => {
        expect(toState(RESULTS.DENIED)).toBe('denied');
        expect(toState(RESULTS.BLOCKED)).toBe('blocked');
    });

    it('maps unavailable to unavailable', () => {
        expect(toState(RESULTS.UNAVAILABLE)).toBe('unavailable');
    });
});

describe('checkPermission', () => {
    it('reports on the base permission, not the escalation', async () => {
        const check = jest.fn(async (id: string) =>
            id === PERMISSIONS.IOS.LOCATION_WHEN_IN_USE ? RESULTS.GRANTED : RESULTS.DENIED
        );
        expect(await checkPermission('location', check as never, 'ios')).toBe('granted');
    });

    it('is unknown rather than throwing when the native call fails', async () => {
        const check = jest.fn().mockRejectedValue(new Error('no native module'));
        expect(await checkPermission('camera', check as never, 'ios')).toBe('unknown');
    });
});

describe('requestPermission', () => {
    it('escalates to always only after when-in-use is granted', async () => {
        const request = jest.fn().mockResolvedValue(RESULTS.GRANTED);
        const outcome = await requestPermission('location', request as never, 'ios');

        expect(request).toHaveBeenNthCalledWith(1, PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        expect(request).toHaveBeenNthCalledWith(2, PERMISSIONS.IOS.LOCATION_ALWAYS);
        expect(outcome).toEqual({ state: 'granted' });
    });

    it('never asks for always when when-in-use was refused', async () => {
        // The escalation would be denied silently and waste the one prompt.
        const request = jest.fn().mockResolvedValue(RESULTS.DENIED);
        const outcome = await requestPermission('location', request as never, 'ios');

        expect(request).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledWith(PERMISSIONS.IOS.LOCATION_WHEN_IN_USE);
        expect(outcome).toEqual({ state: 'denied' });
    });

    it('reports a partial grant when always is refused but when-in-use held', async () => {
        const request = jest.fn(async (id: string) =>
            id === PERMISSIONS.IOS.LOCATION_WHEN_IN_USE ? RESULTS.GRANTED : RESULTS.DENIED
        );
        expect(await requestPermission('location', request as never, 'ios')).toEqual({ state: 'granted', partial: true });
    });

    it('surfaces blocked, which no amount of asking will change', async () => {
        const request = jest.fn().mockResolvedValue(RESULTS.BLOCKED);
        expect(await requestPermission('camera', request as never, 'ios')).toEqual({ state: 'blocked' });
    });

    it('does not throw when the escalation itself fails', async () => {
        const request = jest
            .fn()
            .mockResolvedValueOnce(RESULTS.GRANTED)
            .mockRejectedValueOnce(new Error('boom'));
        expect(await requestPermission('location', request as never, 'ios')).toEqual({ state: 'granted', partial: true });
    });
});

describe('isSatisfied', () => {
    it('needs every essential permission, and ignores the optional one', () => {
        expect(isSatisfied({ location: 'granted', notifications: 'granted' })).toBe(true);
        expect(isSatisfied({ location: 'granted', notifications: 'granted', camera: 'denied' })).toBe(true);
    });

    it('is not satisfied while an essential one is outstanding', () => {
        expect(isSatisfied({ location: 'denied', notifications: 'granted' })).toBe(false);
        expect(isSatisfied({ location: 'granted' })).toBe(false);
    });

    it('accepts unavailable — a device that cannot do it is not a refusal', () => {
        expect(isSatisfied({ location: 'granted', notifications: 'unavailable' })).toBe(true);
    });

    it('describes the camera as optional, and the rest as essential', () => {
        const essential = PERMISSION_DESCRIPTORS.filter((d) => d.essential).map((d) => d.key);
        expect(essential).toEqual(['location', 'notifications']);
    });
});
