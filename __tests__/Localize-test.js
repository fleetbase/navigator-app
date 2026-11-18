jest.mock('../src/utils/storage', () => ({ getString: jest.fn(() => undefined) }));
jest.mock('../src/utils', () => ({ get: jest.fn(), navigatorConfig: jest.fn((key, fallback) => fallback) }));
jest.mock('react-native-i18n', () => ({ __esModule: true, default: require('i18n-js') }));

describe('translate', () => {
    const I18n = require('react-native-i18n').default;
    const { getAvailableLocales, translate } = require('../src/utils/localize');
    I18n.translations = getAvailableLocales();
    I18n.locale = 'en';

    test('fills a placeholder with the value', () => {
        expect(translate('EditLocationScreen.defaultLocationSet', { name: 'Home' })).toBe('Home is now your default location.');
    });

    test.each([[undefined], [null], ['']])('an empty value (%p) leaves the placeholder empty, as the old inline text did', (name) => {
        expect(translate('EditLocationScreen.defaultLocationSet', { name })).toBe(' is now your default location.');
    });

    test('hours keep their short English form for one and for several', () => {
        expect(translate('Format.hoursShort', { count: 1 })).toBe('1h');
        expect(translate('Format.hoursShort', { count: 3 })).toBe('3h');
    });
});
