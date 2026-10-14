import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { OrderStore, type OrderRecord } from '../orderStore';
import { useActiveOrders, useOrdersOnDay, useOrder } from '../useOrders';
import { clearV3 } from '../../api/storage';

const order = (id: string, over: Partial<OrderRecord> = {}): OrderRecord => ({
    id, status: 'driver_enroute', tracking_number: `FLE${id}`, ...over,
});

beforeEach(() => clearV3());

describe('order hooks', () => {
    it('hands a list the same array reference across an unrelated re-render', () => {
        const store = new OrderStore({ byId: {}, allIds: [], version: 0 });
        store.upsertMany([order('a'), order('b')]);

        const seen: OrderRecord[][] = [];
        const Probe = ({ tick }: { tick: number }) => {
            seen.push(useActiveOrders(store));
            return <>{tick}</>;
        };

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe tick={1} />); });
        // A parent re-render with new props must not produce a new data array.
        ReactTestRenderer.act(() => { tree!.update(<Probe tick={2} />); });

        expect(seen.length).toBeGreaterThanOrEqual(2);
        expect(seen[0]).toBe(seen[seen.length - 1]);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('re-renders with a new reference when the store actually changes', () => {
        const store = new OrderStore({ byId: {}, allIds: [], version: 0 });
        store.upsertMany([order('a')]);

        const seen: OrderRecord[][] = [];
        const Probe = () => { seen.push(useActiveOrders(store)); return null; };

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe />); });
        ReactTestRenderer.act(() => { store.upsertMany([order('b')]); });

        const last = seen[seen.length - 1];
        expect(last).not.toBe(seen[0]);
        expect(last).toHaveLength(2);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('does not resubscribe when a fresh Date is passed each render', () => {
        const store = new OrderStore({ byId: {}, allIds: [], version: 0 });
        store.upsertMany([order('a', { created_at: new Date().toISOString() })]);

        const seen: OrderRecord[][] = [];
        // v2 rebuilt its MMKV key (and therefore its subscription) every second
        // because the key carried HH:mm:ss. A new Date object per render must be
        // inert here.
        const Probe = ({ tick }: { tick: number }) => {
            seen.push(useOrdersOnDay(new Date(), store));
            return <>{tick}</>;
        };

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe tick={1} />); });
        ReactTestRenderer.act(() => { tree!.update(<Probe tick={2} />); });
        ReactTestRenderer.act(() => { tree!.update(<Probe tick={3} />); });

        expect(seen[0]).toBe(seen[seen.length - 1]);
        expect(seen[0]).toHaveLength(1);
        ReactTestRenderer.act(() => tree!.unmount());
    });

    it('tracks a single order by id', () => {
        const store = new OrderStore({ byId: {}, allIds: [], version: 0 });
        store.upsert(order('a', { status: 'started' }));

        let latest: OrderRecord | undefined;
        const Probe = () => { latest = useOrder('a', store); return null; };

        let tree: ReactTestRenderer.ReactTestRenderer;
        ReactTestRenderer.act(() => { tree = ReactTestRenderer.create(<Probe />); });
        expect(latest?.status).toBe('started');

        ReactTestRenderer.act(() => { store.upsert({ id: 'a', status: 'completed' }); });
        expect(latest?.status).toBe('completed');
        ReactTestRenderer.act(() => tree!.unmount());
    });
});
