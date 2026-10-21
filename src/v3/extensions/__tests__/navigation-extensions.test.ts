import { customRoutesFor, orderTabs, validateCustomNavigation, type CustomTab } from '../navigation';
import { CORE_ROUTES } from '../build-navigation';

const load = () => Promise.resolve({ default: () => null });
const icon = () => null;

describe('validateCustomNavigation', () => {
    it('keeps valid routes and tabs', () => {
        const { routes, tabs } = validateCustomNavigation({ Rewards: { load } }, { RewardsTab: { initialRoute: 'Rewards', icon } }, { strict: true });
        expect(Object.keys(routes)).toEqual(['Rewards']);
        expect(Object.keys(tabs)).toEqual(['RewardsTab']);
    });

    it('rejects bad names, missing loaders and tabs without a route or icon', () => {
        expect(() => validateCustomNavigation({ rewards: { load } }, {}, { strict: true })).toThrow(/PascalCase/);
        expect(() => validateCustomNavigation({ Rewards: {} as any }, {}, { strict: true })).toThrow(/PascalCase/);
        expect(() => validateCustomNavigation({ Rewards: { load } }, { Rewards: { initialRoute: 'Rewards', icon } }, { strict: true })).toThrow(/end in "Tab"/);
        expect(() => validateCustomNavigation({}, { RewardsTab: { initialRoute: 'Rewards', icon } }, { strict: true })).toThrow(/isn't a custom route/);
        expect(() => validateCustomNavigation({ Rewards: { load } }, { RewardsTab: { initialRoute: 'Rewards' } as any }, { strict: true })).toThrow(/no icon/);
        expect(() => validateCustomNavigation({ Rewards: { load, presentation: 'sheet' as any } }, {}, { strict: true })).toThrow(/presentation/);
    });

    it('never lets a custom route take a core route name', () => {
        expect(() => validateCustomNavigation({ OrderDetail: { load } }, {}, { coreRoutes: CORE_ROUTES, strict: true })).toThrow(/same name as a core route/);
        expect(() => validateCustomNavigation({ Orders: { load } }, {}, { strict: true })).toThrow(/same name as a core route/);
    });

    it('drops invalid entries with a warning outside development', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { routes } = validateCustomNavigation({ rewards: { load }, Rewards: { load } }, {}, { strict: false });
        expect(Object.keys(routes)).toEqual(['Rewards']);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('customRoutesFor', () => {
    const routes = { Rewards: { load, tabs: ['Account'] }, Everywhere: { load, presentation: 'modal' as const } };

    it('adds a route to the stacks it names, or to every stack', () => {
        expect(customRoutesFor('Account', routes).map((r) => r.name)).toEqual(['Rewards', 'Everywhere']);
        expect(customRoutesFor('Orders', routes).map((r) => r.name)).toEqual(['Everywhere']);
        expect(customRoutesFor('Orders', routes)[0].options).toEqual({ presentation: 'modal' });
    });

    it('gives each route one stable component', () => {
        expect(customRoutesFor('Account', routes)[0].component).toBe(customRoutesFor('Account', routes)[0].component);
    });
});

describe('orderTabs', () => {
    const all = new Set(['Today', 'Route', 'Orders', 'Inbox', 'Account', 'RewardsTab']);
    const custom = (position?: number): Array<[string, CustomTab]> => [['RewardsTab', { initialRoute: 'Rewards', icon, position }]];

    it('keeps the configured order and places an unlisted custom tab before Account', () => {
        expect(orderTabs(['Today', 'Orders', 'Inbox', 'Account'], custom(), all)).toEqual(['Today', 'Orders', 'Inbox', 'RewardsTab', 'Account']);
    });

    it('honours a position, and a custom tab listed in the configured order', () => {
        expect(orderTabs(['Today', 'Orders', 'Account'], custom(0), all)).toEqual(['RewardsTab', 'Today', 'Orders', 'Account']);
        expect(orderTabs(['RewardsTab', 'Orders', 'Account'], custom(), all)).toEqual(['RewardsTab', 'Orders', 'Account']);
    });

    it('always keeps Account, and drops unknown or repeated names', () => {
        expect(orderTabs(['Today', 'Nope', 'Today'], [], all)).toEqual(['Today', 'Account']);
    });
});
