import {
    listCountries,
    isArray,
    hasRequiredKeys,
    isLastIndex,
    stripHtml,
    stripIframeTags,
    isAndroid,
    isApple,
    isVoid,
    isEmpty,
    isResource,
    isFalsy,
    endSession,
    logError,
    mutatePlaces,
    debounce,
    deepGet,
    config,
    sum,
    getColorCode,
} from './Helper';
import { calculatePercentage, haversine } from './Calculate';
import { syncDevice } from './Auth';
import { formatCurrency, capitalize, pluralize, formatDuration, formatKm } from './Format';
import { geocode, getCurrentLocation, getLocation, getDistance } from './Geo';
import { translate } from './Localize';
import getCurrency from './get-currency';

const getActiveOrdersCount = (orders = []) => {
    if (!isArray(orders)) {
        return 0;
    }

    let count = 0;

    for (let index = 0; index < orders.length; index++) {
        const order = orders.objectAt(index);

        if (order.getAttribute('status') === 'canceled' || order.getAttribute('status') === 'completed') {
            return;
        }

        count += 1;
    }

    return count;
};

const getTotalStops = (orders = []) => {
    if (!isArray(orders)) {
        return 0;
    }

    let stops = 0;

    for (let index = 0; index < orders.length; index++) {
        const order = orders.objectAt(index);

        if (order.getAttribute('status') === 'canceled' || order.getAttribute('status') === 'completed' || !order.isAttributeFilled('payload')) {
            return;
        }

        stops += order.getAttribute('payload.waypoints.length') + 2;
    }

    return stops;
};

const getTotalDuration = (orders = []) => {
    if (!isArray(orders)) {
        return 0;
    }

    let duration = 0;

    for (let index = 0; index < orders.length; index++) {
        const order = orders.objectAt(index);

        if (order.getAttribute('status') === 'canceled' || order.getAttribute('status') === 'completed' || !order.isAttributeFilled('payload')) {
            return;
        }

        duration += order.getAttribute('time');
    }

    return duration;
};

const getTotalDistance = (orders = []) => {
    if (!isArray(orders)) {
        return 0;
    }

    let distance = 0;

    for (let index = 0; index < orders.length; index++) {
        const order = orders.objectAt(index);

        if (order.getAttribute('status') === 'canceled' || order.getAttribute('status') === 'completed' || !order.isAttributeFilled('payload')) {
            return;
        }

        distance += order.getAttribute('distance');
    }

    return distance;
};

export {
    listCountries,
    isArray,
    hasRequiredKeys,
    isLastIndex,
    stripHtml,
    stripIframeTags,
    isAndroid,
    isApple,
    isVoid,
    isEmpty,
    isResource,
    isFalsy,
    endSession,
    logError,
    calculatePercentage,
    haversine,
    syncDevice,
    formatCurrency,
    capitalize,
    pluralize,
    formatDuration,
    formatKm,
    geocode,
    getCurrentLocation,
    getLocation,
    mutatePlaces,
    debounce,
    deepGet,
    config,
    sum,
    translate,
    getColorCode,
    getCurrency,
    getDistance,
    getActiveOrdersCount,
    getTotalStops,
    getTotalDuration,
    getTotalDistance
};