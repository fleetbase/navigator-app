/**
 * Navigation hand-off — R2 frame D6.
 *
 * Building the URL and opening it are kept apart on purpose: the URLs are pure
 * string construction and can be asserted exactly, which is where the mistakes
 * live. A wrong parameter name does not throw — it opens the map app at the
 * wrong place, or at nothing, and looks like the app "just didn't work".
 *
 * Order matters in two of these:
 *
 *   - Apple and Google take **`lat,lng`**; Waze takes `ll=lat,lng`; Uber takes
 *     latitude and longitude as separate keys. Getting this backwards sends the
 *     driver to the transposed coordinate, which for Singapore (1.35, 103.8) is
 *     in the Indian Ocean and for London (51.5, -0.12) is in Antarctica.
 *   - GeoJSON stores **[longitude, latitude]**, which is the opposite order to
 *     every one of these URLs. `fromGeoPoint` is the only place that flip
 *     happens.
 *
 * `canOpenURL` needs the scheme declared in `LSApplicationQueriesSchemes` on
 * iOS. `comgooglemaps`, `waze` and `uber` are all already in Info.plist.
 */
import { Linking, Platform } from 'react-native';
import type { NavigationApp } from '../settings';

export interface Destination {
    latitude: number;
    longitude: number;
    /** Shown as the pin label where the app supports one. */
    label?: string;
}

export type NavigationAppId = NavigationApp | 'uber';

export interface NavigationOption {
    id: NavigationAppId;
    labelKey: string;
    /** Undefined on a platform where the app does not exist at all. */
    scheme?: string;
}

/**
 * Apple Maps has no scheme to probe — it is guaranteed on iOS and absent on
 * Android, so availability is decided by platform rather than by `canOpenURL`.
 */
export const NAVIGATION_OPTIONS: NavigationOption[] = [
    { id: 'apple', labelKey: 'handoff.apple' },
    { id: 'google', labelKey: 'handoff.google', scheme: 'comgooglemaps://' },
    { id: 'waze', labelKey: 'handoff.waze', scheme: 'waze://' },
    { id: 'uber', labelKey: 'handoff.uber', scheme: 'uber://' },
];

/** GeoJSON is [longitude, latitude] — the reverse of every navigation URL. */
export function fromGeoPoint(point?: { coordinates?: number[] } | null, label?: string): Destination | undefined {
    const coordinates = point?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
    // [0, 0] is the API's placeholder for "unknown", not a real destination.
    if (latitude === 0 && longitude === 0) return undefined;
    return { latitude, longitude, label };
}

/** Six decimals is ~11 cm — more is noise, less is a different building. */
const coord = (n: number) => Number(n.toFixed(6));

export function buildUrl(app: NavigationAppId, destination: Destination): string {
    const lat = coord(destination.latitude);
    const lng = coord(destination.longitude);
    const label = destination.label ? encodeURIComponent(destination.label) : undefined;

    switch (app) {
        case 'google':
            // `directionsmode=driving` so it does not open in transit mode.
            return `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
        case 'waze':
            // Without `navigate=yes` Waze only drops a pin.
            return `waze://?ll=${lat},${lng}&navigate=yes`;
        case 'uber':
            return `uber://?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}${label ? `&dropoff[nickname]=${label}` : ''}`;
        case 'apple':
        default:
            // `dirflg=d` is driving directions rather than a dropped pin.
            return `maps://?daddr=${lat},${lng}&dirflg=d${label ? `&q=${label}` : ''}`;
    }
}

/**
 * Where to send someone whose chosen app is not installed. Every one of these
 * opens in a browser, so the driver still gets directions.
 */
export function buildWebFallback(app: NavigationAppId, destination: Destination): string {
    const lat = coord(destination.latitude);
    const lng = coord(destination.longitude);

    switch (app) {
        case 'google':
            return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        case 'waze':
            return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
        case 'uber':
            return `https://m.uber.com/ul/?action=setPickup&dropoff[latitude]=${lat}&dropoff[longitude]=${lng}`;
        case 'apple':
        default:
            return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    }
}

/** Which of the options this handset can actually open. */
export async function availableApps(
    canOpen: (url: string) => Promise<boolean> = (url) => Linking.canOpenURL(url),
    platform: string = Platform.OS
): Promise<NavigationAppId[]> {
    const results = await Promise.all(
        NAVIGATION_OPTIONS.map(async (option) => {
            // Apple Maps: present on iOS, absent elsewhere, nothing to probe.
            if (!option.scheme) return platform === 'ios' ? option.id : null;
            try {
                return (await canOpen(option.scheme)) ? option.id : null;
            } catch {
                // A scheme missing from LSApplicationQueriesSchemes rejects
                // rather than resolving false. Treat it as unavailable.
                return null;
            }
        })
    );
    return results.filter((id): id is NavigationAppId => id !== null);
}

export interface HandoffResult {
    opened: boolean;
    /** True when the app was missing and the browser was used instead. */
    usedFallback: boolean;
}

export async function navigateTo(
    app: NavigationAppId,
    destination: Destination,
    open: (url: string) => Promise<unknown> = (url) => Linking.openURL(url),
    canOpen: (url: string) => Promise<boolean> = (url) => Linking.canOpenURL(url)
): Promise<HandoffResult> {
    const url = buildUrl(app, destination);
    try {
        // Apple Maps has no queryable scheme; try it directly.
        const supported = app === 'apple' ? true : await canOpen(url).catch(() => false);
        if (supported) {
            await open(url);
            return { opened: true, usedFallback: false };
        }
    } catch {
        // Fall through to the browser rather than failing the hand-off.
    }

    try {
        await open(buildWebFallback(app, destination));
        return { opened: true, usedFallback: true };
    } catch {
        return { opened: false, usedFallback: false };
    }
}
