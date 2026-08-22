import { normalizeHost, isLocalHost, probeHost } from '../probeHost';

const fleetbaseBody = { message: 'Fleetbase API', version: 'v1', fleetbase: '0.7.53', ms: 0.04 };
const ok = (body: unknown) => jest.fn().mockResolvedValue({ ok: true, json: async () => body } as never);

describe('normalizeHost', () => {
    it('assumes https when the driver types a bare domain', () => {
        expect(normalizeHost('fleetbase.example.com')?.host).toBe('https://fleetbase.example.com');
    });

    it('keeps only the origin — every request appends its own path', () => {
        expect(normalizeHost('https://fleetbase.example.com/console/orders')?.host).toBe('https://fleetbase.example.com');
    });

    it('drops a trailing slash rather than doubling it later', () => {
        expect(normalizeHost('https://fleetbase.example.com/')?.host).toBe('https://fleetbase.example.com');
    });

    it('keeps a non-default port', () => {
        expect(normalizeHost('localhost:8000')?.host).toBe('https://localhost:8000');
        expect(normalizeHost('http://localhost:8000')?.host).toBe('http://localhost:8000');
    });

    it('tolerates whitespace from a paste', () => {
        expect(normalizeHost('  https://fleetbase.example.com  ')?.host).toBe('https://fleetbase.example.com');
    });

    it('rejects a bare name that is not local — that is a typo, not a host', () => {
        expect(normalizeHost('fleetbase')).toBeNull();
    });

    it('rejects empty and unparseable input', () => {
        expect(normalizeHost('')).toBeNull();
        expect(normalizeHost('   ')).toBeNull();
        expect(normalizeHost('http://')).toBeNull();
    });

    it('reports whether the origin is secure', () => {
        expect(normalizeHost('https://a.example.com')?.secure).toBe(true);
        expect(normalizeHost('http://a.example.com')?.secure).toBe(false);
    });
});

describe('isLocalHost', () => {
    it('recognises loopback and private ranges, where plain http is normal', () => {
        for (const h of ['localhost', '127.0.0.1', '192.168.1.10', '10.0.0.4', '172.16.0.2', 'mac.local']) {
            expect({ h, local: isLocalHost(h) }).toEqual({ h, local: true });
        }
    });

    it('does not treat a public host as local', () => {
        for (const h of ['fleetbase.example.com', '8.8.8.8', '172.15.0.1']) {
            expect({ h, local: isLocalHost(h) }).toEqual({ h, local: false });
        }
    });
});

describe('probeHost', () => {
    it('identifies a Fleetbase instance without any credential', async () => {
        // This is the whole reason no API key field is needed.
        const result = await probeHost('http://localhost:8000', ok(fleetbaseBody) as never);
        expect(result).toEqual({
            ok: true,
            identity: { host: 'http://localhost:8000', version: '0.7.53', apiVersion: 'v1' },
        });
    });

    it('refuses plain http to a remote host — that is a password in clear', async () => {
        const fetchImpl = ok(fleetbaseBody);
        const result = await probeHost('http://fleetbase.example.com', fetchImpl as never);
        expect(result).toEqual({ ok: false, reason: 'insecure' });
        // Never even attempted.
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('allows plain http to localhost, where it is normal', async () => {
        const result = await probeHost('http://127.0.0.1:8000', ok(fleetbaseBody) as never);
        expect(result.ok).toBe(true);
    });

    it('reports an unreachable host rather than throwing', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
        expect(await probeHost('https://nope.example.com', fetchImpl as never)).toEqual({
            ok: false,
            reason: 'unreachable',
        });
    });

    it('rejects a host that answers with something that is not Fleetbase', async () => {
        // A captive portal, or an unrelated site on that domain.
        const result = await probeHost('https://example.com', ok({ hello: 'world' }) as never);
        expect(result).toEqual({ ok: false, reason: 'not-fleetbase' });
    });

    it('rejects a non-JSON response', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => {
                throw new Error('not json');
            },
        } as never);
        expect(await probeHost('https://example.com', fetchImpl as never)).toEqual({ ok: false, reason: 'not-fleetbase' });
    });

    it('rejects an http error status', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) } as never);
        expect(await probeHost('https://example.com', fetchImpl as never)).toEqual({ ok: false, reason: 'not-fleetbase' });
    });

    it('rejects malformed input before touching the network', async () => {
        const fetchImpl = ok(fleetbaseBody);
        expect(await probeHost('not a url', fetchImpl as never)).toEqual({ ok: false, reason: 'invalid-url' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('accepts an instance that reports a version but no message', async () => {
        const result = await probeHost('https://a.example.com', ok({ fleetbase: '0.8.0' }) as never);
        expect(result.ok).toBe(true);
    });
});
