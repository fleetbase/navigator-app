/**
 * Everything a driver needs arrives on their own channel.
 *
 * FleetOps broadcasts geofence crossings, order assignment and dispatch,
 * ad-hoc offers, order edits (`order.changed`) and reassignment
 * (`order.driver_unassigned`) to `driver.{public_id}` and `driver.{uuid}`, so
 * one subscription covers the session. The order the driver has *open* is also
 * followed on its own `order.{id}` channel (`useOrderChannel`), because some
 * events — an offer expiring, a lifecycle update — are only sent there.
 *
 * Order events go through `applyRealtimeEvent`: they bump the live-refresh
 * signal rather than writing to the store, except for the two facts the API
 * cannot report afterwards (see there). Geofence crossings are surfaced to the
 * caller instead, because they are a notification rather than a data change.
 */
import { useEffect, useState } from 'react';
import { useRealtime } from './SocketProvider';
import { type RealtimeEvent } from './events';
import { applyRealtimeEvent } from './applyEvent';

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

        // `listen` changes identity once the socket exists, which re-runs
        // this — a subscription made before then was a no-op.
        return listen(`driver.${driverId}`, (event) => {
            if (event.kind === 'order.offered') {
                setState((prev) => ({ ...prev, lastOffer: event }));
            }
            if (event.kind.startsWith('geofence.')) {
                setState((prev) => ({ ...prev, lastGeofenceEvent: event }));
                return;
            }
            applyRealtimeEvent(event);
        });
    }, [driverId, listen]);

    return state;
}

/**
 * Follows one order's own channel while it is on screen: `order.offer_expired`
 * and the lifecycle `order.updated` are broadcast there and not on the
 * driver's channel.
 */
export function useOrderChannel(orderId?: string): void {
    const { listen } = useRealtime();
    useEffect(() => {
        if (!orderId) return;
        return listen(`order.${orderId}`, applyRealtimeEvent);
    }, [orderId, listen]);
}

/**
 * Follows chat channels for new messages. core-api broadcasts lifecycle
 * events on `chat.{id}` and the received-message notification on
 * `chat_channel.{id}`; either one is enough to refetch.
 */
export function useChatChannelSubscriptions(channelIds: string[]): void {
    const { listen } = useRealtime();
    const key = channelIds.filter(Boolean).sort().join(',');
    useEffect(() => {
        if (!key) return;
        const offs = key.split(',').flatMap((id) => [listen(`chat.${id}`, applyRealtimeEvent), listen(`chat_channel.${id}`, applyRealtimeEvent)]);
        return () => offs.forEach((off) => off());
    }, [key, listen]);
}
