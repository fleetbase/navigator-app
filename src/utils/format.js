import getCurrency from './currencies';
import countryLocaleMap from 'country-locale-map';
import { isNone, isArray, isObject, defaults } from './';
import { isToday, isYesterday, isThisWeek, isThisYear, format, differenceInMinutes, differenceInHours } from 'date-fns';

export const defaultCurrenyOptions = {
    symbol: '$', // default currency symbol is '$'
    format: '%s%v', // controls output: %s = symbol, %v = value (can be object, see docs)
    decimal: '.', // decimal point separator
    thousand: ',', // thousands separator
    precision: 2, // decimal places
    grouping: 3, // digit grouping (not implemented yet)
};

export const defaultNumberOptions = {
    precision: 0, // default precision on numbers is 0
    grouping: 3, // digit grouping (not implemented yet)
    thousand: ',',
    decimal: '.',
};

export function toFixed(value, precision = 2) {
    precision = checkPrecision(precision, defaultNumberOptions.precision);
    const power = Math.pow(10, precision);

    // Multiply up by precision, round accurately, then divide and use native toFixed():
    return (Math.round(unformat(value) * power) / power).toFixed(precision);
}

export function formatNumber(number, precision = 2, thousand = ',', decimal = '.') {
    // Resursively format arrays:
    if (isArray(number)) {
        return number.map(function (val) {
            return formatNumber(val, precision, thousand, decimal);
        });
    }

    // Clean up number:
    number = unformat(number);

    // Build options object from second param (if object) or all params, extending defaults:
    const opts = defaults(
        isObject(precision)
            ? precision
            : {
                  precision: precision,
                  thousand: thousand,
                  decimal: decimal,
              },
        defaultNumberOptions
    );

    // Clean up precision
    const usePrecision = checkPrecision(opts.precision);

    // Do some calc:
    const fixedNumber = toFixed(number || 0, usePrecision);
    const negative = fixedNumber < 0 ? '-' : '';
    const base = String(parseInt(Math.abs(fixedNumber), 10));
    const mod = base.length > 3 ? base.length % 3 : 0;

    // Format the number:
    return (
        negative +
        (mod ? base.substr(0, mod) + opts.thousand : '') +
        base.substr(mod).replace(/(\d{3})(?=\d)/g, '$1' + opts.thousand) +
        (usePrecision ? opts.decimal + toFixed(Math.abs(number), usePrecision).split('.')[1] : '')
    );
}

export function unformat(value, decimal = '') {
    // Recursively unformat arrays:
    if (isArray(value)) {
        return value.map(function (val) {
            return unformat(val, decimal);
        });
    }

    // Fails silently (need decent errors):
    value = value || 0;

    // Return the value as-is if it's already a number:
    if (typeof value === 'number') {
        return value;
    }

    // Default decimal point comes from settings, but could be set to eg. "," in opts:
    decimal = decimal || defaultNumberOptions.decimal;

    // Build regex to strip out everything except digits, decimal point and minus sign:
    const regex = new RegExp('[^0-9-' + decimal + ']', ['g']);
    const unformatted = parseFloat(
        ('' + value)
            .replace(/\((.*)\)/, '-$1') // replace bracketed values with negatives
            .replace(regex, '') // strip out any cruft
            .replace(decimal, '.') // make sure decimal point is standard
    );

    // This will fail silently which may cause trouble, let's wait and see:
    return !isNaN(unformatted) ? unformatted : 0;
}

export function checkCurrencyFormat(format) {
    const defaults = defaultCurrenyOptions.format;

    // Allow function as format parameter (should return string or object):
    if (typeof format === 'function') {
        format = format();
    }

    // Format can be a string, in which case `value` ("%v") must be present:
    if (typeof format === 'string' && format.match('%v')) {
        // Create and return positive, negative and zero formats:
        return {
            pos: format,
            neg: format.replace('-', '').replace('%v', '-%v'),
            zero: format,
        };

        // If no format, or object is missing valid positive value, use defaults:
    } else if (!format || !format.pos || !format.pos.match('%v')) {
        // If defaults is a string, casts it to an object for faster checking next time:
        if (typeof defaults !== 'string') {
            return defaults;
        } else {
            return (defaultCurrenyOptions.format = {
                pos: defaults,
                neg: defaults.replace('%v', '-%v'),
                zero: defaults,
            });
        }
    }
    // Otherwise, assume format was fine:
    return format;
}

