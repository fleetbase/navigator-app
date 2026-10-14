/**
 * The driver's last known position, as plain numbers.
 *
 * Needed because `POST /v1/issues` **requires** a location — unlike fuel
 * reports, where it is optional. An issue filed without one is rejected by
 * validation, so the screens have to know whether they have a fix before they
 * offer to file.
 *
 * v3 does not own location tracking; v2's `LocationContext` already runs
 * react-native-background-geolocation for the whole app, and a second consumer
 * of the same hardware would be worse than pointless. The position is bridged in
 * through `App.tsx` like every other v2 value, and normalised here so the shape
 * of the v2 context does not leak into screens.
 */
import { createContext, useContext, useMemo } from 'react';

export interface Coordinates {
    latitude: number;
    longitude: number;
}

/** GeoJSON, the shape the API stores. */
export interface GeoPoint {
    type: 'Point';
    coordinates: [number, number];
}

const LocationContext = createContext<Coordinates | null>(null);

/** Accepts a geolocation position, a bare coords object, or nothing. */
export function normalizeCoordinates(value: unknown): Coordinates | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { coords?: unknown; latitude?: unknown; longitude?: unknown };
    const source = (raw.coords ?? raw) as { latitude?: unknown; longitude?: unknown };

    const latitude = typeof source.latitude === 'number' ? source.latitude : Number(source.latitude);
    const longitude = typeof source.longitude === 'number' ? source.longitude : Number(source.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    // [0, 0] is the placeholder the API itself uses for "unknown", so treating
    // it as a real fix would file every issue off the coast of Ghana.
    if (latitude === 0 && longitude === 0) return null;

    return { latitude, longitude };
}

export function LocationProvider({ location, children }: { location?: unknown; children: React.ReactNode }) {
    const value = useMemo(() => normalizeCoordinates(location), [location]);
    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

/** Null when there is no usable fix — callers must handle that, not assume. */
export function useDeviceLocation(): Coordinates | null {
    return useContext(LocationContext);
}

/** GeoJSON for the API, or null when there is no fix to send. */
export function toGeoPoint(coordinates: Coordinates | null): GeoPoint | null {
    if (!coordinates) return null;
    return { type: 'Point', coordinates: [coordinates.longitude, coordinates.latitude] };
}
