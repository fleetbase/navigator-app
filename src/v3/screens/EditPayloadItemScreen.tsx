/**
 * Edit payload item — R1 frame s07.
 *
 * The point of the screen is that the *organisation* decides what a driver may
 * change, per order config. So this is a field renderer over a server-declared
 * allowlist, not a fixed form: a field is editable, or it is shown locked with
 * the reason. Nothing is assumed editable.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack, Switch } from 'tamagui';
import { Body, Caption, Micro, Secondary } from '../ui/Text';
import { Identifier } from '../ui/Identifier';
import { Surface, Divider } from '../ui/Surface';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useEditableEntityFields, entityIdOf, entityNameOf, entityTrackingNumberOf } from '../data';
import { useFleetbase, isQueuedAck } from '../api';

/** Every field the screen knows how to show, in display order. */
const FIELDS = [
    { key: 'name', labelKey: 'editPayloadItem.fieldName', keyboard: 'default' as const },
    { key: 'sku', labelKey: 'editPayloadItem.fieldSku', keyboard: 'default' as const },
    { key: 'quantity', labelKey: 'editPayloadItem.fieldQuantity', keyboard: 'numeric' as const, tabular: true },
    { key: 'weight', labelKey: 'editPayloadItem.fieldWeight', keyboard: 'decimal-pad' as const, tabular: true },
    { key: 'dimensions', labelKey: 'editPayloadItem.fieldDimensions', keyboard: 'default' as const, tabular: true },
    { key: 'declared_value', labelKey: 'editPayloadItem.fieldDeclaredValue', keyboard: 'decimal-pad' as const, tabular: true },
    { key: 'serial_number', labelKey: 'editPayloadItem.fieldSerialNumber', keyboard: 'default' as const },
    { key: 'description', labelKey: 'editPayloadItem.fieldNotes', keyboard: 'default' as const, multiline: true },
];

export interface PayloadEntity {
    /**
     * Null on every entity a live instance returns — identity is in
     * `internal_id`. Always resolve it with `entityIdOf`, never read directly.
     */
    id?: string | null;
    internal_id?: string | null;
    name?: string;
    tracking_number?: string;
    sku?: string;
    [key: string]: unknown;
}

