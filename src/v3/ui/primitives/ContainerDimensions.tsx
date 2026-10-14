import React, { useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

interface ContainerDimensionsProps {
    /** Render-prop: receives the measured content box. */
    children: (width: number, height: number) => React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

const ContainerDimensions = ({ children, style }: ContainerDimensionsProps) => {
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const onLayout = (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setDimensions({ width, height });
    };

    return (
        <View style={[style, { width: '100%', height: '100%', flex: 1 }]} onLayout={onLayout}>
            {dimensions.width > 0 && dimensions.height > 0 ? children(dimensions.width, dimensions.height) : null}
        </View>
    );
};

export default ContainerDimensions;
