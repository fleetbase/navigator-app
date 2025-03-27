import BootScreen from '../../screens/BootScreen';
import TestScreen from '../../screens/TestScreen';
import LocationPermissionScreen from '../../screens/LocationPermissionScreen';

export const Boot = {
    screen: BootScreen,
    options: {
        headerShown: false,
        gestureEnabled: false,
        animation: 'none',
    },
};

export const LocationPermission = {
    screen: LocationPermissionScreen,
    options: {
        headerShown: false,
        gestureEnabled: false,
        animation: 'none',
    },
};

export const Test = {
    screen: TestScreen,
};

const CoreStack = {
    Boot,
    Test,
    LocationPermission,
};

export default CoreStack;
