/**
 * Everything a driver needs arrives on their own channel.
 *
 * FleetOps broadcasts geofence crossings, order assignment, dispatch, and
 * ad-hoc offers to `driver.{public_id}` and `driver.{uuid}`, so one
 * subscription covers the lot — no per-order channels to open and close as the
 * day changes.
 *
 * Order events bump the live-refresh signal rather than writing to the store:
 * the socket says *something changed*, and the app then asks the API what it
 * changed to. Geofence crossings are surfaced to the caller instead, because
 * they are a notification rather than a data change — nothing to refetch, but
 * something the driver may want to be told.
 */
import { useEffect, useState } from 'react';
import { useRealtime } from './SocketProvider';
import { affectsOrders, type RealtimeEvent } from './events';
import { bumpLiveRefresh } from './liveRefresh';

export interface DriverChannelState {
    /** The most recent geofence crossing, for whoever wants to show it. */
    lastGeofenceEvent?: RealtimeEvent;
    /** The most recent ad-hoc offer, for the offer surface to pick up. */
    lastOffer?: RealtimeEvent;
}

export function useDriverChannel(driverId?: string): DriverChannelState {
    const { listen } = useRealtime();
    const [state, setState] = useState<DriverChannelState>({});

    useEffect(() => {
        if (!driverId) return;

        return listen(`driver.${driverId}`, (event) => {
            if (event.kind === 'order.offered') {
                setState((prev) => ({ ...prev, lastOffer: event }));
                return;
            }

            if (affectsOrders(event.kind)) {
                bumpLiveRefresh();
                return;
            }

            if (event.kind.startsWith('geofence.')) {
                setState((prev) => ({ ...prev, lastGeofenceEvent: event }));
            }
        });
    }, [driverId, listen]);

    return state;
}
