/**
 * Proof capture — the contract, not the UI.
 *
 * These assert against the shapes the public capture endpoints actually
 * validate, because getting a base64 prefix or a field name wrong fails only at
 * the moment a driver is standing at a door with a signed screen.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { FleetbaseProvider, MutationQueue } from '../../api';
import { clearV3 } from '../../api/storage';
import { useProofCapture, proofMethodOf, toBareBase64, type ProofOutcome } from '../useProofCapture';

let queue: MutationQueue;
let fetchMock: jest.Mock;

beforeEach(() => {
    clearV3();
    queue = new MutationQueue();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });
    (globalThis as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

/** Drives the hook without a screen. */
function Harness({ run }: { run: (api: ReturnType<typeof useProofCapture>) => void }) {
    const api = useProofCapture('order_1');
    run(api);
    return null;
}

async function withHook(fn: (api: ReturnType<typeof useProofCapture>) => Promise<void>) {
    let api: ReturnType<typeof useProofCapture> | undefined;
    await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(
            <FleetbaseProvider host="https://api.example.test" queue={queue}>
                <Harness run={(a) => { api = a; }} />
            </FleetbaseProvider>
        );
    });
    await ReactTestRenderer.act(async () => {
        await fn(api!);
    });
}

const callsTo = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body);

describe('proofMethodOf', () => {
    it('reads the config’s declared method', () => {
        expect(proofMethodOf('photo')).toBe('photo');
        expect(proofMethodOf('signature')).toBe('signature');
        expect(proofMethodOf('scan')).toBe('scan');
    });

    it('falls back to scan for anything it does not recognise', () => {
        // A value the server can verify beats an image nobody checks.
        expect(proofMethodOf('fingerprint')).toBe('scan');
        expect(proofMethodOf(null)).toBe('scan');
        expect(proofMethodOf(undefined)).toBe('scan');
    });
});

describe('toBareBase64', () => {
    it('strips the data URL the signature pad produces', () => {
        // The endpoint runs a strict decode, which the prefix fails.
        expect(toBareBase64('data:image/png;base64,iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
    });

    it('leaves a bare string alone', () => {
        expect(toBareBase64('iVBORw0KGgo=')).toBe('iVBORw0KGgo=');
    });
});

describe('useProofCapture', () => {
    it('posts a signature to the signature endpoint, without the data URL prefix', async () => {
        let outcome: ProofOutcome | undefined;
        await withHook(async (api) => {
            outcome = await api.capture({ method: 'signature', signature: 'data:image/png;base64,iVBORw0KGgo=' });
        });

        const call = callsTo('capture-signature')[0];
        expect(call).toBeTruthy();
        expect(bodyOf(call).signature).toBe('iVBORw0KGgo=');
        expect(bodyOf(call).remarks).toBeTruthy();
        expect(outcome).toBe('sent');
    });

    it('posts photos as an array, which is what the endpoint validates', async () => {
        await withHook(async (api) => {
            await api.capture({ method: 'photo', photos: ['data:image/jpeg;base64,AAA=', 'BBB='] });
        });
        const body = bodyOf(callsTo('capture-photo')[0]);
        expect(body.photos).toEqual(['AAA=', 'BBB=']);
    });

    it('sends one request per scanned code, since capture-qr takes a single code', async () => {
        await withHook(async (api) => {
            await api.capture({ method: 'scan', codes: ['ENT-1', 'ENT-2', 'ENT-3'] });
        });
        const calls = callsTo('capture-qr');
        expect(calls).toHaveLength(3);
        expect(calls.map((c) => bodyOf(c).code)).toEqual(['ENT-1', 'ENT-2', 'ENT-3']);
    });

    it('addresses a subject when the proof is for one entity rather than the order', async () => {
        await withHook(async (api) => {
            await api.capture({ method: 'scan', codes: ['ENT-1'] }, 'entity_9');
        });
        expect(String(callsTo('capture-qr')[0][0])).toContain('capture-qr/entity_9');
    });

    it('reports queued rather than sent when there is no signal', async () => {
        fetchMock.mockRejectedValue(new TypeError('Network request failed'));
        let outcome: ProofOutcome | undefined;
        await withHook(async (api) => {
            outcome = await api.capture({ method: 'signature', signature: 'AAA=' });
        });
        expect(outcome).toBe('queued');
        // The work is on the device, not lost.
        expect(queue.snapshot().items).toHaveLength(1);
    });
});
