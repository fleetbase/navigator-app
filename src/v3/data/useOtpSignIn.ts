/**
 * Sign in with a one-time code — R1 frame s15.
 *
 * Two things about this endpoint shape the screen, and neither is guessable:
 *
 *   - **The server chooses the channel.** `POST drivers/login-with-sms` tries
 *     SMS and, if that throws, falls back to email — then reports which it
 *     used as `{ status: 'OK', method: 'sms' | 'email' }`. So the app must say
 *     "we texted you" or "we emailed you" based on the answer, never assume.
 *     Telling someone to check their texts when the code went to their inbox is
 *     a dead end they cannot reason their way out of.
 *   - **Verification takes an `identity`, not the phone.** `verify-code`
 *     accepts either a phone or an email, so whichever the driver entered is
 *     what must be sent back with the code.
 *
 * Neither call is queueable: replaying a sign-in later is meaningless, and the
 * adapter already refuses both paths.
 */
import { useCallback, useState } from 'react';
import { useFleetbase } from '../api';

/** Which channel the server actually used. */
export type OtpChannel = 'sms' | 'email';

export interface OtpRequestResult {
    ok: boolean;
    channel?: OtpChannel;
    error?: string;
}

function messageFrom(err: unknown, fallback: string): string {
    const message = (err as { message?: string } | undefined)?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
}

export function useOtpSignIn() {
    const { adapter } = useFleetbase();
    const [isRequesting, setIsRequesting] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    const requestCode = useCallback(
        async (phone: string): Promise<OtpRequestResult> => {
            setIsRequesting(true);
            try {
                const raw = await adapter.post('drivers/login-with-sms', { phone: phone.trim() });
                const body = ((raw as { data?: unknown })?.data ?? raw) as { status?: string; method?: string };
                // `method` is the server's answer, not our assumption.
                const channel = body?.method === 'email' ? 'email' : 'sms';
                return { ok: true, channel };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not send a code.') };
            } finally {
                setIsRequesting(false);
            }
        },
        [adapter]
    );

    const verifyCode = useCallback(
        async (identity: string, code: string): Promise<{ ok: boolean; driver?: unknown; error?: string }> => {
            setIsVerifying(true);
            try {
                const raw = await adapter.post('drivers/verify-code', {
                    identity: identity.trim(),
                    code: code.trim(),
                    for: 'driver_login',
                });
                const driver = ((raw as { data?: unknown })?.data ?? raw) as { id?: string };
                if (!driver?.id) return { ok: false, error: 'Could not verify that code.' };
                return { ok: true, driver };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not verify that code.') };
            } finally {
                setIsVerifying(false);
            }
        },
        [adapter]
    );

    return { requestCode, verifyCode, isRequesting, isVerifying };
}

/** Digits, spaces and a leading + — enough to catch a typo, not to be clever. */
export function looksLikePhone(value: string): boolean {
    const trimmed = (value ?? '').trim();
    if (!/^\+?[\d\s()-]+$/.test(trimmed)) return false;
    const digits = trimmed.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}

/** The server prepends `+` itself, but sending it avoids an ambiguous parse. */
export function normalizePhone(value: string): string {
    const trimmed = (value ?? '').trim();
    const digits = trimmed.replace(/[^\d]/g, '');
    return trimmed.startsWith('+') ? `+${digits}` : `+${digits}`;
}
