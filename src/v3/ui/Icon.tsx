/**
 * Icon set — 2px stroke, 24×24, no fills, no emoji.
 *
 * Paths are lifted verbatim from the design document's own inline SVG
 * (Navigator Redesign.dc.html, tab bar in s01), so the icons in the app are the
 * icons in the mockup. v2 used FontAwesome solid, which is filled and reads
 * heavier than the design's stroke set.
 */
import { Circle, Path, Rect, Svg } from 'react-native-svg';

export interface IconProps {
    size?: number;
    color?: string;
    strokeWidth?: number;
}

const base = ({ size = 24, strokeWidth = 2 }: IconProps) => ({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
});

export function TodayIcon({ color = 'currentColor', ...p }: IconProps) {
    return (
        <Svg {...base(p)}>
            <Rect x={4} y={5} width={16} height={15} rx={3} stroke={color} strokeWidth={p.strokeWidth ?? 2} fill="none" />
            <Path d="M4 10 h16" stroke={color} strokeWidth={p.strokeWidth ?? 2} />
        </Svg>
    );
}

export function RouteIcon({ color = 'currentColor', ...p }: IconProps) {
    const sw = p.strokeWidth ?? 2;
    return (
        <Svg {...base(p)}>
            <Circle cx={6} cy={18} r={2.5} stroke={color} strokeWidth={sw} fill="none" />
            <Circle cx={18} cy={6} r={2.5} stroke={color} strokeWidth={sw} fill="none" />
            <Path d="M8 16.5 C13 14 11 8 15.5 7" stroke={color} strokeWidth={sw} fill="none" />
        </Svg>
    );
}

export function OrdersIcon({ color = 'currentColor', ...p }: IconProps) {
    const sw = p.strokeWidth ?? 2;
    return (
        <Svg {...base(p)}>
            <Path d="M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
            <Path d="M4 8 L12 12 L20 8 M12 12 V20" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
        </Svg>
    );
}

export function InboxIcon({ color = 'currentColor', ...p }: IconProps) {
    const sw = p.strokeWidth ?? 2;
    return (
        <Svg {...base(p)}>
            <Path d="M4 6 h16 v11 h-9 l-4 3 v-3 h-3 Z" stroke={color} strokeWidth={sw} fill="none" strokeLinejoin="round" />
        </Svg>
    );
}

export function AccountIcon({ color = 'currentColor', ...p }: IconProps) {
    const sw = p.strokeWidth ?? 2;
    return (
        <Svg {...base(p)}>
            <Circle cx={12} cy={8} r={3.5} stroke={color} strokeWidth={sw} fill="none" />
            <Path d="M5 20 C6 15.5 9 14 12 14 C15 14 18 15.5 19 20" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
        </Svg>
    );
}

export const tabIcons = {
    Today: TodayIcon,
    Route: RouteIcon,
    Orders: OrdersIcon,
    Inbox: InboxIcon,
    Account: AccountIcon,
} as const;

export type TabIconName = keyof typeof tabIcons;
