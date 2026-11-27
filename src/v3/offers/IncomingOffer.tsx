/**
 * The incoming offer: a job offered to this driver rises over whatever screen
 * they are on, as the offers deck over its map (`OfferDeck`).
 *
 * Before this existed an offer only lit the Offers button on Jobs. A driver on
 * Home, in a chat or on an order never saw it, and an offer made to them alone
 * ran out unanswered.
 *
 * **What raises it.** The offers query (`useOffers`) is the source: an order is
 * shown only while the server lists it as one this driver can take, so an order
 * that is simply assigned to them, or the console's "ping driver" about one, never
 * appears here. Of the listed offers, one is raised when
 *
 *   - the server just rang about it (`order.ping` on the driver's channel, or
 *     the `order_ping` push while the app is open), or
 *   - it appeared in the list after the app was already running, or
 *   - it carries a countdown, which means it is offered to this driver alone and
 *     is running out, including one already open when the app starts.
 *
 * A job that was already listed for everyone when the app opened is left on the
 * Offers screen until the server rings about it again.
 *
 * **What is shown.** The deck, with the offer that raised it on top and every
 * other open offer behind it. The offer on top is not swapped for a newer one
 * while the driver is looking at it, because Accept must never change meaning
 * under a thumb: a newer one joins the back of the deck. The phone gives one
 * short vibration per offer when it arrives.
 *
 * **Answering.** Accept and decline are the calls the Offers screen makes
 * (`orders/{id}/start`, `orders/{id}/decline`), with the same rule: never
 * queued. The round close button (and Android's back) puts the deck away and
 * declines nothing; the offers stay on the Offers screen, and the next offer the
 * server rings about raises the deck again. When the Offers screen is already in
 * front, nothing is raised: the driver is looking at the same deck.
 *
 * **Drawn in the tree, not in a `Modal`.** iOS presents one native modal at a
 * time: a second one asked for while a sheet or the item pager is open is
 * dropped without a word, and an offer must not be the thing that is dropped.
 * So this is an ordinary view laid over the whole app, tab bar included. The
 * cost is that a native modal already open stays in front of it until it is
 * closed; it is not disturbed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Keyboard, Platform, StyleSheet, Vibration } from 'react-native';
import { useTranslation } from '../i18n/useTranslation';
import { useDuty } from '../shell';
import { useOfferSignals } from '../realtime/offerSignals';
import { useOffers, secondsLeft } from '../data/useOffers';
import { openOrder } from '../navigation/navigationRef';
import type { OrderRecord } from '../data/orderStore';
import { OfferDeck } from './OfferDeck';
import { useOffersScreenOpen } from './offerModel';

export { formatCountdown } from './offerModel';

const IN_MS = 240;
const OUT_MS = 180;

/**
 * Which listed offer to raise, and bookkeeping for the ones already answered.
 *
 * Kept in refs because none of it is drawn: it only decides what `shown` becomes.
 */
function useRaisedOffer(offers: OrderRecord[] | null, listening: boolean) {
    const signals = useOfferSignals();
    /** Offer id → when it was raised (a ping's time, or when it was first seen). */
    const raised = useRef(new Map<string, number>());
    /**
     * Offers the driver has put away or answered, and when. Not raised again
     * while still listed, unless the server rings about one after that: "not
     * now" is not "no", and a job dispatch offers again should be seen again.
     */
    const answered = useRef(new Map<string, number>());
    /** Offers already listed when the app started, not yet rung about. */
    const listedAtStart = useRef(new Set<string>());
    const started = useRef(false);
    const [candidate, setCandidate] = useState<OrderRecord | null>(null);
    const [othersOpen, setOthersOpen] = useState(0);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        if (!listening) {
            // Offline or signed out: coming back online starts over, like opening the app.
            raised.current.clear();
            answered.current.clear();
            listedAtStart.current.clear();
            started.current = false;
            setCandidate(null);
            setOthersOpen(0);
            return;
        }
        if (!offers) return;
        const now = Date.now();
        const open = offers.filter((order) => secondsLeft(order, now) !== 0);
        const ids = new Set(open.map((order) => order.id));

        // An offer that left the list is forgotten, so the same job offered again later rises again.
        for (const id of Array.from(raised.current.keys())) if (!ids.has(id)) raised.current.delete(id);
        for (const id of Array.from(answered.current.keys())) if (!ids.has(id)) answered.current.delete(id);
        for (const id of Array.from(listedAtStart.current)) if (!ids.has(id)) listedAtStart.current.delete(id);

        for (const order of open) {
            const pingedAt = signals.pings[order.id];
            if (raised.current.has(order.id)) {
                // Rung again: it is the newest once more, though one already put away stays put away.
                if (pingedAt) raised.current.set(order.id, Math.max(pingedAt, raised.current.get(order.id) ?? 0));
                continue;
            }
            const timed = secondsLeft(order, now) !== null;
            if (pingedAt) raised.current.set(order.id, pingedAt);
            else if (timed) raised.current.set(order.id, now);
            else if (!started.current) listedAtStart.current.add(order.id);
            else if (!listedAtStart.current.has(order.id)) raised.current.set(order.id, now);
        }
        started.current = true;

        let newest: OrderRecord | null = null;
        let newestAt = -1;
        for (const order of open) {
            const at = raised.current.get(order.id);
            if (at === undefined) continue;
            const answeredAt = answered.current.get(order.id);
            if (answeredAt !== undefined && at <= answeredAt) continue;
            if (at > newestAt) {
                newest = order;
                newestAt = at;
            }
        }
        setCandidate(newest);
        setOthersOpen(open.length);
    }, [offers, listening, signals, revision]);

    /**
     * The sheet closed, whatever the answer. Every offer raised so far is put
     * away with it: the others were on the sheet as a count with a way to the
     * Offers screen, and raising them one after another as each is dismissed
     * would be a stack of sheets by another name. Only an offer the server rings
     * about after this raises the sheet again.
     */
    const putAway = useCallback(() => {
        const at = Date.now();
        for (const id of raised.current.keys()) answered.current.set(id, at);
        setCandidate(null);
        setRevision((n) => n + 1);
    }, []);

    return { candidate, openCount: othersOpen, putAway, signals };
}

