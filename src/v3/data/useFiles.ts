/**
 * File upload — `POST /v1/files/base64` on the core API.
 *
 * Base64 because the app already holds photos that way (proof capture, DVIR
 * defects): a file path cannot be re-read at replay time, base64 can. But an
 * upload is **not** queued: a file that lands hours later with nothing
 * referencing it is an orphan, and the message or record it was meant for
 * has to know the file's id *before* it can be sent. So an upload without a
 * connection answers `needs-connection`, and the caller says so.
 */
import { useCallback, useState } from 'react';
import { useFleetbase, isQueuedAck } from '../api';
import type { ApiError } from '../api/NavigatorAdapter';

export interface UploadedFile {
    id: string;
    url?: string | null;
    original_filename?: string | null;
    content_type?: string | null;
    file_size?: number | null;
    type?: string | null;
}

export interface UploadInput {
    /** Bare base64, no data-URL prefix. */
    base64: string;
    fileName: string;
    contentType?: string;
    /** `image`, `document`… — the server's `file_type`. */
    fileType?: string;
    subject?: { type: string; id: string };
}

export type UploadOutcome = { kind: 'uploaded'; file: UploadedFile } | { kind: 'needs-connection' } | { kind: 'failed'; message: string };

export function useUploadFile() {
    const { adapter } = useFleetbase();
    const [isUploading, setIsUploading] = useState(false);

    const upload = useCallback(
        async (input: UploadInput): Promise<UploadOutcome> => {
            setIsUploading(true);
            try {
                const result = await adapter.post('files/base64', {
                    data: input.base64,
                    file_name: input.fileName,
                    file_type: input.fileType ?? 'image',
                    content_type: input.contentType ?? 'image/jpeg',
                    ...(input.subject ? { subject_type: input.subject.type, subject_uuid: input.subject.id } : {}),
                });
                if (isQueuedAck(result)) return { kind: 'needs-connection' };
                const file = ((result as { data?: unknown })?.data ?? result) as UploadedFile;
                return file?.id ? { kind: 'uploaded', file } : { kind: 'failed', message: 'no-file-id' };
            } catch (err) {
                // Uploads are in NEVER_QUEUE, so losing signal surfaces as a
                // transport failure here rather than as a queued ack.
                if ((err as ApiError).isTransport) return { kind: 'needs-connection' };
                return { kind: 'failed', message: (err as Error).message };
            } finally {
                setIsUploading(false);
            }
        },
        [adapter]
    );

    return { upload, isUploading };
}
