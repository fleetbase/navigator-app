/**
 * Resetting a forgotten password — design round 3 frame s65.
 *
 * Two calls, both made with the instance's platform token because there is no
 * driver session yet: `drivers/forgot-password` sends a code to the phone or
 * email on file, and `drivers/reset-password` takes that code with the new
 * password. The first answers `ok` whether or not the identity exists, so the
 * screen never confirms who has an account.
 */
import { useCallback, useState } from 'react';
import { useFleetbase } from '../api';

function messageFrom(err: unknown, fallback: string): string {
    const message = (err as { message?: string } | undefined)?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
}

export function usePasswordReset() {
    const { adapter } = useFleetbase();
    const [isRequesting, setIsRequesting] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const requestCode = useCallback(
        async (identity: string): Promise<{ ok: boolean; error?: string }> => {
            setIsRequesting(true);
            try {
                await adapter.post('drivers/forgot-password', { identity: identity.trim() });
                return { ok: true };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not send a code.') };
            } finally {
                setIsRequesting(false);
            }
        },
        [adapter]
    );

    const reset = useCallback(
        async (identity: string, code: string, password: string): Promise<{ ok: boolean; error?: string }> => {
            setIsResetting(true);
            try {
                await adapter.post('drivers/reset-password', { identity: identity.trim(), code: code.trim(), password });
                return { ok: true };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not change the password.') };
            } finally {
                setIsResetting(false);
            }
        },
        [adapter]
    );

    return { requestCode, reset, isRequesting, isResetting };
}

export default usePasswordReset;
