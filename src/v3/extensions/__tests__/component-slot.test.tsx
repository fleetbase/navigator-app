import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { componentSlot, validateComponentOverrides } from '../components/component-slot';
import { COMPONENT_IDS } from '../components/component-ids';

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const Label = ({ text, value }: { text: string; value?: string }) => React.createElement('label', { text, value });
const moduleOf = (Component: any) => () => Promise.resolve({ default: Component });
const texts = (renderer: any) => renderer.root.findAll((node: any) => node.type === 'label').map((node: any) => node.props.text);

const Default = (props: any) => <Label text="default" value={props.trackingNumber} />;

async function render(element: React.ReactElement) {
    let renderer: any;
    await act(async () => {
        renderer = TestRenderer.create(element);
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return renderer;
}

describe('componentSlot', () => {
    beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
    afterEach(() => (console.error as jest.Mock).mockRestore?.());

    it('returns the default itself when the build has no override — no wrapper, no cost', () => {
        expect(componentSlot('orders.orderCard', Default as any, { overrides: {} })).toBe(Default);
    });

    it('renders an override with the default props and the default to compose', async () => {
        const Override = ({ Default: Inner, ...props }: any) => (
            <>
                <Label text="brand" value={props.trackingNumber} />
                <Inner {...props} />
            </>
        );
        const Slot: any = componentSlot('orders.orderCard', Default as any, { overrides: { 'orders.orderCard': { load: moduleOf(Override) } }, strict: true });
        const renderer = await render(<Slot trackingNumber="FLE123" stops={[]} />);
        expect(texts(renderer)).toEqual(['brand', 'default']);
        expect(renderer.root.findAll((n: any) => n.type === 'label').every((n: any) => n.props.value === 'FLE123')).toBe(true);
    });

    it('falls back to the default when an override throws', async () => {
        const Broken = () => {
            throw new Error('boom');
        };
        const Slot: any = componentSlot('route.stopRow', Default as any, { overrides: { 'route.stopRow': { load: moduleOf(Broken) } }, strict: true });
        const renderer = await render(<Slot trackingNumber="FLE9" />);
        expect(texts(renderer)).toEqual(['default']);
    });

    it('falls back to the default when an override fails to load', async () => {
        const Slot: any = componentSlot('shell.appHeader', Default as any, { overrides: { 'shell.appHeader': { load: () => Promise.reject(new Error('missing')) } }, strict: true });
        const renderer = await render(<Slot trackingNumber="x" />);
        expect(texts(renderer)).toEqual(['default']);
    });

    it('renders the default while an override loads, not a blank frame', async () => {
        let resolveModule: (value: any) => void = () => {};
        const Slot: any = componentSlot('shell.tabBar', Default as any, {
            overrides: { 'shell.tabBar': { load: () => new Promise((resolve) => (resolveModule = resolve)) } },
            strict: true,
        });
        const renderer = await render(<Slot />);
        expect(texts(renderer)).toEqual(['default']);
        await act(async () => resolveModule({ default: () => <Label text="late" /> }));
        expect(texts(renderer)).toEqual(['late']);
    });

    it('keeps the default on platforms an override is not for', () => {
        const overrides = { 'auth.signIn': { load: moduleOf(Default), platforms: ['android' as const] } };
        expect(componentSlot('auth.signIn', Default as any, { overrides, platform: 'ios' })).toBe(Default);
        expect(componentSlot('auth.signIn', Default as any, { overrides, platform: 'android' })).not.toBe(Default);
    });
});

describe('validateComponentOverrides', () => {
    it('rejects unknown ids and malformed entries in strict mode', () => {
        expect(() => validateComponentOverrides({ 'nope.card': { load: moduleOf(Default) } }, { strict: true })).toThrow(/Unknown component id/);
        expect(() => validateComponentOverrides({ 'orders.orderCard': { component: Default } }, { strict: true })).toThrow(/Invalid override/);
    });

    it('drops them with a warning otherwise', () => {
        const warn = jest.fn();
        expect(validateComponentOverrides({ 'nope.card': { load: moduleOf(Default) } }, { strict: false, warn })).toEqual({});
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('names a small, documented set of components', () => {
        expect([...COMPONENT_IDS]).toEqual(['auth.signIn', 'shell.appHeader', 'shell.tabBar', 'orders.orderCard', 'route.stopRow']);
    });
});
