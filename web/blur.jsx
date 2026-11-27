/**
 * @react-native-community/blur, for the web: the browser's own backdrop blur.
 */
import React from 'react';
import { View } from 'react-native';

export function BlurView({ blurAmount = 10, style, children }) {
    const filter = `blur(${blurAmount}px) saturate(160%)`;
    return (
        <View style={[style, { backdropFilter: filter, WebkitBackdropFilter: filter }]}>{children}</View>
    );
}

export const VibrancyView = BlurView;
export default { BlurView, VibrancyView };
