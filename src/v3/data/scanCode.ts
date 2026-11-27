/**
 * What a scanned label says, and which item it belongs to.
 *
 * A Fleetbase label carries the same item twice:
 *
 *   - a **barcode** (Code 128) with the bare tracking number: `FLE9955977287MN`
 *   - a **QR code** with the tracking page's address, which names the tracking
 *     number and the record that owns it:
 *     `https://<console>/~/track-order?order=<tracking number>&r=<owner public id>&v=1`
 *
 * Labels printed before that carry the owner's bare uuid, and a code typed or
 * printed by hand may be a bare public id (`entity_…`). The server's parser
 * (fleetops `Support/TrackingCode`) reads all of them; this is the same reading,
 * done on the phone so that a barcode and a QR code of one label are one item:
 * counted once, ticked once, and shown as its tracking number rather than as an
 * address.
 *
 * Nothing here decides whether a scan is *valid* proof: the server does. This
 * only decides which of the expected items a read belongs to, so the phone can
 * say "not one of this order's items" before sending anything.
 */

export interface ScannedCode {
    /** Exactly what the camera read: what is sent to the server. */
    raw: string;
    /** From a barcode, or a QR address's `order=`. */
    trackingNumber?: string;
    /** From a QR address's `r=`, or a bare `entity_…`/`order_…` code. */
    publicId?: string;
    /** A label printed before tracking addresses: the owner's uuid. */
    uuid?: string;
    isUrl: boolean;
}

/** One item a scan is expected to match. */
export interface ScanItem {
    /** Stable for the life of the screen: what its scan is kept under. */
    key: string;
    trackingNumber?: string;
    /** Every id the item is known by: `entity_…` public id, internal id, uuid. */
    ids: string[];
    name?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_ID = /^(entity|order|waypoint|place|payload)_[A-Za-z0-9]+$/;
/** The tracking page's own path segment: never a tracking number. */
const TRACKING_PATH = 'track-order';

/**
 * The text of a scanner read. The camera hands over an object (`{ value, type }`);
 * a string is accepted too, since manual entry and tests pass one.
 */
export function scanTextOf(result: unknown): string | undefined {
    const value = typeof result === 'string' ? result : (result as { value?: unknown } | null | undefined)?.value;
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    return text || undefined;
}

function decode(value: string): string {
    try {
        return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
        return value;
    }
}

/** Query parameters by hand: `URL` is not complete on every engine the app runs on. */
function queryOf(url: string): Record<string, string> {
    const start = url.indexOf('?');
    if (start < 0) return {};
    const hash = url.indexOf('#', start);
    const query = url.slice(start + 1, hash < 0 ? undefined : hash);
    const out: Record<string, string> = {};
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const key = decode(eq < 0 ? pair : pair.slice(0, eq));
        const value = decode(eq < 0 ? '' : pair.slice(eq + 1)).trim();
        if (key && value && !(key in out)) out[key] = value;
    }
    return out;
}

