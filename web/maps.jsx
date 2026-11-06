/**
 * react-native-maps, on Leaflet. Markers are real React children rendered into
 * the map through a portal, so they keep the app's theme and read exactly as they
 * do on native rather than being re-implemented as HTML strings.
 *
 * Tiles default to OpenStreetMap's, whose usage policy doesn't cover production
 * traffic: a deployment sets MAP_TILES_LIGHT and MAP_TILES_DARK to a provider it
 * has terms with. Without a dark style, the light tiles are inverted.
 */
import 'leaflet/dist/leaflet.css';
import React, { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useColorScheme, View } from 'react-native';
import L from 'leaflet';
import Config from './config';

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const LIGHT_TILES = Config.MAP_TILES_LIGHT || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_TILES = Config.MAP_TILES_DARK;

const MapContext = createContext(null);

const toLatLng = ({ latitude, longitude }) => [latitude, longitude];

function zoomForDelta(latitudeDelta) {
    return Math.max(1, Math.min(18, Math.round(Math.log2(360 / Math.max(latitudeDelta, 0.0001)))));
}

const paddingOf = (edgePadding = {}) => ({
    paddingTopLeft: [edgePadding.left ?? 0, edgePadding.top ?? 0],
    paddingBottomRight: [edgePadding.right ?? 0, edgePadding.bottom ?? 0],
});

function fitMap(map, coordinates, { edgePadding, animated = true } = {}) {
    // Padding wider than the map would leave Leaflet nothing to fit into.
    const size = map.getSize();
    const scale = Math.min(1, (size.y * 0.8) / Math.max(1, (edgePadding?.top ?? 0) + (edgePadding?.bottom ?? 0)), (size.x * 0.8) / Math.max(1, (edgePadding?.left ?? 0) + (edgePadding?.right ?? 0)));
    const scaled = Object.fromEntries(Object.entries(edgePadding ?? {}).map(([side, value]) => [side, value * scale]));
    map.fitBounds(coordinates.map(toLatLng), { ...paddingOf(scaled), animate: animated, maxZoom: 16 });
}

function userDot() {
    const element = document.createElement('div');
    element.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#2e63d9;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box;transform:translate(-50%,-50%)';
    return L.divIcon({ html: element, className: 'nv-map-marker', iconSize: [0, 0] });
}

function UserLocation() {
    const map = useContext(MapContext);
    useEffect(() => {
        if (!('geolocation' in navigator)) return undefined;
        let marker;
        const watch = navigator.geolocation.watchPosition(
            ({ coords }) => {
                const point = [coords.latitude, coords.longitude];
                if (marker) marker.setLatLng(point);
                else marker = L.marker(point, { icon: userDot(), interactive: false, keyboard: false }).addTo(map);
            },
            () => {}
        );
        return () => {
            navigator.geolocation.clearWatch(watch);
            marker?.remove();
        };
    }, [map]);
    return null;
}