export function checkPrecision(val, base) {
    val = Math.round(Math.abs(val));
    return isNaN(val) ? base : val;
}

export function formatCurrency(amount = 0, currency = 'USD', currencyDisplay = 'symbol', options = {}) {
    if (isNone(currency)) {
        currency = 'USD';
    }

    const currencyData = getCurrency(currency);
    const locale = countryLocaleMap.getLocaleByAlpha2(currencyData.iso2).replace('_', '-');

    if (currencyData?.precision === 0) {
        options.minimumFractionDigits = 0;
        options.maximumFractionDigits = 0;
    }

    return formatMoney(!currencyData.decimalSeparator ? amount : amount / 100, currencyData.symbol, currencyData.precision, currencyData.thousandSeparator, currencyData.decimalSeparator);
}

export function formatMeters(meters) {
    if (meters < 1000) {
        return `${meters} meters`;
    } else {
        const km = meters / 1000;
        // Round to one decimal place
        const roundedKm = Math.round(km * 10) / 10;
        return `${roundedKm} km`;
    }
}

export function formatMiles(meters) {
    // 1 mile = 1609.344 meters
    const miles = meters / 1609.344;
    if (miles < 1) {
        // Use two decimals for values under 1 mile
        return `${miles.toFixed(2)} miles`;
    } else {
        // Use one decimal place for values 1 mile or more
        return `${miles.toFixed(1)} miles`;
    }
}

export function truncateString(str, length = 20) {
    if (str.length > length) {
        return str.substring(0, length) + '...';
    }
    return str;
}

export function formatMoney(number, symbol = '$', precision = 2, thousand = ',', decimal = '.', format = '%s%v') {
    // Resursively format arrays:
    if (isArray(number)) {
        return number.map(function (val) {
            return formatMoney(val, symbol, precision, thousand, decimal, format);
        });
    }

    // Clean up number:
    number = unformat(number);

    // Build options object from second param (if object) or all params, extending defaults:
    const opts = defaults(
        isObject(symbol)
            ? symbol
            : {
                  symbol: symbol,
                  precision: precision,
                  thousand: thousand,
                  decimal: decimal,
                  format: format,
              },
        defaultCurrenyOptions
    );

    // Check format (returns object with pos, neg and zero):
    const formats = checkCurrencyFormat(opts.format);

    // Clean up precision
    const usePrecision = checkPrecision(opts.precision);

    // fixedNumber's value is not really used, just used to determine negative or not
    const fixedNumber = toFixed(number || 0, usePrecision);
    // Choose which format to use for this value:
    const useFormat = fixedNumber > 0 ? formats.pos : fixedNumber < 0 ? formats.neg : formats.zero;

    // Return with currency symbol added:
    return useFormat.replace('%s', opts.symbol).replace('%v', formatNumber(Math.abs(number), checkPrecision(opts.precision), opts.thousand, opts.decimal));
}

export function removeNonNumber(string = '') {
    return string.replace(/[^\d]/g, '');
}

export function removeLeadingSpaces(string = '') {
    return string.replace(/^\s+/g, '');
}

export function numbersOnly(input, castInt = true) {
    const numbers = String(input).replace(/[^0-9]/g, '');
    return castInt ? parseInt(numbers) : numbers;
}

export function configCase(str) {
    return uppercase(titleize(str)).replace(/\s+/g, '_');
}

export function titleize(str, separator = ' ') {
    if (!str) {
        return str;
    }

    // Replace camelCase or PascalCase with space-separated words
    const spaced = str
        .replace(/([A-Z])/g, ' $1') // Insert space before uppercase letters
        .replace(/[_\-]+/g, ' ') // Replace underscores or hyphens with space
        .trim();

    // Split into words, capitalize each, and join with spaces
    const words = spaced.split(/\s+/).map((word) => capitalize(word.toLowerCase()));
    return words.join(' ');
}

