/**
 * Earnings — H2 has no frame; this asserts the gap spec's words: balance,
 * period, a feed with type and direction, payout status. Money is minor units
 * end to end and formatted once.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { EarningsScreen } from '../EarningsScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { periodStart, signedAmount } from '../../data/useWallet';

const balance = { balance: 128400, formatted_balance: '$1,284.00', currency: 'USD', status: 'active' };
const transactions = [
    { id: 'txn_1', type: 'earning', direction: 'credit', status: 'completed', amount: 4250, net_amount: 4250, currency: 'USD', description: 'Order FLE0636178718SG', created_at: '2026-09-08T14:40:00Z' },
    { id: 'txn_2', type: 'payout', direction: 'debit', status: 'pending', amount: 100000, net_amount: 100000, currency: 'USD', created_at: '2026-09-05T09:00:00Z', gateway_transaction_id: 'po_1Q2W3E4R5T6Y' },
];

let fetchMock: jest.Mock;

function mockApi(handlers: Record<string, unknown>) {
    fetchMock.mockImplementation((url: string) => {
        const u = String(url);
        const key = Object.keys(handlers).find((k) => u.includes(k));
        const body = key ? handlers[key] : [];
        if (body === 'fail') return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockApi({ 'wallet/balance': balance, 'wallet/transactions': { data: transactions } });
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={new MutationQueue()}>
                            {node}
                        </FleetbaseProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
        );
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    // @ts-expect-error assigned inside act
    return tree;
}

type N = { children?: unknown[]; props?: Record<string, unknown> };
function walk(node: unknown, visit: (n: N) => void): void {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    visit(node as N);
    (node as N).children?.forEach((c) => walk(c, visit));
}
const textOf = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => n.children?.forEach((c) => typeof c === 'string' && out.push(c)));
    return out.join(' ');
};
const testIDs = (t: ReactTestRenderer.ReactTestRenderer) => {
    const out: string[] = [];
    walk(t.toJSON(), (n) => typeof n.props?.testID === 'string' && out.push(n.props.testID as string));
    return out;
};
const unmount = (t: ReactTestRenderer.ReactTestRenderer) => ReactTestRenderer.act(() => t.unmount());

describe('wallet helpers', () => {
    it('signs amounts by direction, in minor units', () => {
        expect(signedAmount(transactions[0] as never)).toBe(4250);
        expect(signedAmount(transactions[1] as never)).toBe(-100000);
        expect(signedAmount({ id: 'x', amount: 'nope' })).toBe(0);
    });

    it('starts the week on Monday and the month on the first', () => {
        const wed = new Date(2026, 8, 9); // Wednesday 9 Sep 2026
        expect(periodStart('week', wed)).toBe('2026-09-07');
        expect(periodStart('month', wed)).toBe('2026-09-01');
        expect(periodStart('all', wed)).toBeUndefined();
    });
});

describe('EarningsScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<EarningsScreen />, scheme);
        expect(testIDs(t)).toContain('earnings-screen');
        await unmount(t);
    });

    it('reads the ledger namespace, not v1, and formats minor units once', async () => {
        const t = await mount(<EarningsScreen />);
        const urls = fetchMock.mock.calls.map(([u]) => String(u));
        expect(urls.some((u) => u.includes('/ledger/v1/wallet/balance'))).toBe(true);
        expect(urls.some((u) => u.includes('/ledger/v1/wallet/transactions') && u.includes('date_from='))).toBe(true);
        expect(urls.every((u) => !u.includes('/v1/ledger/'))).toBe(true);
        const text = textOf(t);
        expect(text).toContain('$1,284.00');
        expect(text).toContain('$42.50');
        expect(text).toContain('$1,000.00');
        expect(text).toContain('po_1Q2W3E4R5T6Y');
        await unmount(t);
    });

    it('shows direction with a glyph and the period total signed', async () => {
        const t = await mount(<EarningsScreen />);
        const text = textOf(t);
        expect(text).toContain('↑');
        expect(text).toContain('↓');
        // 42.50 − 1,000.00 = −957.50 in the period.
        expect(text).toContain('$957.50');
        expect(testIDs(t)).toContain('earnings-period-total');
        await unmount(t);
    });

    it('is honest about an empty period and a frozen wallet', async () => {
        mockApi({ 'wallet/balance': { ...balance, status: 'frozen' }, 'wallet/transactions': [] });
        const t = await mount(<EarningsScreen />);
        const ids = testIDs(t);
        expect(ids).toContain('earnings-empty');
        expect(ids).toContain('earnings-frozen');
        await unmount(t);
    });

    it('fails honestly when the ledger is unreachable', async () => {
        mockApi({ 'wallet/balance': 'fail', 'wallet/transactions': 'fail' });
        const t = await mount(<EarningsScreen />);
        expect(testIDs(t)).toContain('earnings-error');
        await unmount(t);
    });
});
