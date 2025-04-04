import { View } from 'react-native';
import InstanceLinkHandler from '../components/InstanceLinkHandler';

const AppLayout = ({ children, state, descriptors, navigation: tabNavigation }) => {
    return (
        <>
            <View style={{ width: '100%', height: '100%', flex: 1 }}>{children}</View>
            <InstanceLinkHandler />
        </>
    );
};

export default AppLayout;
