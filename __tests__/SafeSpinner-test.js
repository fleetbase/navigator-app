import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ActivityIndicator, Animated, View } from 'react-native';
import SafeSpinner from '../src/components/SafeSpinner';

test('renders an animated view instead of the Android native progress indicator', async () => {
    const animation = { start: jest.fn(), stop: jest.fn() };
    jest.spyOn(Animated, 'loop').mockReturnValue(animation);

    let renderer;
    await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<SafeSpinner color='#ffffff' size='large' />);
    });

    expect(renderer.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(renderer.root.findAllByType(View)).not.toHaveLength(0);
    expect(animation.start).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(() => renderer.unmount());
    expect(animation.stop).toHaveBeenCalledTimes(1);
}, 30000);
