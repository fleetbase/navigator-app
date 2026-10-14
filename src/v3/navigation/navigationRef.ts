/**
 * The root navigator, for the few things that navigate from outside a screen.
 *
 * A tapped push arrives through a listener, not a screen, and may arrive
 * before the container has mounted (the app was opened *by* the push). The
 * navigation is held until the container reports ready rather than dropped.
 */
import { createNavigationContainerRef, type ParamListBase } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<ParamListBase>();

let pending: (() => void) | null = null;

export function navigateWhenReady(go: () => void): void {
    if (navigationRef.isReady()) {
        go();
        return;
    }
    // Only the latest matters — a second tap supersedes the first.
    pending = go;
}

/** Hand to `NavigationContainer`'s `onReady`. */
export function flushPendingNavigation(): void {
    const go = pending;
    pending = null;
    go?.();
}

/** Opens an order from anywhere, keeping the Orders list beneath it. */
export function openOrder(orderId: string): void {
    navigateWhenReady(() => navigationRef.navigate('Orders', { screen: 'OrderDetail', params: { orderId }, initial: false }));
}

export function openOrdersList(): void {
    navigateWhenReady(() => navigationRef.navigate('Orders', { screen: 'OrdersHome' }));
}

export function openConversation(channelId: string): void {
    navigateWhenReady(() => navigationRef.navigate('Inbox', { screen: 'Conversation', params: { channelId }, initial: false }));
}
