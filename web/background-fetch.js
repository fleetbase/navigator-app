/** react-native-background-fetch. A page can't wake itself up, so no task ever fires. */
const BackgroundFetch = {
    STATUS_RESTRICTED: 0,
    STATUS_DENIED: 1,
    STATUS_AVAILABLE: 2,
    configure: async () => BackgroundFetch.STATUS_DENIED,
    start: async () => BackgroundFetch.STATUS_DENIED,
    stop: async () => true,
    finish() {},
    status: async () => BackgroundFetch.STATUS_DENIED,
    scheduleTask: async () => false,
};

export default BackgroundFetch;
