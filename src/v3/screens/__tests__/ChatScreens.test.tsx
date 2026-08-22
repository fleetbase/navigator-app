import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config, { SCHEMES, type SchemeName } from '../../theme';
import { InboxScreen } from '../InboxScreen';
import { ConversationScreen } from '../ConversationScreen';
import { NewConversationScreen } from '../NewConversationScreen';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { SyncProvider } from '../../shell';
import { clearV3 } from '../../api/storage';
import { settingsStore } from '../../settings';
import { myParticipant, otherParticipants, channelTitle, headingNamesEveryone, personUserId, type ChatChannelRecord } from '../../data';

const ME = 'user_gkASIhJU3V';

/** Shaped from a live `GET /v1/chat-channels/{id}`. */
const channel: ChatChannelRecord = {
    id: 'chat_rvl6Yw8CAn',
    name: 'Ron, Charlotte Thomas',
    title: 'Ron, Charlotte Thomas',
    unread_count: 2,
    updated_at: '2026-08-21T11:54:52.000000Z',
    participants: [
        { id: 'chat_participant_me', user: ME, name: 'Ron', email: 'ron@fleetbase.io' },
        { id: 'chat_participant_her', user: 'user_other', name: 'Charlotte Thomas', is_online: true },
    ],
    last_message: { id: 'm2', content: 'Running about 10 minutes late.', created_at: '2026-08-21T11:54:52.000000Z' },
    feed: [
        {
            type: 'log',
            created_at: '2026-06-06T05:16:55.000000Z',
            data: {
                id: 'chat_log_1',
                content: '{subject.0.name} has created a new chat.',
                resolved_content: 'Ron has created a new chat.',
                event_type: 'created_chat',
            } as never,
        },
        {
            type: 'message',
            created_at: '2026-08-21T11:50:00.000000Z',
            data: {
                id: 'm1',
                sender: { id: 'chat_participant_her', user: 'user_other', name: 'Charlotte Thomas' },
                content: 'Where are you?',
                receipts: [],
            } as never,
        },
        {
            type: 'message',
            created_at: '2026-08-21T11:54:52.000000Z',
            data: {
                id: 'm2',
                sender: { id: 'chat_participant_me', user: ME, name: 'Ron' },
                content: 'Running about 10 minutes late.',
                receipts: [{ id: 'r1' }],
            } as never,
        },
    ],
};

let fetchMock: jest.Mock;
let queue: MutationQueue;

function mockApi(rows: unknown = [channel], detail: unknown = channel) {
    fetchMock.mockImplementation((url: string, init?: { method?: string }) => {
        const u = String(url);
        if (String(init?.method).toUpperCase() === 'POST') {
            return Promise.resolve({ ok: true, status: 201, statusText: 'Created', json: () => Promise.resolve({ id: 'new' }) });
        }
        if (rows === 'fail' || detail === 'fail') return Promise.reject(new TypeError('Network request failed'));
        if (u.includes('available-participants')) {
            return Promise.resolve({
                ok: true, status: 200, statusText: 'OK',
                // Real shape: User records, identified by `id`, with no `user` key.
                json: () => Promise.resolve([
                    { id: ME, name: 'Ron', email: 'ron@fleetbase.io', type: 'admin' },
                    { id: 'user_a', name: 'Amara Osei', email: 'amara@example.test', type: 'admin', is_online: true },
                    { id: 'user_b', name: 'Ben Ortiz', email: 'ben@example.test', type: 'customer' },
                ]),
            });
        }
        const body = u.match(/chat-channels\/[a-zA-Z0-9_]+$/) ? detail : rows;
        return Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve(body) });
    });
}

beforeEach(() => {
    clearV3();
    settingsStore.reset();
    queue = new MutationQueue();
    fetchMock = jest.fn();
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    mockApi();
});

