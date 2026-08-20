/**
 * Which payload-entity fields this order permits a driver to edit.
 *
 * `GET orders/{id}/editable-entity-fields` returns the per-order-config
 * allowlist. It has existed since before the redesign and the v2 app never
 * called it, so every entity was read-only regardless of configuration.
 *
 * A failure is not fatal but it is not permissive either: with no allowlist
 * the screen locks everything rather than guessing, because guessing wrong
 * means writing a field the organisation deliberately protects.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFleetbase } from '../api';

export interface EditableFields {
    /** Field names the driver may change. */
    fields: string[];
    /** Config that decided it — shown so the driver knows what locked them out. */
    configName?: string;
}

export function useEditableEntityFields(orderId?: string) {
    const { adapter } = useFleetbase();
    const [editable, setEditable] = useState<string[]>([]);
    const [configName, setConfigName] = useState<string | undefined>();
    const [isLoading, setIsLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        if (!orderId) return;
        setIsLoading(true);
        setFailed(false);
        try {
            const raw = await adapter.get(`orders/${orderId}/editable-entity-fields`);
            const data = ((raw as { data?: unknown })?.data ?? raw) as
                | string[]
                | { fields?: string[]; editable?: string[]; config_name?: string };

            if (Array.isArray(data)) {
                setEditable(data.map(String));
            } else {
                setEditable((data?.fields ?? data?.editable ?? []).map(String));
                setConfigName(data?.config_name);
            }
        } catch {
            // Locked, not open. See the note above.
            setFailed(true);
            setEditable([]);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, orderId]);

    useEffect(() => {
        void load();
    }, [load]);

    const isEditable = useCallback((field: string) => editable.includes(field), [editable]);

    return { editable, isEditable, configName, isLoading, failed, reload: load };
}

export default useEditableEntityFields;
