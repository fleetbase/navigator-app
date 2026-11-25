/**
 * Route and waypoint colours, shared with the FleetOps console.
 *
 * These are ported from the console (`addon/utils/route-colors.js` and
 * `route-visualization.js`) rather than taken from the app's theme, on purpose:
 * a dispatcher on the phone to a driver should be looking at the same green P,
 * the same red D and the same colour for the same order. Change them there and
 * here together.
 */

/** The console's route palette, in the console's order: the index is part of the contract. */
export const ROUTE_COLOR_PALETTE = ['#0EA5E9', '#8B5CF6', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#06B6D4', '#EF4444', '#84CC16', '#6366F1'];

export const WAYPOINT_COLORS = {
    pickup: '#22C55E',
    dropoff: '#EF4444',
    return: '#F97316',
} as const;

/** The badge that says a waypoint is finished, so "done" is never told by dimming alone. */
export const WAYPOINT_DONE_COLOR = '#16A34A';

export type WaypointMarkerKind = 'pickup' | 'dropoff' | 'return' | 'waypoint';

/**
 * The same colour for the same id, every time and on every device: the console
 * runs exactly this hash over an order's public id, so an order is one colour
 * in both places. Do not "improve" the hash.
 */
export function colorForId(id: string = ''): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash << 5) - hash + id.charCodeAt(i);
        hash |= 0;
    }
    return ROUTE_COLOR_PALETTE[Math.abs(hash) % ROUTE_COLOR_PALETTE.length];
}

function channels(hex: string): [number, number, number] | undefined {
    const clean = hex.replace('#', '');
    const full = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
    const value = parseInt(full, 16);
    return [value >> 16, (value >> 8) & 0xff, value & 0xff];
}

/** Subtract `amount` from each channel, as the console does for a line's casing. */
export function darkenColor(hex: string, amount = 40): string {
    const rgb = channels(hex);
    // A colour that is not hex cannot be darkened here; the casing then matches the line.
    if (!rgb) return hex;
    return `#${rgb.map((v) => Math.max(0, v - amount).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A colour with its opacity folded in. The maps take one colour per line and
 * the web map has no separate opacity, so `rgba()` is the form both understand.
 */
export function withOpacity(hex: string, opacity: number): string {
    const rgb = channels(hex);
    if (!rgb || opacity >= 1) return hex;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
}

/**
 * What goes inside a waypoint's marker and what colour it sits on: P, D or R
 * for the ends of an order, the waypoint's number on the route's colour for
 * the ones in between (the console's `describeRoutePoint`).
 */
export function describeWaypoint(kind: WaypointMarkerKind | undefined, number: number | undefined, routeColor: string = ROUTE_COLOR_PALETTE[0]): { label: string; color: string } {
    if (kind === 'pickup') return { label: 'P', color: WAYPOINT_COLORS.pickup };
    if (kind === 'dropoff') return { label: 'D', color: WAYPOINT_COLORS.dropoff };
    if (kind === 'return') return { label: 'R', color: WAYPOINT_COLORS.return };
    return { label: number != null ? String(number) : '·', color: routeColor };
}

export type RouteLineVariant = 'live' | 'completed' | 'upcoming' | 'faint';

export interface RouteLineLayer {
    color: string;
    width: number;
}

/**
 * The two layers of a "cased" route line: a darker, wider one underneath and a
 * brighter, thinner one on top, so the line holds against any map tile.
 *
 * `live` and `completed` are the console's own weights and opacities
 * (`routeStyleForStatus`), and `faint` is its cancelled style, used here for a
 * route shown only as background. `upcoming` is the app's: the completed
 * weights at full strength, for legs still to come, so the leg being driven is
 * the heaviest line on the map and not only a different colour.
 */
export function routeLineLayers(color: string, variant: RouteLineVariant = 'live'): [RouteLineLayer, RouteLineLayer] {
    switch (variant) {
        case 'completed':
            return [
                { color: withOpacity(darkenColor(color, 36), 0.4), width: 6 },
                { color: withOpacity(color, 0.8), width: 3 },
            ];
        case 'upcoming':
            return [
                { color: withOpacity(darkenColor(color, 36), 0.82), width: 6 },
                { color, width: 3 },
            ];
        case 'faint':
            return [
                { color: withOpacity(darkenColor(color, 18), 0.16), width: 5 },
                { color: withOpacity(color, 0.52), width: 3 },
            ];
        default:
            return [
                { color: withOpacity(darkenColor(color, 36), 0.82), width: 7 },
                { color, width: 4 },
            ];
    }
}
