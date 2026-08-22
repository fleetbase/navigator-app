/**
 * Proof of delivery capture.
 *
 * An order config declares proof per activity: `require_pod` says whether the
 * driver must capture something before the activity can fire, and `pod_method`
 * says what — `scan`, `photo` or `signature`. All three have public endpoints:
 *
 *   POST orders/{id}/capture-qr/{subjectId?}         { code, data, raw_data }
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
import { useCallback, useState } from 'react';
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
     * capture-qr takes a single `code`. A multi-parcel scan is therefore
     * several requests, not one — each is independently idempotent, so a
     * partial failure re-sends only what did not land.
     */
    return { code: proof.codes[0] };
}

export function useProofCapture(orderId?: string) {
    const { adapter } = useFleetbase();
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const capture = useCallback(
        async (proof: ProofPayload, subjectId?: string): Promise<ProofOutcome> => {
            if (!orderId) return 'failed';
            setIsCapturing(true);
            setError(null);
            try {
                const codes = proof.method === 'scan' ? proof.codes : [null];
                let queued = false;
                for (const code of codes) {
                    const one: ProofPayload = proof.method === 'scan' ? { method: 'scan', codes: [code as string] } : proof;
                    const result = await adapter.post(pathFor(orderId, proof.method, subjectId), bodyFor(one));
                    if (isQueuedAck(result)) queued = true;
                }
                return queued ? 'queued' : 'sent';
            } catch (err) {
                setError((err as Error).message);
                return 'failed';
            } finally {
                setIsCapturing(false);
            }
        },
        [adapter, orderId]
    );

    return { capture, isCapturing, error };
}
