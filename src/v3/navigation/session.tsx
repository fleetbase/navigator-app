/**
 * Session-scoped values and the hooks route screens share.
 *
 * Moved out of DriverTabs.tsx so the route screens (navigation/routes/*) can be
 * loaded through the screen registry without importing the navigator that
 * registers them. DriverTabs provides these contexts; a client screen override
 * reads them through the same hooks.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useOrder, useOrderRemoval, useDriver, vehicleOf, vehicleDescription, currentDestination, payloadOf, stopLabel } from '../data';
import { fromGeoPoint, type Destination } from '../navigate/handoff';

/** The signed-in driver's public id, for screens that scope a query by it. */
export const DriverIdContext = createContext<string | undefined>(undefined);
export const useDriverId = () => useContext(DriverIdContext);

/** The driver's *user* id — chat identifies people by user, not by driver. */
export const DriverUserIdContext = createContext<string | undefined>(undefined);
export const useDriverUserId = () => useContext(DriverUserIdContext);

/** Explicit sign-out, handed down from the host app. */
export const SignOutContext = createContext<(() => void) | undefined>(undefined);
export const useSignOut = () => useContext(SignOutContext);

/**
 * Organisation-level feature switches. Every entry defaults to off, and an
 * off surface renders its "not enabled" state — never fake data (invariant 8).
 */
export interface Features {
    /** H2: driver wallet earnings via the ledger extension. */
    earnings?: boolean;
}
export const FeaturesContext = createContext<Features>({});
export const useFeatures = () => useContext(FeaturesContext);

/** Current organisation, and the host's handler for a completed switch. */
export const OrganizationContext = createContext<{ id?: string; onSwitched?: (driver: unknown) => void }>({});
export const useOrganization = () => useContext(OrganizationContext);

export type Nav = {
    navigate: (route: string, params?: object) => void;
    goBack: () => void;
    popToTop?: () => void;
};

/**
 * Counts arrivals at a screen, so it can refetch on return without knowing
 * anything about navigation. Incremented in an effect rather than during
 * render — a ref bumped mid-render is a side effect, and double-counts.
 */
export function useFocusCount(): number {
    const isFocused = useIsFocused();
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (isFocused) setCount((n) => n + 1);
    }, [isFocused]);
    return count;
}

/**
 * Leaves a screen whose order was taken off this driver (reassigned), back to
 * the top of the stack — the list there says why. Only the focused screen
 * leaves; the ones beneath it go with the pop.
 */
export function useLeaveWhenRemoved(orderId: string | undefined, navigation: Nav) {
    const removal = useOrderRemoval(orderId);
    const isFocused = useIsFocused();
    useEffect(() => {
        if (!removal || !isFocused) return;
        if (navigation.popToTop) navigation.popToTop();
        else navigation.goBack();
    }, [removal, isFocused, navigation]);
}

/** The assigned vehicle, from the driver record, like My vehicle does it. */
export function useAssignedVehicle() {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    const vehicle = vehicleOf(driver);
    return { driverId, driver, vehicleId: vehicle?.id, vehicleName: vehicleDescription(vehicle) ?? vehicle?.name ?? undefined, odometer: vehicle?.odometer };
}

/**
 * With an `orderId`, the destination is read from the order as it is now
 * (`current_waypoint`, else the drop-off) — never the point captured when the
 * button was tapped. A store moving the drop-off while this screen is open
 * re-renders it with the new address. `destination` is the fallback, and the
 * only input for stops that are not an order's (a manifest stop).
 */
export function useHandoffDestination(orderId?: string, fallback?: Destination): Destination | undefined {
    const order = useOrder(orderId);
    return useMemo(() => {
        if (!order) return fallback;
        const payload = payloadOf(order);
        const stop = currentDestination(payload);
        return (
            fromGeoPoint(stop?.location, stopLabel(stop)) ??
            fromGeoPoint(payload.dropoff?.location, payload.dropoff?.name ?? payload.dropoff?.address) ??
            fallback
        );
    }, [order, fallback]);
}
