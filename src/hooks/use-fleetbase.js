import Fleetbase from '@fleetbase/sdk';
import config from 'config';
import { getString } from 'utils/Storage';
let { FLEETBASE_KEY, FLEETBASE_HOST } = config;
let fleetbase, adapter;

try {
    let _FLEETBASE_KEY = getString('_FLEETBASE_KEY');
    let _FLEETBASE_HOST = getString('_FLEETBASE_HOST');

    if (_FLEETBASE_KEY) {
        FLEETBASE_KEY = _FLEETBASE_KEY;
    }

    if (_FLEETBASE_HOST) {
        FLEETBASE_HOST = _FLEETBASE_HOST;
    }

    console.log('_FLEETBASE_HOST', FLEETBASE_HOST);
    console.log('_FLEETBASE_KEY', FLEETBASE_KEY);

    fleetbase = new Fleetbase(FLEETBASE_KEY, { host: FLEETBASE_HOST });
    adapter = fleetbase.getAdapter();
} catch (error) {
    fleetbase = error;
}

const useFleetbase = () => {
    return fleetbase;
};

export default useFleetbase;
export { adapter };
