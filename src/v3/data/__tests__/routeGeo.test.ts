/**
 * The optimise preview must agree with the server's `ManifestController@optimize`
 * — same walk, same tie-breaking, same "fewer than three is left alone" rule —
 * because the driver confirms the preview and the server applies its own.
 */
import { haversineM, nearestFirst, previewOptimise, routeLengthM, checkArrival, coordsOfPoint, formatLatLng, ARRIVAL_RADIUS_M } from '../routeGeo';
import type { ManifestStopRecord } from '../manifestStore';

const at = (id: string, lat: number, lon: number, over: Partial<ManifestStopRecord> = {}): ManifestStopRecord => ({
    id,
    status: 'pending',
    sequence: 0,
    place: { name: id, location: { type: 'Point', coordinates: [lon, lat] } },
    ...over,
});

describe('haversineM', () => {
    it('measures Swanage to Corfe Castle at roughly the known 8 km', () => {
        const d = haversineM({ latitude: 50.6085, longitude: -1.9598 }, { latitude: 50.6402, longitude: -2.0574 });
        expect(d).toBeGreaterThan(7500);
        expect(d).toBeLessThan(8200);
    });

    it('is zero for the same point', () => {
        expect(haversineM({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 })).toBe(0);
    });
});

describe('coordsOfPoint', () => {
    it('reads GeoJSON as [longitude, latitude]', () => {
        expect(coordsOfPoint({ coordinates: [103.9, 1.3] })).toEqual({ latitude: 1.3, longitude: 103.9 });
    });

    it('treats the API placeholder [0, 0] as no position', () => {
        expect(coordsOfPoint({ coordinates: [0, 0] })).toBeUndefined();
        expect(coordsOfPoint(null)).toBeUndefined();
        expect(coordsOfPoint({ coordinates: ['x' as unknown as number, 1] })).toBeUndefined();
    });
});

describe('nearestFirst — mirrors the server', () => {
    // A line of stops east of the driver, listed in the wrong order.
    const driver = { latitude: 50.6, longitude: -2.1 };
    const far = at('far', 50.6, -1.9, { sequence: 1 });
    const near = at('near', 50.6, -2.08, { sequence: 2 });
    const mid = at('mid', 50.6, -2.0, { sequence: 3 });

    it('walks nearest-first from the driver and renumbers densely', () => {
        const out = nearestFirst([far, near, mid], driver);
        expect(out.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
        expect(out.map((s) => s.sequence)).toEqual([1, 2, 3]);
    });

    it('keeps completed and skipped stops at the front, untouched', () => {
        const done = at('done', 50.6, -2.2, { status: 'completed', sequence: 1 });
        const skipped = at('skipped', 50.6, -2.15, { status: 'skipped', sequence: 2 });
        const out = nearestFirst([done, skipped, far, near, mid], driver);
        expect(out.map((s) => s.id)).toEqual(['done', 'skipped', 'near', 'mid', 'far']);
        expect(out.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
    });

    it('leaves fewer than three pending stops alone, as the server does', () => {
        const input = [far, near];
        expect(nearestFirst(input, driver)).toBe(input);
    });

    it('starts from the first pending stop when the driver has no fix', () => {
        // From `far` the nearest is `mid`, then `near`.
        const out = nearestFirst([far, near, mid]);
        expect(out.map((s) => s.id)).toEqual(['far', 'mid', 'near']);
    });

    it('appends stops without coordinates rather than dropping them', () => {
        const blind = at('blind', 0, 0, { sequence: 4, place: { name: 'blind' } });
        const out = nearestFirst([far, near, mid, blind], driver);
        expect(out).toHaveLength(4);
        expect(out.map((s) => s.id)).toContain('blind');
    });
});

describe('previewOptimise', () => {
    const driver = { latitude: 50.6, longitude: -2.1 };
    const far = at('far', 50.6, -1.9, { sequence: 1 });
    const near = at('near', 50.6, -2.08, { sequence: 2 });
    const mid = at('mid', 50.6, -2.0, { sequence: 3 });

    it('reports the moved stops and a shorter route as a negative delta', () => {
        const p = previewOptimise({ id: 'm', stops: [far, near, mid], total_distance_m: 30000, total_duration_s: 3600 }, driver);
        expect(p.unchanged).toBe(false);
        expect([...p.moved].sort()).toEqual(['far', 'mid', 'near']);
        expect(p.deltaM!).toBeLessThan(0);
        // Time is estimated at the plan's average speed, and carries the same sign.
        expect(p.deltaS!).toBeLessThan(0);
    });

    it('is unchanged when the stops are already nearest-first', () => {
        const p = previewOptimise({ id: 'm', stops: [near, mid, far].map((s, i) => ({ ...s, sequence: i + 1 })) }, driver);
        expect(p.unchanged).toBe(true);
        expect(p.moved.size).toBe(0);
        expect(p.deltaM).toBe(0);
    });

    it('does not invent a time estimate without plan totals', () => {
        const p = previewOptimise({ id: 'm', stops: [far, near, mid] }, driver);
        expect(p.deltaM).toBeDefined();
        expect(p.deltaS).toBeUndefined();
    });

    it('measures only legs between stops that have coordinates', () => {
        expect(routeLengthM([at('a', 1, 1), { id: 'b', status: 'pending', place: {} }, at('c', 1, 1.01)])).toBeGreaterThan(0);
        expect(routeLengthM([{ id: 'b', status: 'pending', place: {} }])).toBeUndefined();
    });
});

describe('checkArrival — R2 C6', () => {
    const stop = at('s', 50.640152, -2.057361);

    it('is in range inside the radius', () => {
        const r = checkArrival(stop, { latitude: 50.6405, longitude: -2.0575 });
        expect(r.kind).toBe('in-range');
    });

    it('is out of range beyond it, with the distance to show', () => {
        const r = checkArrival(stop, { latitude: 50.643118, longitude: -2.061902 });
        expect(r.kind).toBe('out-of-range');
        if (r.kind === 'out-of-range') {
            expect(r.distanceM).toBeGreaterThan(ARRIVAL_RADIUS_M);
            expect(Math.round(r.distanceM)).toBeGreaterThan(400);
        }
    });

    it('says so when there is no fix, and when the stop has no coordinate', () => {
        expect(checkArrival(stop, null).kind).toBe('no-position');
        expect(checkArrival({ id: 'x', place: {} }, { latitude: 1, longitude: 1 }).kind).toBe('no-stop-location');
    });
});

describe('formatLatLng', () => {
    it('renders six places, the precision on a physical label', () => {
        expect(formatLatLng({ latitude: 50.640152, longitude: -2.057361 })).toBe('50.640152, -2.057361');
        expect(formatLatLng(null)).toBeUndefined();
    });
});
