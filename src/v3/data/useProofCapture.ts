/**
 * Proof of delivery capture.
 *
 * An order config declares proof per activity: `require_pod` says whether the
 * driver must capture something before the activity can fire, and `pod_method`
 * says what — `scan`, `photo` or `signature`. All three have public endpoints:
 *
 *   POST orders/{id}/capture-qr/{subjectId?}         { code }
 *   POST orders/{id}/capture-photo/{subjectId?}      { photos: [base64…] }
 *   POST orders/{id}/capture-signature/{subjectId?}  { signature, remarks }
 *
 * Every one accepts base64 rather than only a multipart upload, which is what
 * makes proof queueable: a signature captured in a basement is a string the
 * mutation queue can hold until there is signal, not a file handle that has to
 * be re-read later.
 *
 * The order matters. Proof is captured **before** the activity update, so a
 * driver is never left with an order marked delivered and no proof attached to
 * it — the queue preserves submission order, so replay reproduces the same
 * sequence offline that it would have online.
 */
import { useCallback, useRef, useState } from 'react';
import { useFleetbase } from '../api';
import { isQueuedAck } from '../api/NavigatorAdapter';

export type ProofMethod = 'scan' | 'photo' | 'signature';

/** What the driver captured, ready to send. */
export type ProofPayload =
    | { method: 'scan'; codes: string[] }
    /** Base64, no data: prefix — the endpoint decodes it strictly. */
    | { method: 'photo'; photos: string[] }
    | { method: 'signature'; signature: string; remarks?: string };

export type ProofOutcome = 'sent' | 'queued' | 'failed';

/**
 * Why the server would not take a scan, in the app's words:
 *
 *   - `mismatch`: it read the code and the code does not name what the scan was
 *     sent for (the item, or any item of the order)
 *   - `notOnOrder`: the item the scan was sent for is not on this order
 *   - `unreadable`: nothing usable was read
 *   - `orderMissing`: the order is no longer there
 *   - `noSignal`: it never reached the server, and could not be kept to send later
 *   - `other`: anything else; `message` carries what the server said
 */
export type ScanFailure = 'mismatch' | 'notOnOrder' | 'unreadable' | 'orderMissing' | 'noSignal' | 'other';

/** What came of sending one scanned code. */
export interface ScanSendResult {
    outcome: ProofOutcome;
    /** The proof record's id, when the scan reached the server. */
    proofId?: string;
    /** The record the server filed the proof under (`entity_…`, or the order). */
    subjectId?: string;
    failure?: ScanFailure;
    /** The server's own words, for a failure the app has none for. */
    message?: string;
}

/** Reads the server's refusal of a scan. Its messages are fleetops `captureQrScan`'s. */
export function scanFailureOf(err: unknown): { failure: ScanFailure; message?: string } {
    const error = err as { message?: unknown; status?: unknown; isTransport?: unknown } | null | undefined;
    const message = typeof error?.message === 'string' ? error.message : undefined;
    if (error?.isTransport) return { failure: 'noSignal', message };
    if (message && /validate QR code/i.test(message)) return { failure: 'mismatch', message };
    if (message && /capture QR code/i.test(message)) return { failure: 'notOnOrder', message };
    if (message && /No QR code data/i.test(message)) return { failure: 'unreadable', message };
    if (error?.status === 404) return { failure: 'orderMissing', message };
    return { failure: 'other', message };
}

/** Which capture method a config's activity is asking for. */
export function proofMethodOf(podMethod?: string | null): ProofMethod {
    const value = String(podMethod ?? '').toLowerCase();
    if (value === 'photo') return 'photo';
    if (value === 'signature') return 'signature';
    // `scan` is the FleetOps default, and the safest thing to ask for when a
    // config names something we do not recognise: it captures a value the
    // server can verify rather than an image nobody checks.
    return 'scan';
}

/**
 * Strips a data URL prefix if one is present.
 *
 * `react-native-signature-canvas` hands back `data:image/png;base64,iVBOR…`,
 * and the endpoint's validator runs a strict base64 decode that rejects the
 * whole string when the prefix is left on.
 */
export function toBareBase64(value: string): string {
    const comma = value.indexOf(',');
    return value.startsWith('data:') && comma > -1 ? value.slice(comma + 1) : value;
}

function pathFor(orderId: string, method: ProofMethod, subjectId?: string): string {
    const endpoint = method === 'photo' ? 'capture-photo' : method === 'signature' ? 'capture-signature' : 'capture-qr';
    return subjectId ? `orders/${orderId}/${endpoint}/${subjectId}` : `orders/${orderId}/${endpoint}`;
}