export function lowercase(str) {
    return str.toLowerCase();
}

export function uppercase(str) {
    return str.toUpperCase();
}

export function capitalize(str) {
    if (str.length === 0) {
        return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function secondsToTime(secs) {
    const hours = Math.floor(secs / (60 * 60));
    const divisor_for_minutes = secs % (60 * 60);
    const minutes = Math.floor(divisor_for_minutes / 60);
    const divisor_for_seconds = divisor_for_minutes % 60;
    const seconds = Math.ceil(divisor_for_seconds);

    const obj = {
        h: hours,
        m: minutes,
        s: seconds,
    };

    return obj;
}

export function formatDuration(secs) {
    let time = secondsToTime(secs);
    let parts = [];

    if (time.h) {
        parts.push(`${time.h}h`);
    }

    if (time.m) {
        parts.push(`${time.m}m`);
    }

    if (parts.length < 2 && time.s) {
        parts.push(`${time.s}s`);
    }

    if (parts.length === 0) {
        parts.push('0s');
    }

    return parts.join(' ');
}

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024; // or 1000 for decimal-based conversion
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function getColorFromStatus(status) {
    status = status?.toLowerCase();

    switch (status) {
        case 'live':
        case 'success':
        case 'operational':
        case 'active':
        case 'completed':
        case 'order_completed':
        case 'pickup_ready':
            return 'green';
        case 'dispatched':
        case 'assigned':
        case 'duplicate':
        case 'requires_update':
            return 'indigo';
        case 'disabled':
        case 'canceled':
        case 'order_canceled':
        case 'incomplete':
        case 'unable':
        case 'failed':
        case 'critical':
        case 'escalated':
            return 'red';
        case 'created':
        case 'warning':
        case 'preparing':
        case 'pending':
        case 'pending_review':
        case 'backlogged':
        case 'in_review':
            return 'yellow';
        case 'enroute':
        case 'driver_enroute':
        case 'started':
            return 'orange';
        case 'info':
        case 'in_progress':
        case 'low':
        case 're_opened':
            return 'blue';
        default:
            return 'yellow';
    }
}

export function formatWhatsAppTimestamp(date) {
    const now = new Date();
    const minutesDiff = differenceInMinutes(now, date);
    const hoursDiff = differenceInHours(now, date);

    // Less than 1 minute ago
    if (minutesDiff < 1) {
        return 'Just now';
    }

    // Less than 60 minutes ago
    if (minutesDiff < 60) {
        return `${minutesDiff} minute${minutesDiff > 1 ? 's' : ''} ago`;
    }

    // Same day
    if (isToday(date)) {
        return format(date, 'p'); // time like 3:45 PM or 15:45
    }

    // Yesterday
    if (isYesterday(date)) {
        return 'Yesterday';
    }

    // Within the current week (not including today or yesterday)
    if (isThisWeek(date, { weekStartsOn: 1 })) {
        return format(date, 'EEEE'); // Day of the week, e.g., "Tuesday"
    }

    // Within this year
    if (isThisYear(date)) {
        return format(date, 'd MMM'); // e.g., "5 Mar"
    }

    // Older than this year
    return format(date, 'MM/dd/yy'); // 03/05/24
}

export function smartHumanize(string) {
    const uppercaseTokens = [
        'api',
        'vat',
        'id',
        'uuid',
        'sku',
        'ean',
        'upc',
        'erp',
        'tms',
        'wms',
        'ltl',
        'ftl',
        'lcl',
        'fcl',
        'rfid',
        'jot',
        'roi',
        'eta',
        'pod',
        'asn',
        'oem',
        'ddp',
        'fob',
        'gsm',
        'etd',
        'eta',
        'ect',
    ];

    return lowercase(titleize(string))
        .split(' ')
        .map((word) => (uppercaseTokens.includes(word) ? uppercase(word) : titleize(word)))
        .join(' ');
}
