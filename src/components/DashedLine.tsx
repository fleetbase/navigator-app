import React, { useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

interface DashedLineProps {
    color?: string;
    dashWidth?: number;
    dashGap?: number;
    thickness?: number;
    style?: object;
}

const DashedLine: React.FC<DashedLineProps> = ({ color = 'black', dashWidth = 8, dashGap = 6, thickness = 4, style }) => {
    const [lineWidth, setLineWidth] = useState(0);

    const onLayout = (event: LayoutChangeEvent) => {
        const { width } = event.nativeEvent.layout;
        setLineWidth(width);
    };

    return (
        <View style={[{ width: '100%' }, style]} onLayout={onLayout}>
            {lineWidth > 0 && (
                <Svg height={thickness} width={lineWidth}>
                    <Line x1={0} y1={thickness / 2} x2={lineWidth} y2={thickness / 2} stroke={color} strokeWidth={thickness} strokeDasharray={[dashWidth, dashGap]} />
                </Svg>
            )}
        </View>
    );
};

export default DashedLine;
