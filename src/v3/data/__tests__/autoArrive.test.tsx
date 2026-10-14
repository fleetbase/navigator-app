/**
 * R2 C6, the passive half: inside the radius, arrival is proposed with a
 * ten-second undo; undone, it stays undone for that stop.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { useAutoArrive, type AutoArriveState } from '../useAutoArrive';
import type { ManifestStopRecord } from '../manifestStore';
import type { LatLng } from '../routeGeo';

const stop: ManifestStopRecord = { id: 'mstop_2', status: 'pending', sequence: 2, place: { location: { type: 'Point', coordinates: [-1.9598, 50.6085] } } };
const inside: LatLng = { latitude: 50.6086, longitude: -1.9599 };
const outside: LatLng = { latitude: 50.7, longitude: -2.1 };

function Harness({ stop: s, position, onArrive, out }: { stop?: ManifestStopRecord; position: LatLng | null; onArrive: (s: ManifestStopRecord) => void; out: { state?: AutoArriveState; undo?: () => void } }) {
    const { state, undo } = useAutoArrive(s, position, onArrive, { undoMs: 10_000 });
    out.state = state;
    out.undo = undo;
    return null;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function render(props: Omit<React.ComponentProps<typeof Harness>, 'out'>) {
    const out: { state?: AutoArriveState; undo?: () => void } = {};
    let tree: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(<Harness {...props} out={out} />);
    });
    // @ts-expect-error assigned inside act
    return { tree, out, update: (next: Partial<typeof props>) => ReactTestRenderer.act(() => tree.update(<Harness {...props} {...next} out={out} />)) };
}

describe('useAutoArrive', () => {
    it('does nothing outside the radius, or without a fix', () => {
        const onArrive = jest.fn();
        const a = render({ stop, position: outside, onArrive });
        expect(a.out.state?.kind).toBe('idle');
        const b = render({ stop, position: null, onArrive });
        expect(b.out.state?.kind).toBe('idle');
        expect(onArrive).not.toHaveBeenCalled();
    });

    it('proposes arrival inside the radius and records it after the undo window', () => {
        const onArrive = jest.fn();
        const r = render({ stop, position: inside, onArrive });
        expect(r.out.state?.kind).toBe('pending');
        ReactTestRenderer.act(() => {
            jest.advanceTimersByTime(9_000);
        });
        expect(onArrive).not.toHaveBeenCalled();
        ReactTestRenderer.act(() => {
            jest.advanceTimersByTime(1_500);
        });
        expect(onArrive).toHaveBeenCalledWith(expect.objectContaining({ id: 'mstop_2' }));
        expect(r.out.state?.kind).toBe('arrived');
    });

    it('respects an undo for the rest of that stop', () => {
        const onArrive = jest.fn();
        const r = render({ stop, position: inside, onArrive });
        expect(r.out.state?.kind).toBe('pending');
        ReactTestRenderer.act(() => r.out.undo?.());
        expect(r.out.state?.kind).toBe('idle');
        ReactTestRenderer.act(() => {
            jest.advanceTimersByTime(20_000);
        });
        expect(onArrive).not.toHaveBeenCalled();
        // Still inside, still the same stop: no second proposal.
        r.update({ position: { latitude: 50.60855, longitude: -1.95985 } });
        expect(r.out.state?.kind).toBe('idle');
    });

    it('never proposes for a stop that is not pending', () => {
        const onArrive = jest.fn();
        const r = render({ stop: { ...stop, status: 'arrived' }, position: inside, onArrive });
        expect(r.out.state?.kind).toBe('idle');
    });
});
