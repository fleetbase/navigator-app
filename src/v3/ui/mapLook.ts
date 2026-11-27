/**
 * How every map in the app is drawn, in one place, so they all look alike.
 *
 * The map is a backdrop for the driver's own marks (waypoints, the route, the
 * driver), so it is quiet: no shops and landmarks, no 3D buildings, no traffic
 * colours, and muted land and road tones. In the dark schemes it is dark.
 *
 * iOS draws Apple's map: `mutedStandard` is its low-contrast style and
 * `userInterfaceStyle` picks its dark version. Android draws Google's map,
 * which is restyled with a JSON style (`customMapStyle`); the dark one below
 * uses the app's own navy tones. Apple's map colours cannot be changed, so the
 * two are close, not identical.
 */
import { Platform } from 'react-native';

type Style = { elementType?: string; featureType?: string; stylers: Record<string, string | number>[] }[];

const HIDE: Style = [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

/** Google's map in the dark schemes: the mockups' navy ground, slightly lighter roads, quiet labels. */
const DARK_STYLE: Style = [
    { elementType: 'geometry', stylers: [{ color: '#0D141E' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#6F7F97' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0D141E' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#223046' }] },
    { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#0E1B1A' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#18222F' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#1B2636' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#223046' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8A99AE' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A1626' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3D4F68' }] },
    ...HIDE,
];

const LIGHT_STYLE: Style = [...HIDE];

export function mapLook(dark?: boolean) {
    return {
        userInterfaceStyle: (dark ? 'dark' : 'light') as 'dark' | 'light',
        mapType: (Platform.OS === 'ios' ? 'mutedStandard' : 'standard') as 'mutedStandard' | 'standard',
        customMapStyle: dark ? DARK_STYLE : LIGHT_STYLE,
        showsPointsOfInterest: false,
        showsBuildings: false,
        showsTraffic: false,
        showsIndoors: false,
    };
}

export default mapLook;
