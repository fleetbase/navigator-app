/**
 * Shapes here are copied from a live Fleetbase instance
 * (GET http://localhost:8000/v1/orders), not invented. Both cases below were
 * real bugs found by running against it.
 */
import { customerNameOf, displayIdOf, entityTrackingNumberOf, orderConfigIdOf, payloadOf, podRequiredOf, trackingNumberOf, trackingStatusCodeOf, entityIdOf, entityNameOf, entityDamagedOf } from '../accessors';

/** Trimmed but structurally faithful to the live response. */
const liveOrder = {
    id: 'order_izYn0u3DJC',
    internal_id: 'FP497253',
    order_config: 'order_config_rvle6d5CAn',
    status: 'dispatched',
    pod_required: true,
    customer: { id: 'contact_0daUklnTYK', name: 'Priya Patel' },
    tracking_number: {
        id: 'track_n2BW7ETzGE',
        tracking_number: 'FLE4253599245SG',
        status: 'Order Dispatched',
        status_code: 'DISPATCHED',
        qr_code: 'iVBORw0KGgo…',
    },
    payload: { pickup: { name: 'Wareham Depot' }, dropoff: { name: 'Harbour View' }, entities: [{}], waypoints: [] },
};

describe('order accessors against live API shapes', () => {
    it('reads the tracking number out of the object form', () => {
        // String(order.tracking_number) would render "[object Object]" — the
        // identifier the whole design is built around.
        expect(trackingNumberOf(liveOrder)).toBe('FLE4253599245SG');
        expect(displayIdOf(liveOrder)).toBe('FLE4253599245SG');
        expect(displayIdOf(liveOrder)).not.toContain('[object');
    });

    it('still accepts a plain string tracking number', () => {
        expect(trackingNumberOf({ tracking_number: 'FLE0001SG' } as never)).toBe('FLE0001SG');
    });

    it('falls back to internal_id, then id, never to a stringified object', () => {
        expect(displayIdOf({ id: 'order_x', internal_id: 'FP1' } as never)).toBe('FP1');
        expect(displayIdOf({ id: 'order_x' } as never)).toBe('order_x');
        expect(displayIdOf({ id: 'order_x', tracking_number: {} } as never)).toBe('order_x');
    });

    it('reads order_config when it is a bare public id string', () => {
        // The live API returns a string here; reading `.id` yielded undefined
        // and the activity stepper never loaded.
        expect(orderConfigIdOf(liveOrder)).toBe('order_config_rvle6d5CAn');
    });

    it('also accepts the expanded object form', () => {
        expect(orderConfigIdOf({ order_config: { id: 'cfg_1' } } as never)).toBe('cfg_1');
        expect(orderConfigIdOf({ order_config: { public_id: 'cfg_2' } } as never)).toBe('cfg_2');
        expect(orderConfigIdOf({ order_config_uuid: 'cfg_3' } as never)).toBe('cfg_3');
        expect(orderConfigIdOf({} as never)).toBeUndefined();
    });

    it('exposes the tracking status code, which differs from order.status', () => {
        expect(trackingStatusCodeOf(liveOrder)).toBe('DISPATCHED');
        expect(liveOrder.status).toBe('dispatched');
    });

    it('reads pod_required and customer name', () => {
        expect(podRequiredOf(liveOrder)).toBe(true);
        expect(customerNameOf(liveOrder)).toBe('Priya Patel');
    });

    it('returns an object from payloadOf even when payload is absent', () => {
        expect(payloadOf(undefined)).toEqual({});
        expect(payloadOf({} as never)).toEqual({});
        expect(payloadOf(liveOrder).entities).toHaveLength(1);
    });

    it('handles entity identifiers in either shape', () => {
        expect(entityTrackingNumberOf({ tracking_number: 'ENT-1' })).toBe('ENT-1');
        expect(entityTrackingNumberOf({ tracking_number: { tracking_number: 'ENT-2' } })).toBe('ENT-2');
        expect(entityTrackingNumberOf({ sku: 'SKU-3' })).toBe('SKU-3');
        expect(entityTrackingNumberOf(null)).toBeUndefined();
    });
});

describe('entityIdOf', () => {
    it('prefers id when present', () => {
        expect(entityIdOf({ id: 'entity_1', internal_id: 'product_x' })).toBe('entity_1');
    });

    it('falls back to internal_id — live entities return id: null', () => {
        expect(entityIdOf({ id: null, internal_id: 'product_jFpaNGYwZG' })).toBe('product_jFpaNGYwZG');
    });

    it('never yields the string "null"', () => {
        // The bug this guards: `entities/${entity.id}` PUT to "entities/null".
        expect(entityIdOf({ id: null })).toBeUndefined();
        expect(String(entityIdOf({ id: null, internal_id: 'product_x' }))).not.toBe('null');
    });

    it('is undefined for an entity with no identifier at all', () => {
        expect(entityIdOf({ name: 'Box' })).toBeUndefined();
        expect(entityIdOf(null)).toBeUndefined();
    });
});

describe('entityNameOf', () => {
    it('uses the name when there is one', () => {
        expect(entityNameOf({ name: 'Orchard Fruit Box' })).toBe('Orchard Fruit Box');
    });

    it('falls through name → tracking number → id', () => {
        expect(entityNameOf({ name: '  ', tracking_number: 'ENT-1' })).toBe('ENT-1');
        expect(entityNameOf({ internal_id: 'product_x' })).toBe('product_x');
    });
});

describe('entityDamagedOf', () => {
    it('reads the column when the instance exposes it', () => {
        expect(entityDamagedOf({ damaged: true })).toBe(true);
        expect(entityDamagedOf({ damaged: false })).toBe(false);
    });

    it('falls back to meta, which is where it actually arrives', () => {
        expect(entityDamagedOf({ meta: { damaged: true } })).toBe(true);
    });

    it('defaults to not damaged', () => {
        expect(entityDamagedOf({})).toBe(false);
        expect(entityDamagedOf(null)).toBe(false);
    });
});
