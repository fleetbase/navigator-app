/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

const mockProvider = ({ children }) => <>{children}</>;

jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: mockProvider }));
jest.mock('tamagui', () => ({ TamaguiProvider: mockProvider, Theme: mockProvider }));
jest.mock('@backpackapp-io/react-native-toast', () => ({ Toasts: () => null }));
jest.mock('@gorhom/portal', () => ({ PortalProvider: mockProvider, PortalHost: () => null }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: mockProvider }));
jest.mock('@gorhom/bottom-sheet', () => ({ BottomSheetModalProvider: mockProvider }));
jest.mock('../src/contexts/AuthContext', () => ({ AuthProvider: mockProvider }));
jest.mock('../src/contexts/SocketClusterContext', () => ({ SocketClusterProvider: mockProvider }));
jest.mock('../src/contexts/OrderManagerContext', () => ({ OrderManagerProvider: mockProvider }));
jest.mock('../src/contexts/LanguageContext', () => ({ LanguageProvider: mockProvider }));
jest.mock('../src/contexts/TempStoreContext', () => ({ TempStoreProvider: mockProvider }));
jest.mock('../src/contexts/NotificationContext', () => ({ NotificationProvider: mockProvider }));
jest.mock('../src/contexts/ChatContext', () => ({ ChatProvider: mockProvider }));
jest.mock('../src/contexts/LocationContext', () => ({ LocationProvider: mockProvider }));
jest.mock('../src/contexts/ConfigContext', () => ({ ConfigProvider: mockProvider }));
jest.mock('../src/contexts/ThemeContext', () => ({
    ThemeProvider: mockProvider,
    useThemeContext: () => ({ appTheme: 'light' }),
}));
jest.mock('../src/navigation/AppNavigator', () => () => null);
jest.mock('../tamagui.config', () => ({}));

const App = require('../App').default;

test('renders correctly', async () => {
    await ReactTestRenderer.act(() => {
        ReactTestRenderer.create(<App />);
    });
});
