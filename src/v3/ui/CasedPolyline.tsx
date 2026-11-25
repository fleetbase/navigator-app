/**
 * A route line drawn the way the FleetOps console draws one: a darker, wider
 * line underneath and a brighter, thinner one on top.
 *
 * It is two plain `Polyline`s rather than anything cleverer because that is
 * all the web build's map stand-in implements (web/maps.jsx), and a route line
 * must look the same there as on a phone. Opacity is carried in the colour for
 * the same reason.
 */
import { Polyline } from 'react-native-maps';
import type { LatLng } from '../data/routeGeo';
import { routeLineLayers, type RouteLineVariant } from './routeColors';

export interface CasedPolylineProps {
    coordinates: LatLng[];
    /** The line's colour, as hex. The casing is worked out from it. */
    color: string;
    variant?: RouteLineVariant;
    /** Lines with a higher number are drawn over lines with a lower one (native maps). */
    zIndex?: number;
}

export function CasedPolyline({ coordinates, color, variant = 'live', zIndex = 0 }: CasedPolylineProps) {
    if (coordinates.length < 2) return null;
    const [casing, line] = routeLineLayers(color, variant);
    return (
        <>
            <Polyline coordinates={coordinates} strokeColor={casing.color} strokeWidth={casing.width} lineCap="round" lineJoin="round" zIndex={zIndex * 2} />
            <Polyline coordinates={coordinates} strokeColor={line.color} strokeWidth={line.width} lineCap="round" lineJoin="round" zIndex={zIndex * 2 + 1} />
        </>
    );
}

export default CasedPolyline;