function pathSegmentsOf(url: string): string[] {
    const withoutScheme = url.replace(/^https?:\/\//i, '');
    const slash = withoutScheme.indexOf('/');
    if (slash < 0) return [];
    return withoutScheme
        .slice(slash)
        .split(/[?#]/)[0]
        .split('/')
        .filter(Boolean);
}

/** Break a read into the identifiers it carries. */
export function parseScanCode(text: string): ScannedCode {
    const raw = String(text ?? '').trim();
    if (/^https?:\/\//i.test(raw)) {
        const query = queryOf(raw);
        let trackingNumber: string | undefined = query.order ?? query.tn;
        if (!trackingNumber) {
            // A later tracking address may carry the number in its path (/track/<number>).
            const segments = pathSegmentsOf(raw);
            const last = segments[segments.length - 1];
            if (segments.length >= 2 && last !== TRACKING_PATH) trackingNumber = decode(last);
        }
        return { raw, trackingNumber: trackingNumber || undefined, publicId: query.r || undefined, isUrl: true };
    }
    if (UUID.test(raw)) return { raw, uuid: raw, isUrl: false };
    if (PUBLIC_ID.test(raw)) return { raw, publicId: raw, isUrl: false };
    return { raw, trackingNumber: raw || undefined, isUrl: false };
}

const sameNumber = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** The `entity_…` id among the ids an item is known by. */
export function entityIdAmong(ids: string[]): string | undefined {
    return ids.find((id) => id.startsWith('entity_'));
}

/** Does this read belong to this item? Either code of its label does. */
export function scanMatchesItem(code: ScannedCode, item: ScanItem): boolean {
    if (code.publicId && item.ids.includes(code.publicId)) return true;
    if (code.uuid) return item.ids.includes(code.uuid);
    if (item.ids.includes(code.raw)) return true;
    if (!sameNumber(code.trackingNumber, item.trackingNumber)) return false;
    /*
     * A QR address names its owner, and that decides (the server's rule too):
     * the right number under another item's id is another item's label. Only
     * checkable when this item's own `entity_…` id is known.
     */
    const known = entityIdAmong(item.ids);
    if (code.publicId && code.publicId.startsWith('entity_') && known && known !== code.publicId) return false;
    return true;
}

/** The position of the expected item a read belongs to, or -1 when it is none of them. */
export function matchScan(code: ScannedCode, items: ScanItem[]): number {
    return items.findIndex((item) => scanMatchesItem(code, item));
}

/**
 * The id to send the scan under, when the phone knows it: the item's own
 * `entity_…` id, else the one the QR address names. A barcode read of an item
 * whose id the phone never received has none, and is sent for the order: the
 * server then finds the item among the order's own.
 */
export function scanSubjectOf(code: ScannedCode, item?: ScanItem): string | undefined {
    const known = item ? entityIdAmong(item.ids) : undefined;
    if (known) return known;
    return code.publicId && code.publicId.startsWith('entity_') ? code.publicId : undefined;
}

/**
 * What to show for a read: the tracking number, in full. Never an address: a
 * driver compares this line with the number printed under the barcode.
 */
export function scanLabelOf(code: ScannedCode, item?: ScanItem): string | undefined {
    if (item?.trackingNumber) return item.trackingNumber;
    if (code.trackingNumber) return code.trackingNumber;
    if (code.publicId) return code.publicId;
    return code.isUrl ? undefined : code.raw;
}

/** One identity for a read that matched no list: the same label read twice is one scan. */
export function scanIdentityOf(code: ScannedCode): string {
    return (code.trackingNumber ?? code.publicId ?? code.uuid ?? code.raw).toLowerCase();
}

function stringOf(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
}

function entityNumberOf(entity: Record<string, unknown>): string | undefined {
    const tn = entity.tracking_number;
    if (typeof tn === 'string') return tn || undefined;
    if (tn && typeof tn === 'object') return stringOf((tn as { tracking_number?: unknown }).tracking_number);
    return undefined;
}

/**
 * The items a scan is checked against: the expected tracking numbers, each
 * with whatever ids the order's own copy of the item carries. An item the
 * order's copy does not name is still expected, by its number alone.
 */
export function scanItemsOf(expected: string[], entities: unknown[] = []): ScanItem[] {
    const records = entities.filter((entity): entity is Record<string, unknown> => !!entity && typeof entity === 'object');
    const seen = new Set<string>();
    const items: ScanItem[] = [];
    for (const number of expected) {
        const key = String(number ?? '').trim();
        if (!key || seen.has(key.toLowerCase())) continue;
        seen.add(key.toLowerCase());
        const record = records.find((entity) => sameNumber(entityNumberOf(entity), key));
        const ids = record ? [record.id, record.public_id, record.internal_id, record.uuid].map(stringOf).filter((id): id is string => !!id) : [];
        items.push({ key, trackingNumber: key, ids, name: record ? stringOf(record.name) : undefined });
    }
    return items;
}
