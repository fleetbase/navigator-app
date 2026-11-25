/**
 * Linking the app to an instance — design round 3 frames s66, s75, s76.
 *
 * A typed address is not enough to move to another instance: the app also needs
 * that instance's access key and where its live updates are served. The Console
 * hands all of it over as one link, shown as a QR code or sent as a URL:
 *
 *     flbnavigator://configure?host=…&key=…&socketcluster_host=…&socketcluster_port=…&socketcluster_secure=…
 *
 * The same link is accepted three ways (scanned, opened, pasted), and every
 * field stays editable by hand for the operator whose link is wrong.
 */
import { normalizeHost } from './probeHost';

export interface InstanceLink {
    /** Normalised API origin. */
    host: string;
    /** The instance's platform token, or an organisation's API key. */
    key?: string;
    socketHost?: string;
    socketPort?: string;
    socketSecure?: boolean;
    /** What the instance calls itself, when the link says. */
    name?: string;
    /** An organisation's join code: the link is also an invitation to sign up there. */
    joinCode?: string;
}

const JOIN_CODE_LENGTH = 8;

/** A join code as the server keeps it: eight letters and digits, upper case. Empty when it is not one. */
export function normalizeJoinCode(input: unknown): string {
    if (typeof input !== 'string') return '';
    const code = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return code.length === JOIN_CODE_LENGTH ? code : '';
}

/** `ABCD-2345`, the way it is shown and read out. Works on a half-typed code too. */
export function formatJoinCode(input: string): string {
    const code = (input ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, JOIN_CODE_LENGTH);
    return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Two addresses for the same server, however each was written. */
export function sameHost(a?: string, b?: string): boolean {
    const left = normalizeHost(a ?? '');
    const right = normalizeHost(b ?? '');
    return !!left && !!right && left.host.toLowerCase() === right.host.toLowerCase();
}

function decode(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
}

/** Query pairs of anything shaped like a URL. Custom schemes defeat `URL` on some engines, so this is by hand. */
function queryOf(input: string): Record<string, string> {
    const params: Record<string, string> = {};
    const start = input.indexOf('?');
    if (start === -1) return params;
    const end = input.indexOf('#', start);
    const query = input.slice(start + 1, end === -1 ? undefined : end);
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const key = decode(eq === -1 ? pair : pair.slice(0, eq));
        if (key) params[key] = eq === -1 ? '' : decode(pair.slice(eq + 1));
    }
    return params;
}

function truthy(value: unknown, fallback: boolean): boolean {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function fromFields(fields: Record<string, unknown>): InstanceLink | null {
    const rawHost = fields.host ?? fields.fleetbase_host ?? fields.FLEETBASE_HOST;
    const normalized = typeof rawHost === 'string' ? normalizeHost(rawHost) : null;
    if (!normalized) return null;

    const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined);
    const socketHost = text(fields.socketcluster_host ?? fields.socket_host ?? fields.SOCKETCLUSTER_HOST);
    const socketPort = text(fields.socketcluster_port ?? fields.socket_port ?? fields.SOCKETCLUSTER_PORT);

    return {
        host: normalized.host,
        key: text(fields.key ?? fields.token ?? fields.FLEETBASE_KEY),
        socketHost: socketHost ?? normalized.hostname,
        socketPort: socketPort ?? '8000',
        socketSecure: truthy(fields.socketcluster_secure ?? fields.socket_secure ?? fields.SOCKETCLUSTER_SECURE, normalized.secure),
        name: text(fields.name ?? fields.organization ?? fields.company),
        joinCode: normalizeJoinCode(text(fields.join ?? fields.join_code) ?? '') || undefined,
    };
}

/** True for a URL the Console generates for linking, whatever the build's scheme is. */
export function isInstanceLinkUrl(url: unknown): url is string {
    return typeof url === 'string' && /^[a-z][a-z0-9+.-]*:\/\/configure(\?|\/|$)/i.test(url.trim());
}

/**
 * Reads a link from whatever a driver scanned, opened or pasted: the Console's
 * `…://configure?…` URL, any URL carrying the same query, or a JSON object with
 * the same fields. Returns null when there is no usable host in it.
 */
export function parseInstanceLink(input: unknown): InstanceLink | null {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            return parsed && typeof parsed === 'object' ? fromFields(parsed) : null;
        } catch {
            return null;
        }
    }

    if (!trimmed.includes('?')) return null;
    return fromFields(queryOf(trimmed));
}

/** The link as the Console writes it; used to show and re-share what the app is connected to. */
export function buildInstanceLink(link: InstanceLink, scheme = 'flbnavigator'): string {
    const pairs: [string, string | undefined][] = [
        ['host', link.host],
        ['key', link.key],
        ['socketcluster_host', link.socketHost],
        ['socketcluster_port', link.socketPort],
        ['socketcluster_secure', link.socketSecure === undefined ? undefined : String(link.socketSecure)],
    ];
    const query = pairs
        .filter((pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].length > 0)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
    return `${scheme}://configure?${query}`;
}

/** Host without its scheme, for a line a driver reads. */
export function displayHost(host?: string): string {
    return (host ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
