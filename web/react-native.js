/** react-native for the web: react-native-web, plus the APIs app code guards by platform. */
export * from 'react-native-web';

export const PermissionsAndroid = {
    PERMISSIONS: {},
    RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
    check: async () => false,
    request: async () => 'denied',
    requestMultiple: async () => ({}),
};

export const ActionSheetIOS = { showActionSheetWithOptions() {}, showShareActionSheetWithOptions() {} };
