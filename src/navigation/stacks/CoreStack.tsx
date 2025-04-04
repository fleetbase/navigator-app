import BootScreen from '../../screens/BootScreen';
import TestScreen from '../../screens/TestScreen';
import LocationPermissionScreen from '../../screens/LocationPermissionScreen';
import InstanceLinkScreen from '../../screens/InstanceLinkScreen';
import { getTheme } from '../../utils';
import { Text } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import HeaderButton from '../../components/HeaderButton';

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

export const InstanceLink = {
    screen: InstanceLinkScreen,
    options: ({ navigation }) => {
        return {
            headerTitle: '',
            presentation: 'modal',
            headerLeft: (props) => (
                <Text color='$textPrimary' fontSize={20} fontWeight='bold'>
                    Connection Config
                </Text>
            ),
            headerRight: (props) => <HeaderButton icon={faTimes} onPress={() => navigation.goBack()} />,
            headerStyle: {
                backgroundColor: getTheme('background'),
                headerTintColor: getTheme('borderColor'),
            },
        };
    },
};

export const Test = {
    screen: TestScreen,
};

const CoreStack = {
    Boot,
    Test,
    LocationPermission,
    InstanceLink,
};

export default CoreStack;