function bodyFor(proof: ProofPayload): Record<string, unknown> {
    if (proof.method === 'photo') {
        return { photos: proof.photos.map(toBareBase64) };
    }
    if (proof.method === 'signature') {
        return { signature: toBareBase64(proof.signature), remarks: proof.remarks ?? 'Captured in Navigator' };
    }
    /*
     * capture-qr takes a single `code`: the text the camera read, as it read it
     * (a tracking number from the barcode, the tracking address from the QR
     * code, or an older label's id). The server reads every one of those. A
     * multi-item scan is therefore several requests, each naming its own item.
     */
    return { code: proof.codes[0] };
}

/**
 * The proof record in a capture's answer. A proof has a `data` field of its own
 * (what was captured with it — an empty list for a signature), so the record is
 * the answer itself whenever that carries an id; only a wrapped answer is unwrapped.
 */
function proofRecordOf(result: unknown): { id?: unknown; subject_id?: unknown } | null {
    if (!result || typeof result !== 'object') return null;
    const own = result as { id?: unknown; subject_id?: unknown; data?: unknown };
    if (typeof own.id === 'string') return own;
    const inner = own.data;
    return inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as { id?: unknown; subject_id?: unknown }) : own;
}

export function useProofCapture(orderId?: string) {
    const { adapter } = useFleetbase();
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /*
     * The proof record's id, from the last capture that reached the server.
     * The activity update sends it (`proof`), the way v2 did, so the server
     * ties the two together. A queued capture has none yet.
     */
    const lastProofId = useRef<string | undefined>(undefined);
    /*
     * Why the last capture failed: what was said, and whether it never reached
     * the server at all (no signal, and it could not be kept to send later). A
     * screen that shows the reason tells the two apart with this.
     */
    const lastFailure = useRef<{ message?: string; transport: boolean } | undefined>(undefined);

    /**
     * Sends one scanned code as proof.
     *
     * With a `subjectId` (`entity_…`) the proof is that item's, and the server
     * checks the code against it. Without one it is sent for the order, and the
     * server files it under the order when the code is the order's own, or
     * under the item of this order the code names. Either way a code that names
     * nothing on the order is refused.
     */
    const sendScan = useCallback(
        async (code: string, subjectId?: string): Promise<ScanSendResult> => {
            if (!orderId) return { outcome: 'failed', failure: 'orderMissing' };
            try {
                const result = await adapter.post(pathFor(orderId, 'scan', subjectId), bodyFor({ method: 'scan', codes: [code] }));
                if (isQueuedAck(result)) return { outcome: 'queued', subjectId };
                const record = proofRecordOf(result);
                return {
                    outcome: 'sent',
                    proofId: record && typeof record.id === 'string' ? record.id : undefined,
                    subjectId: record && typeof record.subject_id === 'string' ? record.subject_id : subjectId,
                };
            } catch (err) {
                return { outcome: 'failed', ...scanFailureOf(err) };
            }
        },
        [adapter, orderId]
    );

    const capture = useCallback(
        async (proof: ProofPayload, subjectId?: string): Promise<ProofOutcome> => {
            if (!orderId) return 'failed';
            setIsCapturing(true);
            setError(null);
            try {
                let queued = false;
                lastProofId.current = undefined;
                lastFailure.current = undefined;
                if (proof.method === 'scan') {
                    for (const code of proof.codes) {
                        const result = await sendScan(code, subjectId);
                        if (result.outcome === 'failed') {
                            setError(result.message ?? result.failure ?? 'failed');
                            return 'failed';
                        }
                        if (result.outcome === 'queued') queued = true;
                        else if (result.proofId) lastProofId.current = result.proofId;
                    }
                    return queued ? 'queued' : 'sent';
                }
                const result = await adapter.post(pathFor(orderId, proof.method, subjectId), bodyFor(proof));
                if (isQueuedAck(result)) return 'queued';
                const record = proofRecordOf(result);
                if (record && typeof record.id === 'string') lastProofId.current = record.id;
                return 'sent';
            } catch (err) {
                const failure = err as { message?: unknown; isTransport?: unknown } | null | undefined;
                lastFailure.current = { message: typeof failure?.message === 'string' ? failure.message : undefined, transport: !!failure?.isTransport };
                setError((err as Error).message);
                return 'failed';
            } finally {
                setIsCapturing(false);
            }
        },
        [adapter, orderId, sendScan]
    );

    return { capture, sendScan, isCapturing, error, lastProofId: useCallback(() => lastProofId.current, []), lastFailure: useCallback(() => lastFailure.current, []) };
}
