import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking, Pressable, Text as NativeText, View } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import LocationPermissionScreen from '../src/screens/LocationPermissionScreen';

const mockNavigation = { reset: jest.fn() };

jest.mock('@react-navigation/native', () => ({
    useNavigation: () => mockNavigation,
    useFocusEffect: (effect) => require('react').useEffect(effect, [effect]),
}));

jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native-permissions', () => ({
    check: jest.fn(),
    request: jest.fn(),
    PERMISSIONS: {
        ANDROID: { ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION' },
        IOS: { LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE' },
    },
    RESULTS: { DENIED: 'denied', BLOCKED: 'blocked', GRANTED: 'granted' },
}));

jest.mock('@fortawesome/react-native-fontawesome', () => ({
    FontAwesomeIcon: () => {
        const React = require('react');
        const { View } = require('react-native');
        return <View />;
    },
}));

jest.mock('../src/hooks/use-dimensions', () => () => ({ screenWidth: 400 }));
jest.mock('../src/utils/location', () => ({ requestWebGeolocationPermission: jest.fn() }));
jest.mock('../src/contexts/LanguageContext', () => ({
    useLanguage: () => ({
        t: (key) =>
            ({
                'LocationPermissionScreen.enableLocationServices': 'Location Data Disclosure',
                'LocationPermissionScreen.enableLocationPrompt':
                    'Fleetbase Navigator collects precise location data to enable real-time driver tracking and order progress updates for your organization’s dispatchers and operations team, even when the app is closed or not in use. Location is collected while you are online and is sent securely to Fleetbase.',
                'LocationPermissionScreen.shareAndContinue': 'Allow location and continue',
                'LocationPermissionScreen.privacyPolicy': 'Privacy Policy',
                'LocationPermissionScreen.permissionNeededTitle': 'Location Permission Needed',
                'LocationPermissionScreen.enableInSettingsTitle': 'Enable Location in Settings',
                'LocationPermissionScreen.permissionDeniedPrompt': 'Location access is required before you can sign in.',
                'LocationPermissionScreen.locationBlockedPrompt': 'Location access has been blocked.',
                'LocationPermissionScreen.goToSettings': 'Go to Settings',
                'common.cancel': 'Cancel',
                'common.tryAgain': 'Try Again',
            })[key] ?? key,
    }),
}));

jest.mock('tamagui', () => {
    const React = require('react');
    const { Pressable, Text: NativeText, View } = require('react-native');
    const Button = ({ children, onPress, accessibilityRole }) => (
        <Pressable onPress={onPress} accessibilityRole={accessibilityRole}>
            {children}
        </Pressable>
    );
    Button.Text = NativeText;

    const AlertDialog = ({ open, children }) => (open ? <View>{children}</View> : null);
    AlertDialog.Portal = View;
    AlertDialog.Overlay = View;
    AlertDialog.Content = View;
    AlertDialog.Title = NativeText;
    AlertDialog.Description = NativeText;

    return { AlertDialog, Button, Image: View, Text: NativeText, XStack: View, YStack: View };
});

const textFrom = (node) =>
    node
        .findAllByType(NativeText)
        .map((item) => item.props.children)
        .flat(Infinity)
        .join(' ');
const findButton = (root, label) => root.findAll((node) => typeof node.props.onPress === 'function' && textFrom(node).includes(label))[0];

describe('LocationPermissionScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(require('react-native').Platform, 'OS', { configurable: true, value: 'android' });
        check.mockResolvedValue(RESULTS.DENIED);
        request.mockResolvedValue(RESULTS.DENIED);
    });

    test('shows the prominent disclosure before requesting Android location and provides no login bypass', async () => {
        let renderer;
        await ReactTestRenderer.act(async () => {
            renderer = ReactTestRenderer.create(<LocationPermissionScreen />);
        });

        const renderedText = textFrom(renderer.root);
        expect(renderedText).toContain('collects precise location data');
        expect(renderedText).toContain('even when the app is closed or not in use');
        expect(renderedText).toContain('dispatchers and operations team');
        expect(renderedText).not.toContain('Skip for now');
        expect(request).not.toHaveBeenCalled();

        const allowButton = findButton(renderer.root, 'Allow location and continue');
        await ReactTestRenderer.act(async () => {
            await allowButton.props.onPress();
        });

        expect(request).toHaveBeenCalledWith(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        expect(mockNavigation.reset).not.toHaveBeenCalled();
    });

    test('checks the Android permission on focus and continues only after it is granted', async () => {
        check.mockResolvedValue(RESULTS.GRANTED);

        await ReactTestRenderer.act(async () => {
            ReactTestRenderer.create(<LocationPermissionScreen />);
        });

        expect(check).toHaveBeenCalledWith(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
        expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Boot' }] });
    });

    test('opens the public privacy policy directly from the disclosure', async () => {
        jest.spyOn(Linking, 'openURL').mockResolvedValue();
        let renderer;
        await ReactTestRenderer.act(async () => {
            renderer = ReactTestRenderer.create(<LocationPermissionScreen />);
        });

        const privacyButton = findButton(renderer.root, 'Privacy Policy');
        await ReactTestRenderer.act(async () => {
            await privacyButton.props.onPress();
        });

        expect(Linking.openURL).toHaveBeenCalledWith('https://www.fleetbase.io/privacy-policy');
    });
});