/** One short buzz for an offer that arrives while the app is open. Never throws: a phone that cannot vibrate still shows the offer. */
function buzz(): void {
    try {
        if (AppState.currentState !== 'active') return;
        // iOS has one length of vibration; Android takes a pattern, here two short beats.
        if (Platform.OS === 'android') Vibration.vibrate([0, 160, 110, 160]);
        else Vibration.vibrate();
    } catch {
        // Nothing to do.
    }
}

/**
 * Mount once, above the tabs. Draws nothing until an offer is raised.
 */
export function IncomingOfferHost({ driverId, organizationName }: { driverId?: string; organizationName?: string }) {
    const { t } = useTranslation();
    const { duty } = useDuty();
    // Offers are only asked for while the driver is online, as on Jobs.
    const listening = duty !== 'off' && !!driverId;
    const { offers, reload } = useOffers(listening ? driverId : undefined);
    const { candidate, putAway } = useRaisedOffer(offers, listening);
    const offersScreenOpen = useOffersScreenOpen();

    const [visible, setVisible] = useState(false);
    /** The offer that raised the deck: it starts on top. */
    const [leadId, setLeadId] = useState<string | undefined>(undefined);
    /** A new deck each time it is raised, so it never opens on what the last one was showing. */
    const [session, setSession] = useState(0);
    /** Offers already buzzed for: once each, not again while it stays listed. */
    const buzzed = useRef(new Set<string>());

    const candidateId = candidate?.id;
    useEffect(() => {
        if (!candidateId) return;
        if (!buzzed.current.has(candidateId)) {
            if (buzzed.current.size > 200) buzzed.current.clear();
            buzzed.current.add(candidateId);
            buzz();
        }
        // The Offers screen is in front: the offer has joined the deck the driver is looking at.
        if (offersScreenOpen) {
            putAway();
            return;
        }
        // Already up: the new offer joins the back of the deck. The one on top is never swapped.
        if (visible) return;
        setLeadId(candidateId);
        setSession((n) => n + 1);
        setVisible(true);
        Keyboard.dismiss();
        AccessibilityInfo.announceForAccessibility(t('offers.overlay.title'));
    }, [candidateId, visible, offersScreenOpen, putAway, t]);

    const close = useCallback(() => {
        putAway();
        setVisible(false);
    }, [putAway]);

    const accepted = useCallback(
        (orderId: string) => {
            putAway();
            setVisible(false);
            openOrder(orderId);
            void reload();
        },
        [putAway, reload]
    );

    return (
        <RisingLayer visible={visible}>
            <OfferDeck
                key={session}
                mode="overlay"
                driverId={driverId}
                offers={offers ?? []}
                reload={reload}
                leadId={leadId}
                organizationName={organizationName}
                onPutAway={close}
                onEmpty={close}
                onAccepted={accepted}
            />
        </RisingLayer>
    );
}

/**
 * The layer the deck is drawn in: over everything in the tree, faded in and out
 * in place. Stays mounted until the closing fade has finished.
 */
function RisingLayer({ visible, children }: { visible: boolean; children: React.ReactNode }) {
    const progress = useRef(new Animated.Value(0)).current;
    const [mounted, setMounted] = useState(visible);

    useEffect(() => {
        let cancelled = false;
        if (visible) setMounted(true);
        AccessibilityInfo.isReduceMotionEnabled()
            .catch(() => false)
            .then((reduced) => {
                if (cancelled) return;
                if (reduced) {
                    progress.setValue(visible ? 1 : 0);
                    if (!visible) setMounted(false);
                    return;
                }
                Animated.timing(progress, {
                    toValue: visible ? 1 : 0,
                    duration: visible ? IN_MS : OUT_MS,
                    easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
                    useNativeDriver: true,
                }).start(({ finished }) => {
                    if (finished && !visible && !cancelled) setMounted(false);
                });
            });
        return () => {
            cancelled = true;
        };
    }, [visible, progress]);

    if (!mounted) return null;

    return (
        <Animated.View style={[styles.root, { opacity: progress }]} pointerEvents={visible ? 'auto' : 'none'} accessibilityViewIsModal testID="incoming-offer">
            {children}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    // Above the tabs, the toasts and the portals; `elevation` is what puts it in front on Android.
    // Written out: the style sheet's "absolute fill object" no longer exists in this React Native, and spreading it
    // gave the layer no position at all, so it had no height and only the deck's bottom-anchored card showed.
    root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, elevation: 1000 },
});

export default IncomingOfferHost;