export function EditPayloadItemScreen({
    orderId,
    entity,
    onDone,
}: {
    orderId: string;
    entity: PayloadEntity;
    onDone?: () => void;
}) {
    const { t } = useTranslation();
    const { adapter } = useFleetbase();
    const { isEditable, configName, failed } = useEditableEntityFields(orderId);

    const [draft, setDraft] = useState<Record<string, string>>({});
    const [damaged, setDamaged] = useState(Boolean(entity.damaged));
    const [isSaving, setIsSaving] = useState(false);
    const [queued, setQueued] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const valueOf = useCallback(
        (key: string) => draft[key] ?? (entity[key] == null ? '' : String(entity[key])),
        [draft, entity]
    );

    const editableCount = useMemo(() => FIELDS.filter((f) => isEditable(f.key)).length, [isEditable]);
    const dirty = Object.keys(draft).length > 0 || damaged !== Boolean(entity.damaged);

    const entityId = entityIdOf(entity);

    const save = useCallback(async () => {
        if (!entityId) {
            setSaveError(t('editPayloadItem.missingIdentifier'));
            return;
        }
        setIsSaving(true);
        setSaveError(null);
        try {
            // Only send what the server said may change — never the whole entity.
            const body: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(draft)) {
                if (isEditable(key)) body[key] = value;
            }
            if (damaged !== Boolean(entity.damaged)) body.damaged = damaged;

            const result = await adapter.put(`entities/${entityId}`, body);
            if (isQueuedAck(result)) setQueued(true);
            else onDone?.();
        } catch (err) {
            setSaveError((err as Error).message);
        } finally {
            setIsSaving(false);
        }
    }, [adapter, draft, damaged, entity, entityId, isEditable, onDone, t]);

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="edit-payload-item">
            <YStack gap={space[2]}>
                <XStack justifyContent="space-between" alignItems="center">
                    <Body fontSize={17} fontWeight="800">
                        {entityNameOf(entity)}
                    </Body>
                    <Caption tone="brand">{t('editPayloadItem.title')}</Caption>
                </XStack>
                {entityTrackingNumberOf(entity) ? <Identifier value={entityTrackingNumberOf(entity)!} boxed={false} /> : null}
            </YStack>

            {failed ? (
                <Banner tone="warning" message={t('editPayloadItem.permissionsUnavailable')} testID="permissions-unavailable" />
            ) : editableCount === 0 ? (
                <Banner tone="neutral" message={t('editPayloadItem.nothingEditable')} testID="nothing-editable" />
            ) : (
                <YStack gap={space[1]} testID="editable-summary">
                    <Secondary fontSize={13}>
                        {t('editPayloadItem.editableSummary', { count: editableCount, total: FIELDS.length })}
                    </Secondary>
                    <Micro>
                        {configName
                            ? t('editPayloadItem.lockedByConfig', { config: configName })
                            : t('editPayloadItem.lockedByDefault')}
                    </Micro>
                </YStack>
            )}

            <Surface>
                {FIELDS.map((field, i) => {
                    const allowed = isEditable(field.key);
                    return (
                        <YStack key={field.key}>
                            {i > 0 ? <Divider /> : null}
                            <YStack padding={space[3]} gap={space[2]} testID={`field-${field.key}`}>
                                <XStack justifyContent="space-between" alignItems="center">
                                    <Caption>{t(field.labelKey)}</Caption>
                                    {allowed ? (
                                        <Micro tone="brand" testID={`editable-${field.key}`}>
                                            {t('editPayloadItem.fieldEditable')}
                                        </Micro>
                                    ) : null}
                                </XStack>

                                {allowed ? (
                                    <Field
                                        value={valueOf(field.key)}
                                        onChangeText={(text) => setDraft((d) => ({ ...d, [field.key]: text }))}
                                        keyboardType={field.keyboard}
                                        multiline={field.multiline}
                                        tabular={field.tabular}
                                        placeholder={field.multiline ? t('editPayloadItem.notesPlaceholder') : undefined}
                                        testID={`input-${field.key}`}
                                    />
                                ) : (
                                    // Locked fields still show their value — the driver
                                    // needs to read them even when they cannot change them.
                                    <Body fontSize={15} tone="secondary" tabular={field.tabular}>
                                        {valueOf(field.key) || t('common.notAvailable')}
                                    </Body>
                                )}
                            </YStack>
                        </YStack>
                    );
                })}
            </Surface>

            <Surface padded="compact">
                <XStack alignItems="center" gap={space[3]}>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={15}>{t('editPayloadItem.flagDamaged')}</Body>
                        <Micro tone="warning">{t('editPayloadItem.flagDamagedHint')}</Micro>
                    </YStack>
                    <Switch
                        testID="flag-damaged"
                        size="$3"
                        checked={damaged}
                        onCheckedChange={setDamaged}
                        backgroundColor={damaged ? '$danger' : '$surfaceRaised'}
                        borderColor="$border"
                        borderWidth={1}
                        accessibilityLabel={t('editPayloadItem.flagDamaged')}
                    >
                        <Switch.Thumb animation="quick" backgroundColor="$white" />
                    </Switch>
                </XStack>
            </Surface>

            {queued ? <Banner tone="neutral" message={t('editPayloadItem.saveQueued')} testID="save-queued" /> : null}
            {saveError ? <ErrorState title={t('editPayloadItem.saveFailed')} body={saveError} testID="save-error" /> : null}

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={onDone} testID="cancel-edit">
                    {t('common.cancel')}
                </Button>
                <Button
                    flex={2}
                    disabled={!dirty || editableCount === 0 || !entityId}
                    loading={isSaving}
                    onPress={save}
                    testID="save-edit"
                >
                    {t('common.save')}
                </Button>
            </XStack>
        </ScrollView>
    );
}

export default EditPayloadItemScreen;