const MapView = forwardRef(function MapView({ style, testID, initialRegion, userInterfaceStyle, showsUserLocation, children, onPress, onRegionChangeComplete }, ref) {
    const containerRef = useRef(null);
    const [map, setMap] = useState(null);
    // A screen asks for a fit from its first effect, before the map exists or has a size.
    const pendingFit = useRef(null);
    const systemScheme = useColorScheme();
    const scheme = userInterfaceStyle ?? systemScheme ?? 'light';

    useEffect(() => {
        const instance = L.map(containerRef.current, { zoomControl: false, attributionControl: true });
        instance.attributionControl.setPrefix(false);
        const region = initialRegion ?? { latitude: 0, longitude: 0, latitudeDelta: 90 };
        instance.setView(toLatLng(region), zoomForDelta(region.latitudeDelta));
        const applyPendingFit = () => {
            if (!pendingFit.current || instance.getSize().y === 0) return;
            fitMap(instance, pendingFit.current[0], { ...pendingFit.current[1], animated: false });
            pendingFit.current = null;
        };
        const observer = new ResizeObserver(() => {
            instance.invalidateSize();
            applyPendingFit();
        });
        observer.observe(containerRef.current);
        applyPendingFit();
        setMap(instance);
        return () => {
            observer.disconnect();
            instance.remove();
            setMap(null);
        };
        // The region is only the starting view, as on native.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!map) return undefined;
        const dark = scheme === 'dark';
        const layer = L.tileLayer((dark && DARK_TILES) || LIGHT_TILES, { attribution: ATTRIBUTION, maxZoom: 19, className: dark && !DARK_TILES ? 'nv-map-tiles-inverted' : '' }).addTo(map);
        return () => layer.remove();
    }, [map, scheme]);

    useEffect(() => {
        if (!map) return undefined;
        const handleClick = (event) => onPress?.({ nativeEvent: { coordinate: { latitude: event.latlng.lat, longitude: event.latlng.lng } } });
        const handleMoveEnd = () => {
            const bounds = map.getBounds();
            const center = map.getCenter();
            onRegionChangeComplete?.({ latitude: center.lat, longitude: center.lng, latitudeDelta: bounds.getNorth() - bounds.getSouth(), longitudeDelta: bounds.getEast() - bounds.getWest() });
        };
        map.on('click', handleClick);
        map.on('moveend', handleMoveEnd);
        return () => {
            map.off('click', handleClick);
            map.off('moveend', handleMoveEnd);
        };
    }, [map, onPress, onRegionChangeComplete]);

    useImperativeHandle(
        ref,
        () => ({
            fitToCoordinates(coordinates = [], options) {
                if (!coordinates.length) return;
                if (map && map.getSize().y > 0) fitMap(map, coordinates, options);
                else pendingFit.current = [coordinates, options];
            },
            animateToRegion(region, duration = 350) {
                map?.flyTo(toLatLng(region), zoomForDelta(region.latitudeDelta), { duration: duration / 1000 });
            },
            animateCamera({ center, zoom }, { duration = 350 } = {}) {
                if (center) map?.flyTo(toLatLng(center), zoom ?? map.getZoom(), { duration: duration / 1000 });
            },
        }),
        [map]
    );

    return (
        // A stacking context of its own: Leaflet's panes would otherwise sit above sheets and banners.
        <View testID={testID} style={[{ overflow: 'hidden', isolation: 'isolate', zIndex: 0 }, style]}>
            <View ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            {map ? (
                <MapContext.Provider value={map}>
                    {showsUserLocation ? <UserLocation /> : null}
                    {children}
                </MapContext.Provider>
            ) : null}
        </View>
    );
});

export function Marker({ coordinate, anchor = { x: 0.5, y: 1 }, onPress, testID, accessibilityLabel, children }) {
    const map = useContext(MapContext);
    const content = useMemo(() => document.createElement('div'), []);
    const markerRef = useRef(null);
    const press = useRef(onPress);
    press.current = onPress;

    useEffect(() => {
        content.style.cssText = `position:absolute;width:max-content;transform:translate(${-anchor.x * 100}%,${-anchor.y * 100}%)`;
        if (testID) content.setAttribute('data-testid', testID);
        const icon = L.divIcon({ html: content, className: 'nv-map-marker', iconSize: [0, 0] });
        const marker = L.marker(toLatLng(coordinate), { icon, title: accessibilityLabel, alt: accessibilityLabel ?? '', riseOnHover: true }).addTo(map);
        marker.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            press.current?.();
        });
        markerRef.current = marker;
        return () => {
            marker.remove();
            markerRef.current = null;
        };
        // The marker moves below; everything else is fixed for its lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    useEffect(() => {
        markerRef.current?.setLatLng(toLatLng(coordinate));
    }, [coordinate.latitude, coordinate.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

    return createPortal(children ?? <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#2e63d9', borderWidth: 3, borderColor: '#fff' }} />, content);
}

function useShape(factory, deps) {
    const map = useContext(MapContext);
    useEffect(() => {
        const layer = factory().addTo(map);
        return () => layer.remove();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, ...deps]);
}

const pathOptions = ({ strokeColor, strokeWidth, fillColor, lineDashPattern }) => ({
    color: strokeColor,
    weight: strokeWidth,
    fillColor,
    fill: Boolean(fillColor),
    dashArray: lineDashPattern?.join(' '),
});

export function Polyline({ coordinates = [], ...props }) {
    useShape(() => L.polyline(coordinates.map(toLatLng), pathOptions(props)), [JSON.stringify(coordinates), props.strokeColor, props.strokeWidth]);
    return null;
}

export function Polygon({ coordinates = [], ...props }) {
    useShape(() => L.polygon(coordinates.map(toLatLng), pathOptions(props)), [JSON.stringify(coordinates), props.strokeColor, props.fillColor]);
    return null;
}

export const PROVIDER_DEFAULT = undefined;
export const PROVIDER_GOOGLE = 'google';
export default MapView;
