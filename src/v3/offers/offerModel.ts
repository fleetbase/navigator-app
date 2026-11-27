/**
 * What an offer card and its pin show, read from the order, and the two small
 * facts the offer screens share that are not part of any order.
 *
 * An offer is an order, so its places are read the way Jobs reads them
 * (`orderPoints`: names and addresses already tidied). Only what the order
 * carries is shown: where it starts and ends, how many waypoints it has, how
 * many items, and cash to collect if any. What a job pays is not in the order
 * and is not shown.
 *
 * The shared facts:
 *
 *   - **offers the driver has answered here** (declined, lost, run out). The
 *     server can keep listing an offer after a decline; it must not come back
 *     onto the deck until the server rings about it again or it has left the
 *     list and returned.
 *   - **whether the Offers screen is in front**, so the incoming overlay does not
 *     rise over a deck the driver is already looking at.
 */
import { useSyncExternalStore } from 'react';
import { payloadOf } from '../data/accessors';
import { cashOnDeliveryOf } from '../data/orderDetails';
import { decodePolyline, haversineM, type LatLng } from '../data/routeGeo';
import { secondsLeft } from '../data/useOffers';
import { formatMeters, formatMoney, type DistanceUnit } from '../format';
import { orderPoints, placeTitle, type OrderPoint } from '../screens/jobs/model';
import type { OrderRecord } from '../data/orderStore';
import type { TrackerRecord } from '../data/useTracker';

export interface OfferSummary {
    id: string;
    /** Every place on the order, in working order. */
    points: OrderPoint[];
    /** Where the job starts. */
    first?: OrderPoint;
    /** Where it ends; absent on an order with a single place. */
    last?: OrderPoint;
    firstTitle?: string;
    lastTitle?: string;
    /** Every place on the order counts as a waypoint, the pickup and the drop-off included. */
    waypointCount: number;
    itemCount: number;
    /** Cash the driver is to collect, already written as money. */
    cash?: string;
}

export function summariseOffer(order: OrderRecord): OfferSummary {
    const points = orderPoints(order);
    const first = points[0];
    const last = points.length > 1 ? points[points.length - 1] : undefined;
    const entities = payloadOf(order).entities;
    const cash = cashOnDeliveryOf(order);
    return {
        id: order.id,
        points,
        first,
        last,
        firstTitle: placeTitle(first),
        lastTitle: placeTitle(last),
        waypointCount: points.length,
        itemCount: Array.isArray(entities) ? entities.filter(Boolean).length : 0,
        cash: cash?.toCollect ? formatMoney(cash.amount, cash.currency) : undefined,
    };
}

export function formatCountdown(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "1.8 km" as the tile draws it: the figure large, the unit small beside it. */
export function splitDistance(meters: number, units: DistanceUnit): { value: string; unit: string } {
    const text = formatMeters(meters, units);
    const at = text.lastIndexOf(' ');
    return at > 0 ? { value: text.slice(0, at), unit: text.slice(at + 1) } : { value: text, unit: '' };
}

/** In a straight line from the phone to where the job starts. Absent when either end is unknown. */
export function metersToPickup(position: LatLng | null | undefined, summary: OfferSummary): number | undefined {
    return position && summary.first?.point ? haversineM(position, summary.first.point) : undefined;
}

/**
 * The road from the offer's first place to its last, from the order's tracker.
 *
 * The tracker's line can begin at a driver (an order someone is working), and an
 * offer has none, so the line is cut to start at the point nearest the pickup:
 * whatever leads up to it is not part of the trip. Empty when the tracker has no
 * road to give; the map then joins the places with a dashed straight line.
 */
export function offerRoad(tracker: TrackerRecord | null | undefined, summary: OfferSummary): LatLng[] {
    const line = decodePolyline(tracker?.route?.polyline);
    if (line.length < 2) return [];
    const start = summary.first?.point;
    if (!start) return line;
    let nearest = 0;
    let best = Infinity;
    line.forEach((point, index) => {
        const distance = haversineM(point, start);
        if (distance < best) {
            best = distance;
            nearest = index;
        }
    });
    const cut = line.slice(nearest);
    return cut.length > 1 ? cut : [];
}

/** The length of a line, point to point. */
export function lineLengthM(line: LatLng[]): number {
    let total = 0;
    for (let index = 1; index < line.length; index += 1) total += haversineM(line[index - 1], line[index]);
    return total;
}

/* -- The countdown ring: how much of the offer's time is left. ----------------- */

/**
 * The server says how long is left, not how long the offer was for. The longest
 * time left this phone has seen for an offer stands in for its whole length, so
 * the ring starts full when the offer arrives and empties from there.
 */
const longestLeft = new Map<string, number>();

export function fractionLeft(order: OrderRecord, left: number): number {
    const key = `${order.id}@${(order as { adhoc_offer?: { expires_at?: string | null } | null }).adhoc_offer?.expires_at ?? ''}`;
    const longest = Math.max(longestLeft.get(key) ?? 0, left);
    longestLeft.set(key, longest);
    if (longestLeft.size > 200) longestLeft.delete(longestLeft.keys().next().value as string);
    return longest > 0 ? Math.min(1, left / longest) : 0;
}

/* -- Offers answered on this phone. ----------------------------------------- */

const answered = new Map<string, number>();

/** The driver declined it, lost it or let it run out: it leaves the deck. */
export function markOfferAnswered(orderId: string): void {
    answered.set(orderId, Date.now());
}

/**
 * The offers the deck shows: listed by the server, not answered here (unless
 * the server rang about one again since), and with time still on the clock.
 * `keep` is the offer on top, which stays while its last second is shown.
 */
export function openOffers(offers: OrderRecord[], pings: Record<string, number>, now: number, keep?: string): OrderRecord[] {
    const listed = new Set(offers.map((order) => order.id));
    // An offer that left the list is forgotten, so the same job offered again later is shown again.
    for (const id of Array.from(answered.keys())) if (!listed.has(id)) answered.delete(id);
    return offers.filter((order) => {
        const at = answered.get(order.id);
        if (at !== undefined && !((pings[order.id] ?? 0) > at)) return false;
        return order.id === keep || secondsLeft(order, now) !== 0;
    });
}

/** Clears what this module remembers; for tests and for signing out. */
export function resetOfferMemory(): void {
    answered.clear();
    longestLeft.clear();
}

/* -- Is the Offers screen in front? ------------------------------------------- */

let screensOpen = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Called by the Offers screen while it is in front; returns the undo. */
export function noteOffersScreenOpen(): () => void {
    screensOpen += 1;
    listeners.forEach((listener) => listener());
    let undone = false;
    return () => {
        if (undone) return;
        undone = true;
        screensOpen = Math.max(0, screensOpen - 1);
        listeners.forEach((listener) => listener());
    };
}

const isOffersScreenOpen = () => screensOpen > 0;

export function useOffersScreenOpen(): boolean {
    return useSyncExternalStore(subscribe, isOffersScreenOpen, isOffersScreenOpen);
}
