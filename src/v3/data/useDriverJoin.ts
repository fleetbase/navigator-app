/**
 * A new driver signing themselves up — design round 3, "Get started".
 *
 * The app is built for a whole server, so someone without an account belongs to
 * no organisation yet. The organisation's join code says which one: it is typed,
 * or carried by the QR code they scan. Three calls, all made with the server's
 * platform token because there is no driver yet:
 *
 *   - `GET onboard/join/{code}` names the organisation and what it asks for;
 *   - `POST onboard/request-code` texts a code to the phone number;
 *   - `POST onboard/driver` creates the account and signs the driver in.
 *
 * The server refuses all three unless the organisation has sign-up switched on.
 */
import { useCallback, useState } from 'react';
import { useFleetbase } from '../api';

export interface JoinOrganization {
    id: string;
    name: string;
    logo_url?: string | null;
}

export interface JoinInfo {
    organization: JoinOrganization;
    self_sign_up: boolean;
    documents_required: boolean;
    documents: string[];
}

function messageFrom(err: unknown, fallback: string): string {
    const message = (err as { message?: string } | undefined)?.message;
    return typeof message === 'string' && message.trim() ? message : fallback;
}

const unwrap = <T,>(raw: unknown): T => ((raw as { data?: unknown })?.data ?? raw) as T;

export function useDriverJoin() {
    const { adapter } = useFleetbase();
    const [busy, setBusy] = useState<'lookup' | 'code' | 'create' | null>(null);

    const lookup = useCallback(
        async (joinCode: string): Promise<{ ok: boolean; info?: JoinInfo; error?: string }> => {
            setBusy('lookup');
            try {
                const body = unwrap<{ onboarding?: JoinInfo }>(await adapter.get(`onboard/join/${encodeURIComponent(joinCode)}`));
                if (!body?.onboarding?.organization?.name) return { ok: false, error: 'That join code is not in use.' };
                return { ok: true, info: body.onboarding };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'That join code is not in use.') };
            } finally {
                setBusy(null);
            }
        },
        [adapter]
    );

    const requestCode = useCallback(
        async (joinCode: string, phone: string, name: string): Promise<{ ok: boolean; error?: string }> => {
            setBusy('code');
            try {
                await adapter.post('onboard/request-code', { join_code: joinCode, phone, name });
                return { ok: true };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not send a code.') };
            } finally {
                setBusy(null);
            }
        },
        [adapter]
    );

    const create = useCallback(
        async (input: { joinCode: string; phone: string; code: string; name: string; email?: string }): Promise<{ ok: boolean; driver?: unknown; error?: string }> => {
            setBusy('create');
            try {
                const driver = unwrap<{ id?: string }>(
                    await adapter.post('onboard/driver', { join_code: input.joinCode, phone: input.phone, code: input.code.trim(), name: input.name.trim(), email: input.email?.trim() || undefined })
                );
                if (!driver?.id) return { ok: false, error: 'Could not create your account.' };
                return { ok: true, driver };
            } catch (err) {
                return { ok: false, error: messageFrom(err, 'Could not create your account.') };
            } finally {
                setBusy(null);
            }
        },
        [adapter]
    );

    return { lookup, requestCode, create, busy };
}

export default useDriverJoin;
