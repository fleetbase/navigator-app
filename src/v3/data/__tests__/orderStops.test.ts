/**
 * The three order shapes, and how the destination is resolved in each.
 *
 * Mirrors v2's rule deliberately (`src/screens/OrderScreen.tsx`): build
 * `[pickup, ...waypoints, dropoff]`, find the stop whose id matches
 * `payload.current_waypoint`, fall back to the first. Drivers already know this
 * behaviour and the server writes `current_waypoint` when `set-destination` is
 * called, so it is the authoritative answer rather than an inference.
 */
import { orderStops, currentDestination, stopLabel } from '../orderStops';

const pickup = { id: 'place_pickup', name: '16 Simon Walk' };
const dropoff = { id: 'place_dropoff', name: '23 Hougang Avenue 8' };
const wp1 = { id: 'place_wp1', name: '81 Beach Road' };
const wp2 = { id: 'place_wp2', name: '5 Changi Business Park' };

describe('orderStops — pickup and dropoff', () => {
    it('orders collect then deliver', () => {
        expect(orderStops({ pickup, dropoff }).map((s) => s.name)).toEqual(['16 Simon Walk', '23 Hougang Avenue 8']);
    });

    it('types each stop, so the picker can say which is which', () => {
        expect(orderStops({ pickup, dropoff }).map((s) => s.type)).toEqual(['pickup', 'dropoff']);
    });
});

describe('orderStops — pickup, waypoints and dropoff', () => {
    it('puts the waypoints between the two ends', () => {
        const stops = orderStops({ pickup, waypoints: [wp1, wp2], dropoff });
        expect(stops.map((s) => s.name)).toEqual(['16 Simon Walk', '81 Beach Road', '5 Changi Business Park', '23 Hougang Avenue 8']);
        expect(stops.map((s) => s.type)).toEqual(['pickup', 'waypoint', 'waypoint', 'dropoff']);
    });
});

describe('orderStops — waypoints only', () => {
    it('works with no ends to bracket them', () => {
        const stops = orderStops({ waypoints: [wp1, wp2] });
        expect(stops.map((s) => s.name)).toEqual(['81 Beach Road', '5 Changi Business Park']);
        expect(stops.every((s) => s.type === 'waypoint')).toBe(true);
    });

    it('is empty for a payload with no stops at all', () => {
        expect(orderStops({})).toEqual([]);
        expect(orderStops(null)).toEqual([]);
    });
});

describe('currentDestination', () => {
    it('follows current_waypoint on a simple order', () => {
        // A driver who has collected moves it on to the drop-off themselves.
        expect(currentDestination({ pickup, dropoff, current_waypoint: 'place_dropoff' })?.name).toBe('23 Hougang Avenue 8');
        expect(currentDestination({ pickup, dropoff, current_waypoint: 'place_pickup' })?.name).toBe('16 Simon Walk');
    });

    it('follows current_waypoint into the middle of a waypoint order', () => {
        const payload = { pickup, waypoints: [wp1, wp2], dropoff, current_waypoint: 'place_wp2' };
        expect(currentDestination(payload)?.name).toBe('5 Changi Business Park');
    });

    it('follows current_waypoint on a waypoints-only order', () => {
        expect(currentDestination({ waypoints: [wp1, wp2], current_waypoint: 'place_wp2' })?.name).toBe('5 Changi Business Park');
    });

    it('starts at the first stop when nothing has been set yet', () => {
        // A freshly created order has not been moved on; it starts where it starts.
        expect(currentDestination({ pickup, dropoff })?.name).toBe('16 Simon Walk');
        expect(currentDestination({ waypoints: [wp1, wp2] })?.name).toBe('81 Beach Road');
    });

    it('falls back to the first stop when current_waypoint names something absent', () => {
        // Better a real stop on this order than nothing at all.
        expect(currentDestination({ pickup, dropoff, current_waypoint: 'place_elsewhere' })?.name).toBe('16 Simon Walk');
    });

    it('is undefined only when the order has no stops', () => {
        expect(currentDestination({})).toBeUndefined();
    });

    it('never picks the drop-off just because it is the drop-off', () => {
        /*
         * The defect this replaces: the screen showed `payload.dropoff` under
         * "Current destination", so a driver on their way to collect was told
         * to go to the delivery address.
         */
        expect(currentDestination({ pickup, dropoff })?.type).toBe('pickup');
    });
});

describe('stopLabel', () => {
    it('prefers the name, falls back to the address', () => {
        expect(stopLabel({ type: 'pickup', name: 'Depot', address: '1 Road' })).toBe('Depot');
        expect(stopLabel({ type: 'pickup', address: '1 Road' })).toBe('1 Road');
        expect(stopLabel({ type: 'pickup' })).toBeUndefined();
    });
});
