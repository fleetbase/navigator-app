/**
 * Choosing which of an order's stops the driver is heading to — R2 D2.
 *
 * `POST|PATCH /v1/orders/{id}/set-destination/{placeId}` is public and always
 * was; the ledger had this blocked on a `PATCH orders/{id}/waypoints` that was
 * never going to be built, because the capability already shipped under another
 * name (see 07-BLOCKER-AUDIT.md).
 *
 * The `{placeId}` segment is generous — `resolveServiceStopFromKey` matches a
 * place uuid, a place public id, a waypoint uuid, a waypoint public id, or a
 * waypoint's `place_uuid`. What it will *not* match is anything outside the
 * order's own payload, which answers **422 "Place resource is not a valid
 * destination."** So the endpoint is inherently scoped to this order's stops,
 * and the app does not have to police that itself.
 */
import { useCallback, useState } from 'react';
import { useFleetbase } from '../api';
import { isQueuedAck } from '../api/NavigatorAdapter';
import { orderStore } from './orderStore';

export type SetDestinationOutcome = 'set' | 'queued' | 'failed';

export function useSetDestination(orderId?: string) {
    const { adapter } = useFleetbase();
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setDestination = useCallback(
        async (placeId: string): Promise<SetDestinationOutcome> => {
            if (!orderId || !placeId) return 'failed';
            setIsSaving(true);
            setError(null);
            try {
                const result = await adapter.post(`orders/${orderId}/set-destination/${placeId}`);
                if (isQueuedAck(result)) return 'queued';
                /*
                 * The endpoint answers with the refreshed order, so the new
                 * `payload.current_waypoint` comes back in the same round trip.
                 * Storing it means nothing has to be guessed locally and every
                 * screen reading the order sees the server's own version.
                 */
                const order = (result as { data?: unknown })?.data ?? result;
                if (order && typeof order === 'object' && 'id' in order) {
                    orderStore.upsert(order as Parameters<typeof orderStore.upsert>[0]);
                }
                return 'set';
            } catch (err) {
                setError((err as Error).message);
                return 'failed';
            } finally {
                setIsSaving(false);
            }
        },
        [adapter, orderId]
    );

    return { setDestination, isSaving, error };
}

/**
 * The identifier to send for a stop.
 *
 * A uuid is preferred over a public id only because the tracker gives both and
 * the uuid is the one the server matches first; either resolves.
 */
export function destinationKeyOf(stop?: { uuid?: string; public_id?: string } | null): string | undefined {
    return stop?.uuid ?? stop?.public_id ?? undefined;
}
