import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import { PortalProvider } from '@gorhom/portal';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { IssuesScreen } from '../IssuesScreen';
import { IssueDetailScreen } from '../IssueDetailScreen';
import { IssueCreateScreen } from '../IssueCreateScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider, LocationProvider, normalizeCoordinates, toGeoPoint } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { headingOf, humanizeTerm, toApiTerm, type IssueRecord } from '../../data';

/** Shaped from a live `GET /v1/issues` row — flat names, hyphenated status. */
const issue: IssueRecord = {
    id: 'issue_mizMXVsxrU',
    issue_id: 'ISSUE-0001',
    title: 'Brake warning light',
    report: 'Amber brake light on since this morning.',
    priority: 'high',
    type: 'inspection',
    category: 'equipment',
    status: 'in-progress',
    driver_name: 'Ron',
    vehicle_name: 'EAS-01',
    reporter_name: 'Ron',
    assignee_name: null,
    location: { type: 'Point', coordinates: [103.7424, 1.3346] },
    created_at: '2026-02-01T09:00:00.000000Z',
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockList(rows: unknown = [issue]) {
    fetchMock.mockImplementation(() =>
        rows === 'fail'
            ? Promise.reject(new TypeError('Network request failed'))
            : Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(rows) })
    );
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockList();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark', location: unknown = { latitude: 1.3521, longitude: 103.8198 }) {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <PortalProvider>
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <LocationProvider location={location}>
                            <FleetbaseProvider host="https://x.test" queue={queue}>
                                {node}
                            </FleetbaseProvider>
                        </LocationProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
            </PortalProvider>
        );
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
const byID = (t: ReactTestRenderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props?.testID === id)[0];

describe('location bridging', () => {
    it('accepts a geolocation position or a bare coords object', () => {
        expect(normalizeCoordinates({ coords: { latitude: 1.5, longitude: 103.2 } })).toEqual({ latitude: 1.5, longitude: 103.2 });
        expect(normalizeCoordinates({ latitude: 1.5, longitude: 103.2 })).toEqual({ latitude: 1.5, longitude: 103.2 });
    });

    it('treats null island as no fix, not a position off Ghana', () => {
        expect(normalizeCoordinates({ latitude: 0, longitude: 0 })).toBeNull();
    });

    it('is null for junk rather than NaN coordinates', () => {
        expect(normalizeCoordinates(null)).toBeNull();
        expect(normalizeCoordinates({ latitude: 'x', longitude: 'y' })).toBeNull();
        expect(normalizeCoordinates({})).toBeNull();
    });

    it('emits GeoJSON longitude-first, as the API stores it', () => {
        expect(toGeoPoint({ latitude: 1.3521, longitude: 103.8198 })).toEqual({ type: 'Point', coordinates: [103.8198, 1.3521] });
        expect(toGeoPoint(null)).toBeNull();
    });
});

describe('term formatting', () => {
    it('humanises the snake_case the API stores', () => {
        expect(humanizeTerm('billing_discrepancies')).toBe('Billing discrepancies');
        expect(humanizeTerm(null)).toBeUndefined();
    });

    it('converts a picker label back to the API term', () => {
        expect(toApiTerm('Mechanical Problems')).toBe('mechanical_problems');
        expect(toApiTerm('UI/UX Concerns')).toBe('ui_ux_concerns');
    });
});

describe('headingOf', () => {
    it('prefers the title', () => {
        expect(headingOf(issue)).toEqual({ heading: 'Brake warning light', usedReport: false });
    });

    it('falls back to the humanised category', () => {
        expect(headingOf({ ...issue, title: null })).toEqual({ heading: 'Equipment', usedReport: false });
    });

    it("uses the driver's own words rather than printing 'Issue' twice", () => {
        // An issue filed from the app has neither title nor category.
        expect(headingOf({ ...issue, title: null, category: null })).toEqual({
            heading: 'Amber brake light on since this morning.',
            usedReport: true,
        });
    });

    it('is empty when there is nothing at all to show', () => {
        expect(headingOf({ id: 'x' })).toEqual({ heading: '', usedReport: false });
    });
});

