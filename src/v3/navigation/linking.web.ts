/**
 * Addresses for the web build, so the browser's back button, a reload and a shared
 * link all work. No route table to maintain: React Navigation derives a path from
 * route names (`/Orders/OrderDetail?orderId=…`), which covers custom routes too.
 */
import { getPathFromState, getStateFromPath, type LinkingOptions } from '@react-navigation/native';

const TAB_HOMES: Record<string, string> = {
    Today: 'TodayHome',
    Route: 'RouteHome',
    Orders: 'OrdersHome',
    Inbox: 'InboxHome',
    Account: 'AccountHome',
};

type LooseState = { index?: number; routes: { name: string; params?: Record<string, unknown>; state?: LooseState }[] };

/** Records passed as params can't live in a URL; a screen reloaded without one fetches by id. */
function withUrlParams(state: LooseState): LooseState {
    return {
        ...state,
        routes: state.routes.map((route) => ({
            ...route,
            params: route.params && Object.fromEntries(Object.entries(route.params).filter(([, value]) => value === null || typeof value !== 'object')),
            state: route.state && withUrlParams(route.state),
        })),
    };
}

export const linking: LinkingOptions<Record<string, undefined>> = {
    prefixes: [],
    getPathFromState: (state, options) => getPathFromState(withUrlParams(state as LooseState) as never, options),
    getStateFromPath: (path, options) => {
        const state = getStateFromPath(path, options) as LooseState | undefined;
        // A reloaded screen keeps its tab's home beneath it, so its back control still goes somewhere.
        for (const tab of state?.routes ?? []) {
            const home = TAB_HOMES[tab.name];
            if (home && tab.state && tab.state.routes[0]?.name !== home) {
                tab.state.routes.unshift({ name: home });
                tab.state.index = tab.state.routes.length - 1;
            }
        }
        return state as never;
    },
};
