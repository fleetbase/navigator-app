import Fleetbase from '@fleetbase/sdk';
import config from 'config';
import { getString, get } from 'utils/Storage';
let { FLEETBASE_KEY, FLEETBASE_HOST, FLEETBASE_NAMESPACE } = config;
import Config from 'react-native-config';
const useFleetbase = () => {
    let _DRIVER = get('driver');
    let _FLEETBASE_KEY = getString('_FLEETBASE_KEY');
    let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');

    if (_FLEETBASE_KEY) {
        FLEETBASE_KEY = _FLEETBASE_KEY;
    }

    console.log(Config);

    if (_FLEETBASE_HOST) {
        FLEETBASE_HOST = _FLEETBASE_HOST;
    }

    if (typeof _DRIVER === 'object' && typeof _DRIVER?.token === 'string') {
        console.log('Driver: ', _DRIVER);
        FLEETBASE_KEY = _DRIVER.token;
    }

    console.log('_FLEETBASE_HOST', FLEETBASE_HOST);
    console.log('_FLEETBASE_KEY', FLEETBASE_KEY);

    const fleetbase = new Fleetbase(FLEETBASE_KEY, {
        host: FLEETBASE_HOST,
        namespace: FLEETBASE_NAMESPACE,
    });

    return fleetbase;
};

export default useFleetbase;
