import Fleetbase from '@fleetbase/sdk';
import config from 'config';
import { isObject } from 'utils';
import { get, getString } from 'utils/Storage';

const useFleetbase = (namespace) => {
    let { FLEETBASE_KEY, FLEETBASE_HOST, FLEETBASE_NAMESPACE } = config;
    let _DRIVER = get('driver');
    let _FLEETBASE_KEY = getString('_FLEETBASE_KEY');
    let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');

    if (_FLEETBASE_KEY) {
        FLEETBASE_KEY = _FLEETBASE_KEY;
    }

    if (_FLEETBASE_HOST) {
        FLEETBASE_HOST = _FLEETBASE_HOST;
    }

    if (isObject(_DRIVER) && typeof _DRIVER.token === 'string') {
        FLEETBASE_KEY = _DRIVER.token;
    }

    const fleetbase = new Fleetbase(FLEETBASE_KEY, {
        host: FLEETBASE_HOST,
        namespace: FLEETBASE_NAMESPACE ?? namespace,
    });

    return fleetbase;
};

export default useFleetbase;
