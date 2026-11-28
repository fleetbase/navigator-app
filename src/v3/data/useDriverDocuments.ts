/**
 * The documents an organisation asks of its drivers.
 *
 *   - `GET  drivers/{id}/documents` lists each one and where the driver's copy stands;
 *   - `POST drivers/{id}/documents` sends, or sends again, the file for one of them.
 *
 * The organisation approves each document or sends it back with a reason. A
 * driver who signed themselves up cannot go online until all are approved.
 * Sending is never queued: a document that lands hours later, after the driver
 * thought it had gone, is worse than being told there is no signal.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';
import { cachedGet, peekCache, putCache } from './responseCache';

export type DocumentStatus = 'missing' | 'submitted' | 'approved' | 'rejected';

export interface DriverDocument {
    key: string;
    name: string;
    status: DocumentStatus;
    /** Why it was sent back. */
    note?: string | null;
    submitted_at?: string | null;
    reviewed_at?: string | null;
    file?: { id: string; url?: string | null; content_type?: string | null; original_filename?: string | null } | null;
}

export interface DocumentsSummary {
    /** `none` nothing asked · `needed` something to send · `in_review` waiting on the organisation · `approved`. */
    state: 'none' | 'needed' | 'in_review' | 'approved';
    required: number;
    approved: number;
    submitted: number;
    rejected: number;
    missing: number;
    complete: boolean;
    /** The driver cannot go online until the documents are approved. */
    held: boolean;
}

interface Payload {
    documents?: DriverDocument[];
    summary?: DocumentsSummary;
}

export type SendDocumentOutcome = { kind: 'sent' } | { kind: 'needs-connection' } | { kind: 'failed'; message?: string };

const unwrap = (raw: unknown): Payload => ((raw as { data?: unknown })?.data ?? raw ?? {}) as Payload;

const documentsPath = (driverId: string) => `drivers/${driverId}/documents`;

/** The documents as last read, for the screen to open on. */
function keptPayload(driverId?: string | null): Payload | undefined {
    const raw = driverId ? peekCache(documentsPath(driverId)) : undefined;
    return raw === undefined ? undefined : unwrap(raw);
}

export function useDriverDocuments(driverId?: string | null, reloadToken?: unknown) {
    const { adapter } = useFleetbase();
    // Seeded from the last answer: the list and the account screen's summary line show at once, and the load below refreshes them.
    const [documents, setDocuments] = useState<DriverDocument[] | null>(() => {
        const kept = keptPayload(driverId)?.documents;
        return Array.isArray(kept) ? kept : null;
    });
    const [summary, setSummary] = useState<DocumentsSummary | null>(() => keptPayload(driverId)?.summary ?? null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(false);
    const [sending, setSending] = useState<string | null>(null);

    const apply = useCallback((payload: Payload) => {
        if (Array.isArray(payload.documents)) setDocuments(payload.documents);
        if (payload.summary) setSummary(payload.summary);
    }, []);

    const reload = useCallback(async () => {
        if (!driverId) return;
        setIsLoading(true);
        try {
            apply(unwrap(await cachedGet(adapter, documentsPath(driverId))));
            setError(false);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, apply, driverId]);

    useEffect(() => {
        void reload();
    }, [reload, reloadToken]);

    const send = useCallback(
        async (documentKey: string, file: { base64: string; contentType?: string; fileName?: string }): Promise<SendDocumentOutcome> => {
            if (!driverId) return { kind: 'failed' };
            setSending(documentKey);
            try {
                const result = await adapter.post(`drivers/${driverId}/documents`, {
                    document: documentKey,
                    data: file.base64,
                    content_type: file.contentType ?? 'image/jpeg',
                    file_name: file.fileName,
                });
                if (isQueuedAck(result)) return { kind: 'needs-connection' };
                const payload = unwrap(result);
                apply(payload);
                // The answer is the whole list again; kept, so the screen reopens on the document as sent.
                if (Array.isArray(payload.documents)) putCache(documentsPath(driverId), undefined, result);
                return { kind: 'sent' };
            } catch (err) {
                if ((err as ApiError).isTransport) return { kind: 'needs-connection' };
                return { kind: 'failed', message: (err as Error)?.message };
            } finally {
                setSending(null);
            }
        },
        [adapter, apply, driverId]
    );

    return { documents, summary, isLoading, error, sending, reload, send };
}

export default useDriverDocuments;
