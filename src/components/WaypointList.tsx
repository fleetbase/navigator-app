import React, { useState } from 'react';
import Collapsible from 'react-native-collapsible';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { YStack, XStack, Button, Text, useTheme } from 'tamagui';
import { WaypointCircle, WaypointItem, WaypointCollapseButton, CIRCLE_SIZE } from './OrderWaypointList';

interface Waypoint {
    address: string;
    phone?: string;
    status_code?: string;
    complete?: boolean;
    [key: string]: any;
}

interface WaypointListProps {
    waypoints: Waypoint[];
    highlight?: number;
    onCall?: (phone: string) => void;
    textStyle?: any;
}

const COLLAPSE_POINT = 2;

const WaypointList: React.FC<WaypointListProps> = ({ waypoints, highlight, onCall, textStyle }) => {
    const theme = useTheme();
    const [collapsed, setCollapsed] = useState(true);
    const toggle = () => setCollapsed((prev) => !prev);

    if (!waypoints?.length) return null;

    const first = waypoints[0];
    const last = waypoints[waypoints.length - 1];
    const middle = waypoints.slice(1, waypoints.length - 1);

    const renderItem = (wp: Waypoint, idx: number, isLast = false) => {
        const index = idx + 1;
        const isHighlighted = highlight === index;
        return (
            <XStack key={index} borderRadius='$2' mb={isLast ? 0 : '$2'}>
                <WaypointItem
                    index={index}
                    waypoint={wp.serialize()}
                    onCall={onCall}
                    textStyle={textStyle}
                    isLast={isLast}
                    circleBackgroundColor={isHighlighted ? '$success' : '$secondary'}
                    circleBorderColor={isHighlighted ? '$successBorder' : '$gray-600'}
                    circleFontColor={isHighlighted ? '$successText' : '$textSecondary'}
                    icon={isHighlighted ? faCheck : null}
                    iconColor={theme['$successText'].val}
                />
            </XStack>
        );
    };

    return (
        <YStack overflow='hidden' position='relative'>
            <YStack position='absolute' left={CIRCLE_SIZE / 2} top={CIRCLE_SIZE / 2} bottom={CIRCLE_SIZE / 2} borderLeftWidth={2} borderColor='$secondary' opacity={0.75} />
            {renderItem(first, 0)}

            {middle.length > 0 &&
                (middle.length <= COLLAPSE_POINT ? (
                    middle.map((wp, i) => renderItem(wp, i + 1))
                ) : (
                    <YStack>
                        <WaypointCollapseButton isCollapsed={collapsed} toggleCollapse={toggle} count={middle.length} textStyle={textStyle} />
                        <Collapsible collapsed={collapsed}>{middle.map((wp, i) => renderItem(wp, i + 1))}</Collapsible>
                    </YStack>
                ))}

            {waypoints.length > 1 && renderItem(last, waypoints.length - 1, true)}
        </YStack>
    );
};

export default WaypointList;