describe('IssuesScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<IssuesScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('scopes the query with driver=, not driver_uuid', async () => {
        await mount(<IssuesScreen driverId="driver_1" />);
        const url = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(url).toContain('driver=driver_1');
        expect(url).not.toContain('driver_uuid');
    });

    it('renders a hyphenated status without falling back to the unknown tone', async () => {
        // The live API returns "in-progress"; the registry key is in_progress.
        const t = await mount(<IssuesScreen driverId="driver_1" />);
        expect(textOf(t)).toContain('In progress');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says a freshly filed issue is untriaged rather than showing an empty pill', async () => {
        // The public create endpoint does not default a status.
        mockList([{ ...issue, status: null }]);
        const t = await mount(<IssuesScreen driverId="driver_1" />);
        const ids = testIDs(t);
        expect(ids).toContain(`untriaged-${issue.id}`);
        expect(ids).not.toContain(`status-${issue.id}`);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is empty, not broken, for a driver with nothing reported', async () => {
        mockList([]);
        const t = await mount(<IssuesScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('issues-empty');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a retry when the list fails', async () => {
        mockList('fail');
        const t = await mount(<IssuesScreen driverId="driver_1" />);
        expect(testIDs(t)).toContain('issues-error');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('still lets the driver record an issue when the list fails', async () => {
        // A failed read must not remove a write the queue can hold.
        mockList('fail');
        const onCreate = jest.fn();
        const t = await mount(<IssuesScreen driverId="driver_1" onCreate={onCreate} />);
        const ids = testIDs(t);
        expect(ids).toContain('issues-error');
        expect(ids).toContain('issue-add');
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('IssueDetailScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<IssueDetailScreen issue={issue} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('humanises the stored terms rather than showing snake_case', async () => {
        const t = await mount(<IssueDetailScreen issue={{ ...issue, category: 'billing_discrepancies' }} />);
        expect(textOf(t)).toContain('Billing discrepancies');
        expect(textOf(t)).not.toContain('billing_discrepancies');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says the status history is unavailable rather than leaving a gap', async () => {
        // issues/{id}/timeline is registered under int/v1 only.
        const t = await mount(<IssueDetailScreen issue={issue} />);
        expect(testIDs(t)).toContain('issue-timeline-unavailable');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits rows the record has no value for', async () => {
        const t = await mount(<IssueDetailScreen issue={{ ...issue, assignee_name: null, vehicle_name: null }} />);
        const ids = testIDs(t);
        expect(ids).not.toContain('issue-row-assignee');
        expect(ids).not.toContain('issue-row-vehicle');
        expect(ids).toContain('issue-row-category');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('omits the location row when the point is null island', async () => {
        const t = await mount(<IssueDetailScreen issue={{ ...issue, location: { type: 'Point', coordinates: [0, 0] } }} />);
        expect(testIDs(t)).not.toContain('issue-row-location');
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('IssueCreateScreen', () => {
    const type = (t: ReactTestRenderer.ReactTestRenderer, id: string, text: string) =>
        ReactTestRenderer.act(() => {
            (byID(t, id).props as { onChangeText?: (s: string) => void }).onChangeText?.(text);
        });

    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<IssueCreateScreen driverId="driver_1" />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refuses to file without a location, and says so up front', async () => {
        // POST /v1/issues requires location; better to say it before the writing.
        const t = await mount(<IssueCreateScreen driverId="driver_1" />, 'dark', null);
        expect(testIDs(t)).toContain('needs-location');
        type(t, 'input-report', 'Brake light is on');
        expect(byID(t, 'issue-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('files once there is a fix and a report', async () => {
        const t = await mount(<IssueCreateScreen driverId="driver_1" />);
        expect(byID(t, 'issue-save').props.disabled).toBe(true);
        type(t, 'input-report', 'Brake light is on');
        expect(byID(t, 'issue-save').props.disabled).toBe(false);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends location as GeoJSON and the terms in the API casing', async () => {
        const t = await mount(<IssueCreateScreen driverId="driver_1" />);
        type(t, 'input-report', 'Brake light is on');
        await ReactTestRenderer.act(async () => {
            (byID(t, 'issue-save').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        const body = JSON.parse(String(post?.[1]?.body));
        expect(body.driver).toBe('driver_1');
        expect(body.report).toBe('Brake light is on');
        expect(body.location).toEqual({ type: 'Point', coordinates: [103.8198, 1.3521] });
        expect(body.priority).toBe('medium');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not post a report of only whitespace', async () => {
        const t = await mount(<IssueCreateScreen driverId="driver_1" />);
        type(t, 'input-report', '  ');
        expect(byID(t, 'issue-save').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('tells the driver where the issue will be reported from', async () => {
        const t = await mount(<IssueCreateScreen driverId="driver_1" />);
        expect(textOf(t)).toContain('1.3521');
        ReactTestRenderer.act(() => t.unmount());
    });
});
