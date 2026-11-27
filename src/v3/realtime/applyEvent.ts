/**
 * What the app does about an event, wherever it arrived from.
 *
 * The same order event can reach the app three ways — the driver's channel,
 * the open order's own channel, and a push — and each used to be handled
 * (or not) separately. One function means a reassignment removes the order
 * whichever way the driver heard about it.
 *
 * Still the rule from `SocketProvider`: an event says *something changed* and
 * the app asks the API what. The exceptions are the two things the API cannot
 * tell us after the fact — that this driver was taken off an order (the order
 * simply stops coming back) and the human summary of an edit.
 */
import { orderStore } from '../data/orderStore';
import type { RealtimeEvent } from './events';
import { affectsOrders } from './events';
import { bumpChatRefresh, bumpLiveRefresh } from './liveRefresh';
import { recordOrderChange } from './orderChanges';
import { noteOfferClosed, noteOfferPing } from './offerSignals';

export function applyRealtimeEvent(event: RealtimeEvent): void {
    if (event.kind === 'chat.message') {
        bumpChatRefresh();
        return;
    }

    if (event.kind === 'order.unassigned') {
        if (event.orderId) orderStore.remove(event.orderId, 'reassigned');
        // Lists and offers re-ask too: the order may now be someone else's offer.
        bumpLiveRefresh();
        return;
    }

    if (event.kind === 'order.changed') {
        const data = (event.raw.data ?? {}) as { changed_by?: unknown };
        recordOrderChange({
            orderId: event.orderId,
            summary: event.summary,
            changes: event.changes,
            changedBy: typeof data.changed_by === 'string' ? data.changed_by : undefined,
        });
    }

    /*
     * Offers. The list is still asked for again below; these only remember which
     * order the server just rang about and how an offer ended, which the list
     * cannot say. The incoming-offer overlay reads both.
     */
    if (event.kind === 'order.offered') noteOfferPing(event.orderId);
    if (event.kind === 'order.offer_closed') {
        const data = (event.raw.data ?? {}) as { status?: unknown };
        noteOfferClosed(event.orderId, data.status);
    }

    if (affectsOrders(event.kind)) bumpLiveRefresh();
}
