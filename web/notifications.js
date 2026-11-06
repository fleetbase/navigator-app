/**
 * react-native-notifications, on the Notification API.
 *
 * There is no device token for the push service to send to, so remote push never
 * arrives on the web and `registerRemoteNotifications` reports nothing. The socket
 * still keeps the app live while it is open. Local notifications are real.
 */
const listeners = { received: new Set(), opened: new Set(), registered: new Set(), failed: new Set() };

const subscribe = (set, listener) => {
    set.add(listener);
    return { remove: () => set.delete(listener) };
};

const events = {
    registerNotificationReceivedForeground: (listener) => subscribe(listeners.received, listener),
    registerNotificationReceivedBackground: () => ({ remove() {} }),
    registerNotificationOpened: (listener) => subscribe(listeners.opened, listener),
    registerRemoteNotificationsRegistered: (listener) => subscribe(listeners.registered, listener),
    registerRemoteNotificationsRegistrationFailed: (listener) => subscribe(listeners.failed, listener),
    registerRemoteNotificationsRegistrationDenied: () => ({ remove() {} }),
};

function postLocalNotification(notification) {
    const payload = { payload: notification, title: notification.title, body: notification.body };
    listeners.received.forEach((listener) => listener(payload, () => {}));

    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const shown = new Notification(notification.title ?? '', { body: notification.body });
    shown.onclick = () => {
        window.focus();
        listeners.opened.forEach((listener) => listener(payload, () => {}, undefined));
    };
}

export const Notifications = {
    events: () => events,
    ios: { events: () => events, setBadgeCount() {}, getBadgeCount: async () => 0 },
    android: {},
    registerRemoteNotifications() {},
    removeAllDeliveredNotifications() {},
    getInitialNotification: async () => undefined,
    isRegisteredForRemoteNotifications: async () => false,
    postLocalNotification,
};

export default { Notifications };
