import { mergeCatalogue } from '../index';

describe('brand translations', () => {
    it('deep-merge over a catalogue: replace a key, add a namespace, keep the rest', () => {
        const base = { nav: { tabs: { today: 'Today', route: 'Route' } }, common: { ok: 'OK' } };
        const merged = mergeCatalogue(base, { nav: { tabs: { today: 'Shift' } }, Brand: { rewards: 'Rewards' } });
        expect(merged).toEqual({ nav: { tabs: { today: 'Shift', route: 'Route' } }, common: { ok: 'OK' }, Brand: { rewards: 'Rewards' } });
        expect(base.nav.tabs.today).toBe('Today');
    });

    it('apply to the app catalogue when the build ships them', () => {
        jest.resetModules();
        jest.doMock('../../generated/brand-translations', () => ({ __esModule: true, default: { en: { nav: { tabs: { today: 'Shift' } } }, fr: { common: { ok: 'Oui' } } } }));
        const i18n = require('../index');
        expect(i18n.t('nav.tabs.today')).toBe('Shift');
        expect(i18n.t('nav.tabs.orders')).toBe('Orders');
        expect(i18n.availableLocales()).toContain('fr');
        jest.dontMock('../../generated/brand-translations');
        jest.resetModules();
    });
});
