import {
    buildUrl,
    buildWebFallback,
    fromGeoPoint,
    availableApps,
    navigateTo,
    NAVIGATION_OPTIONS,
} from '../handoff';

/** Singapore — transposed it lands in the Indian Ocean, which is the point. */
const SINGAPORE = { latitude: 1.3521, longitude: 103.8198, label: 'Fleetbase Market' };

describe('coordinate order', () => {
    it('puts latitude first for Apple, Google and Waze', () => {
        expect(buildUrl('apple', SINGAPORE)).toContain('1.3521,103.8198');
        expect(buildUrl('google', SINGAPORE)).toContain('1.3521,103.8198');
        expect(buildUrl('waze', SINGAPORE)).toContain('ll=1.3521,103.8198');
    });

    it('never emits the transposed pair', () => {
        for (const option of NAVIGATION_OPTIONS) {
            expect(buildUrl(option.id, SINGAPORE)).not.toContain('103.8198,1.3521');
        }
    });

    it('gives Uber latitude and longitude as separate keys', () => {
        const url = buildUrl('uber', SINGAPORE);
        expect(url).toContain('dropoff[latitude]=1.3521');
        expect(url).toContain('dropoff[longitude]=103.8198');
    });
});

describe('fromGeoPoint', () => {
    it('flips GeoJSON, which is [longitude, latitude]', () => {
        // The API stores [103.8198, 1.3521]; every nav URL wants the reverse.
        expect(fromGeoPoint({ coordinates: [103.8198, 1.3521] })).toEqual({
            latitude: 1.3521,
            longitude: 103.8198,
            label: undefined,
        });
    });

    it('treats null island as no destination', () => {
        expect(fromGeoPoint({ coordinates: [0, 0] })).toBeUndefined();
    });

    it('is undefined for a malformed point rather than NaN coordinates', () => {
        expect(fromGeoPoint(null)).toBeUndefined();
        expect(fromGeoPoint({ coordinates: [103.8] })).toBeUndefined();
        expect(fromGeoPoint({ coordinates: ['a', 'b'] as never })).toBeUndefined();
    });
});

describe('url details that decide whether it navigates or just drops a pin', () => {
    it('asks Waze to navigate, not to show a pin', () => {
        expect(buildUrl('waze', SINGAPORE)).toContain('navigate=yes');
    });

    it('asks Google for driving directions rather than transit', () => {
        expect(buildUrl('google', SINGAPORE)).toContain('directionsmode=driving');
    });

    it('asks Apple for driving directions', () => {
        expect(buildUrl('apple', SINGAPORE)).toContain('dirflg=d');
    });

    it('encodes a label so a comma or space cannot break the query', () => {
        const url = buildUrl('apple', { ...SINGAPORE, label: 'Market St, Unit 3' });
        expect(url).toContain('Market%20St%2C%20Unit%203');
    });

    it('rounds to six decimals rather than emitting float noise', () => {
        const url = buildUrl('apple', { latitude: 1.35211111111, longitude: 103.81981111111 });
        expect(url).toContain('1.352111,103.819811');
    });
});

describe('web fallbacks', () => {
    it('gives every app a browser destination', () => {
        for (const option of NAVIGATION_OPTIONS) {
            expect(buildWebFallback(option.id, SINGAPORE)).toMatch(/^https:\/\//);
        }
    });
});

describe('availableApps', () => {
    it('includes Apple Maps on iOS without probing for it', async () => {
        const canOpen = jest.fn().mockResolvedValue(false);
        expect(await availableApps(canOpen, 'ios')).toContain('apple');
        // Exact, not `stringContaining` — "comgooglemaps://" contains "maps://".
        expect(canOpen.mock.calls.flat()).not.toContain('maps://');
    });

    it('omits Apple Maps on Android, where it does not exist', async () => {
        expect(await availableApps(jest.fn().mockResolvedValue(false), 'android')).not.toContain('apple');
    });

    it('reports only the apps actually installed', async () => {
        const canOpen = jest.fn(async (url: string) => url.startsWith('waze'));
        expect(await availableApps(canOpen, 'ios')).toEqual(['apple', 'waze']);
    });

    it('treats a rejected probe as unavailable rather than throwing', async () => {
        // An undeclared scheme rejects instead of resolving false.
        const canOpen = jest.fn().mockRejectedValue(new Error('scheme not declared'));
        expect(await availableApps(canOpen, 'ios')).toEqual(['apple']);
    });

    it('can find nothing at all, which is a real state', async () => {
        expect(await availableApps(jest.fn().mockResolvedValue(false), 'android')).toEqual([]);
    });
});

describe('navigateTo', () => {
    it('opens the app when it is installed', async () => {
        const open = jest.fn().mockResolvedValue(undefined);
        const result = await navigateTo('waze', SINGAPORE, open, jest.fn().mockResolvedValue(true));
        expect(open).toHaveBeenCalledWith(expect.stringContaining('waze://'));
        expect(result).toEqual({ opened: true, usedFallback: false });
    });

    it('falls back to the browser when the app is missing', async () => {
        const open = jest.fn().mockResolvedValue(undefined);
        const result = await navigateTo('google', SINGAPORE, open, jest.fn().mockResolvedValue(false));
        expect(open).toHaveBeenCalledWith(expect.stringContaining('https://www.google.com/maps'));
        expect(result).toEqual({ opened: true, usedFallback: true });
    });

    it('does not probe for Apple Maps, which has no queryable scheme', async () => {
        const canOpen = jest.fn().mockResolvedValue(false);
        const open = jest.fn().mockResolvedValue(undefined);
        const result = await navigateTo('apple', SINGAPORE, open, canOpen);
        expect(result.usedFallback).toBe(false);
        expect(open).toHaveBeenCalledWith(expect.stringContaining('maps://'));
    });

    it('reports failure rather than throwing when nothing can open', async () => {
        const open = jest.fn().mockRejectedValue(new Error('no handler'));
        const result = await navigateTo('waze', SINGAPORE, open, jest.fn().mockResolvedValue(false));
        expect(result).toEqual({ opened: false, usedFallback: false });
    });
});