async function mount(node: React.ReactNode, scheme: SchemeName = 'dark') {
    let tree: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
        tree = ReactTestRenderer.create(
            <TamaguiProvider config={config} defaultTheme={scheme}>
                <Theme name={scheme}>
                    <SyncProvider>
                        <FleetbaseProvider host="https://x.test" queue={queue}>
                            {node}
                        </FleetbaseProvider>
                    </SyncProvider>
                </Theme>
            </TamaguiProvider>
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

describe('participant helpers', () => {
    it('finds my participant by user, not by driver or participant id', () => {
        // send-message takes the *participant* id; resolving it wrong 422s.
        expect(myParticipant(channel, ME)?.id).toBe('chat_participant_me');
        expect(myParticipant(channel, 'nobody')).toBeUndefined();
    });

    it('treats everyone else as the other side', () => {
        expect(otherParticipants(channel, ME).map((p) => p.name)).toEqual(['Charlotte Thomas']);
    });

    it("uses the server's title, which already excludes the viewer", () => {
        // A channel of Ron + 3 comes back to Ron titled with the other three.
        expect(channelTitle({ ...channel, title: 'Emma Johnson, Daniel Martin' }, ME, 'x')).toBe('Emma Johnson, Daniel Martin');
    });

    it('falls back to the other participants when there is no title', () => {
        expect(channelTitle({ ...channel, title: undefined, name: undefined }, ME, 'x')).toBe('Charlotte Thomas');
    });

    it('falls back again to the stored name, then the caller default', () => {
        expect(channelTitle({ id: 'c', name: 'Ops room', participants: [] }, ME, 'x')).toBe('Ops room');
        expect(channelTitle({ id: 'c', participants: [] }, ME, 'x')).toBe('x');
    });
});

describe('headingNamesEveryone', () => {
    const others = [{ name: 'Emma Johnson' }, { name: 'Daniel Martin' }];

    it('is true when the heading is the participant list', () => {
        expect(headingNamesEveryone('Emma Johnson, Daniel Martin', others)).toBe(true);
    });

    it('is true when the server title also includes the viewer', () => {
        // Real titles come back both ways; naming Emma is naming Emma.
        expect(headingNamesEveryone('Ron, Emma Johnson, Daniel Martin', others)).toBe(true);
    });

    it('is false for a title of its own, where the count is the only headcount', () => {
        expect(headingNamesEveryone('Depot dispatch', others)).toBe(false);
    });

    it('is false when only some of them are named', () => {
        expect(headingNamesEveryone('Emma Johnson', others)).toBe(false);
    });

    it('is false with nobody else in the room, so an empty count is never shown', () => {
        expect(headingNamesEveryone('Just me', [])).toBe(false);
    });
});

describe('personUserId', () => {
    it('reads `user` on a channel participant', () => {
        expect(personUserId({ id: 'chat_participant_me', user: ME })).toBe(ME);
    });

    it('falls back to `id` on an available-participants User record', () => {
        // That endpoint returns Users, not chat participants — reading `.user`
        // listed the driver as someone to start a conversation with.
        expect(personUserId({ id: 'user_a', name: 'Amara' })).toBe('user_a');
    });

    it('refuses a chat-participant id as a user id', () => {
        expect(personUserId({ id: 'chat_participant_x' })).toBeUndefined();
        expect(personUserId(null)).toBeUndefined();
    });
});

describe('InboxScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<InboxScreen userId={ME} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('names the conversation by who it is with', async () => {
        const t = await mount(<InboxScreen userId={ME} />);
        expect(textOf(t)).toContain('Charlotte Thomas');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows the unread count', async () => {
        const t = await mount(<InboxScreen userId={ME} />);
        expect(textOf(t)).toContain('2');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('says so when a channel has no messages yet', async () => {
        mockApi([{ ...channel, last_message: null }]);
        const t = await mount(<InboxScreen userId={ME} />);
        expect(testIDs(t)).toContain(`no-messages-${channel.id}`);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('is empty, not broken, with no conversations', async () => {
        mockApi([]);
        const t = await mount(<InboxScreen userId={ME} />);
        expect(testIDs(t)).toContain('inbox-empty');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('offers a retry when the list fails', async () => {
        mockApi('fail');
        const t = await mount(<InboxScreen userId={ME} />);
        expect(testIDs(t)).toContain('inbox-error');
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('ConversationScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('does not count the others when the heading has already named them', async () => {
        // The heading lists the participants when the channel has no title of
        // its own; a "3 other people" line beneath restates it.
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        expect(testIDs(t)).not.toContain('participant-summary');
        expect(textOf(t)).toContain('Charlotte Thomas');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('separates my bubbles from theirs', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        const ids = testIDs(t);
        expect(ids).toContain('mine-m2');
        expect(ids).toContain('theirs-m1');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('renders a system log with placeholders already resolved', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        const text = textOf(t);
        expect(text).toContain('Ron has created a new chat.');
        // The raw form still carries "{subject.0.name}".
        expect(text).not.toContain('{subject');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows a read receipt only on my own message', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        expect(textOf(t)).toContain('Read');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends with the participant id, never the user id', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'composer').props as { onChangeText?: (s: string) => void }).onChangeText?.('At the gate');
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'send').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });

        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        const body = JSON.parse(String(post?.[1]?.body));
        expect(body.sender).toBe('chat_participant_me');
        expect(body.sender).not.toBe(ME);
        expect(body.content).toBe('At the gate');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('sends a quick reply without typing', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'quick-arrived').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
        });
        const post = fetchMock.mock.calls.find((c) => String(c[1]?.method).toUpperCase() === 'POST');
        expect(JSON.parse(String(post?.[1]?.body)).content).toBe('Arrived');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('will not send whitespace', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'composer').props as { onChangeText?: (s: string) => void }).onChangeText?.('   ');
        });
        expect(byID(t, 'send').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('refuses to post when the driver is not a participant', async () => {
        // The API 422s on an unknown sender; better to say it up front.
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId="stranger" />);
        expect(testIDs(t)).toContain('not-participant');
        expect(byID(t, 'send').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('orders the feed oldest first, so the newest sits at the bottom', async () => {
        const t = await mount(<ConversationScreen channelId={channel.id} channel={channel} userId={ME} />);
        const text = textOf(t);
        expect(text.indexOf('Where are you?')).toBeLessThan(text.indexOf('Running about 10 minutes late.'));
        ReactTestRenderer.act(() => t.unmount());
    });
});

describe('NewConversationScreen', () => {
    it.each(SCHEMES)('renders in the %s scheme', async (scheme) => {
        const t = await mount(<NewConversationScreen userId={ME} />, scheme);
        expect(t.toJSON()).toBeTruthy();
        ReactTestRenderer.act(() => t.unmount());
    });

    it('never offers the driver a conversation with themselves', async () => {
        const t = await mount(<NewConversationScreen userId={ME} />);
        const ids = testIDs(t);
        expect(ids).toContain('person-user_a');
        expect(ids).not.toContain(`person-${ME}`);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('shows each person\'s role, so staff and customers are distinguishable', async () => {
        const t = await mount(<NewConversationScreen userId={ME} />);
        expect(testIDs(t)).toContain('role-user_b');
        expect(textOf(t)).toContain('Customer');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('filters by name or email', async () => {
        const t = await mount(<NewConversationScreen userId={ME} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'people-search').props as { onChangeText?: (s: string) => void }).onChangeText?.('ben@');
        });
        const ids = testIDs(t);
        expect(ids).toContain('person-user_b');
        expect(ids).not.toContain('person-user_a');
        ReactTestRenderer.act(() => t.unmount());
    });

    it('cannot start a conversation with nobody selected', async () => {
        const t = await mount(<NewConversationScreen userId={ME} />);
        expect(byID(t, 'start-conversation').props.disabled).toBe(true);
        ReactTestRenderer.act(() => t.unmount());
    });

    it('creates the channel, then adds each person', async () => {
        // There is no bulk add route.
        const t = await mount(<NewConversationScreen userId={ME} />);
        await ReactTestRenderer.act(async () => {
            (byID(t, 'person-user_a').props as { onPress?: () => void }).onPress?.();
        });
        await ReactTestRenderer.act(async () => {
            (byID(t, 'start-conversation').props as { onPress?: () => void }).onPress?.();
            await Promise.resolve();
            await Promise.resolve();
        });

        const posts = fetchMock.mock.calls.filter((c) => String(c[1]?.method).toUpperCase() === 'POST');
        expect(posts.some((c) => String(c[0]).endsWith('chat-channels'))).toBe(true);

        const add = posts.find((c) => String(c[0]).includes('add-participant'));
        expect(add).toBeTruthy();
        // The user id, not undefined and not a chat-participant id.
        expect(JSON.parse(String(add?.[1]?.body)).user).toBe('user_a');
        ReactTestRenderer.act(() => t.unmount());
    });
});
