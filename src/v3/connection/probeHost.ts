/**
 * Self-hosted connection — R2 frame A4.
 *
 * v2's InstanceLinkScreen asks the driver to paste an **API key**, and the
 * deep-link flow ships one automatically: a single admin-scoped, org-wide,
 * unrevocable credential sitting on every handset. That is the security hole
 * the audit opens with, and this screen exists to not need it.
 *
 * It does not, because a Fleetbase host identifies itself unauthenticated. The
 * root endpoint answers:
 *
 *     { "message": "Fleetbase API", "version": "v1", "fleetbase": "0.7.53" }
 *
 * So the app can confirm a URL really is a Fleetbase instance, and how old it
 * is, before anyone types a password — and then the driver signs in with their
 * *own* credentials. No shared secret is ever stored.
 *
 * URL handling is separated from the network call because the parsing is where
 * the mistakes are, and they are quiet ones: a driver types "fleetbase.example
 * .com", or pastes a URL with a trailing slash, or the console shows them a
 * path. None of those should be a dead end.
 */

export interface HostIdentity {
    /** Normalised origin the app should talk to. */
    host: string;
    /** Reported Fleetbase version, when it says. */
    version?: string;
    apiVersion?: string;
}

export type ProbeFailure =
    | 'invalid-url'
    | 'insecure'
    | 'unreachable'
    | 'not-fleetbase';

export type ProbeResult = { ok: true; identity: HostIdentity } | { ok: false; reason: ProbeFailure };

/** Loopback and private ranges, where plain http is normal and safe enough. */
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

export function isLocalHost(hostname: string): boolean {
    return LOCAL.test(hostname) || hostname.endsWith('.local');
}

/**
 * Turns what a driver actually types into an origin.
 *
 * Accepts "example.com", "https://example.com/", "localhost:8000",
 * "https://example.com/some/path" — and keeps only the origin, because every
 * request the app makes appends its own path.
 */
export function normalizeHost(input: string): { host: string; hostname: string; secure: boolean } | null {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return null;

    // No scheme: assume https, which is the safe default to guess.
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        return null;
    }

    if (!url.hostname || !/^[a-z0-9.\-[\]:]+$/i.test(url.hostname)) return null;
    // A bare TLD-less name that is not local is a typo, not a host.
    if (!url.hostname.includes('.') && !isLocalHost(url.hostname)) return null;

    const secure = url.protocol === 'https:';
    const port = url.port ? `:${url.port}` : '';
    return { host: `${url.protocol}//${url.hostname}${port}`, hostname: url.hostname, secure };
}

/** A Fleetbase root response, however sparse. */
function looksLikeFleetbase(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const b = body as { message?: unknown; fleetbase?: unknown; version?: unknown };
    if (typeof b.fleetbase === 'string') return true;
    return typeof b.message === 'string' && /fleetbase/i.test(b.message);
}

export async function probeHost(
    input: string,
    fetchImpl: typeof fetch = fetch,
    timeoutMs = 8000
): Promise<ProbeResult> {
    const normalized = normalizeHost(input);
    if (!normalized) return { ok: false, reason: 'invalid-url' };

    // Plain http to a remote host would put the driver's password on the wire
    // in clear. Allowed for loopback and private ranges, where it is normal.
    if (!normalized.secure && !isLocalHost(normalized.hostname)) {
        return { ok: false, reason: 'insecure' };
    }

    let response: Response;
    try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
        try {
            response = await fetchImpl(`${normalized.host}/`, { method: 'GET', signal: controller?.signal });
        } finally {
            if (timer) clearTimeout(timer);
        }
    } catch {
        return { ok: false, reason: 'unreachable' };
    }

    if (!response.ok) return { ok: false, reason: 'not-fleetbase' };

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        // Reachable, but answering with something that is not a Fleetbase API —
        // a captive portal or an unrelated site on that host.
        return { ok: false, reason: 'not-fleetbase' };
    }

    if (!looksLikeFleetbase(body)) return { ok: false, reason: 'not-fleetbase' };

    const b = body as { fleetbase?: string; version?: string };
    return {
        ok: true,
        identity: { host: normalized.host, version: b.fleetbase, apiVersion: b.version },
    };
}
