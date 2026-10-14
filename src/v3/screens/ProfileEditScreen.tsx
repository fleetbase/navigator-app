/**
 * Profile edit — R2 frame A7.
 *
 * Only the driver's *own* details. Status, assigned vehicle, vendor and current
 * job are all writable on the same endpoint, and all of them belong to dispatch
 * — a driver setting their own status to "available" from the phone would be
 * editing the dispatcher's view of the fleet.
 *
 * **No password change.** `PUT /v1/drivers/{id}` accepts `password` and sets it
 * without asking for the current one, so putting that in the app would let
 * anyone holding an unlocked handset take the account. It needs a server-side
 * current-password check first.
 *
 * Only changed fields are sent — nothing is required on an update, so an
 * unchanged form makes no request at all.
 */
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Micro } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useUpdateDriver, type DriverRecord, type DriverProfileDraft } from '../data';
import { useScreenStyle } from '../ui/useScreenStyle';

/** Deliberately not `status`, `vehicle`, `vendor` or `job` — dispatch owns those. */
const FIELDS = [
    { key: 'name', labelKey: 'profile.name', keyboard: 'default' as const, autoCapitalize: 'words' as const },
    { key: 'email', labelKey: 'profile.email', keyboard: 'email-address' as const, autoCapitalize: 'none' as const },
    { key: 'phone', labelKey: 'profile.phone', keyboard: 'phone-pad' as const, tabular: true },
    { key: 'city', labelKey: 'profile.city', keyboard: 'default' as const, autoCapitalize: 'words' as const },
    { key: 'country', labelKey: 'profile.country', keyboard: 'default' as const, autoCapitalize: 'characters' as const, hintKey: 'profile.countryHint' },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileEditScreen({
    driverId,
    driver,
    onSaved,
    onCancel,
}: {
    driverId?: string;
    driver?: DriverRecord | null;
    onSaved?: (driver: DriverRecord) => void;
    onCancel?: () => void;
}) {
    const { t } = useTranslation();
    const screen = useScreenStyle();
    const { isOnline } = useSync();
    const { save, isSaving, queued, error, clearError } = useUpdateDriver(driverId);

    const initial = useMemo<Record<FieldKey, string>>(
        () => ({
            name: driver?.name ?? '',
            email: driver?.email ?? '',
            phone: driver?.phone ?? '',
            city: driver?.city ?? '',
            country: driver?.country ?? '',
        }),
        [driver]
    );

    const [draft, setDraft] = useState<Partial<Record<FieldKey, string>>>({});
    const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});

    const valueOf = (key: FieldKey) => draft[key] ?? initial[key];

    const errorFor = (key: FieldKey): string | undefined => {
        if (!touched[key]) return undefined;
        const value = valueOf(key).trim();
        if (key === 'email' && value && !EMAIL.test(value)) return t('profile.emailInvalid');
        // `country` is validated `size:2` server-side — a 3-letter code 422s.
        if (key === 'country' && value && value.length !== 2) return t('profile.countryInvalid');
        if (key === 'name' && !value) return t('profile.nameRequired');
        return undefined;
    };

    const changed = useMemo(
        () => (Object.keys(draft) as FieldKey[]).filter((key) => (draft[key] ?? '').trim() !== initial[key].trim()),
        [draft, initial]
    );

    const invalid = (Object.keys(initial) as FieldKey[]).some((key) => {
        const value = valueOf(key).trim();
        if (key === 'email' && value && !EMAIL.test(value)) return true;
        if (key === 'country' && value && value.length !== 2) return true;
        if (key === 'name' && !value) return true;
        return false;
    });

    const submit = useCallback(async () => {
        // Only what actually changed — an update requires nothing.
        const changes: DriverProfileDraft = {};
        for (const key of changed) changes[key] = (draft[key] ?? '').trim();
        const updated = await save(changes);
        if (updated) onSaved?.(updated);
    }, [changed, draft, save, onSaved]);

    return (
        <ScrollView style={screen} contentContainerStyle={{ padding: space[4], gap: space[4] }} testID="profile-edit">
            {!isOnline ? <Banner tone="neutral" message={t('profile.offlineNotice')} testID="profile-offline" /> : null}

            <Surface padded>
                <YStack gap={space[4]}>
                    {FIELDS.map((field) => (
                        <Field
                            key={field.key}
                            label={t(field.labelKey)}
                            value={valueOf(field.key)}
                            onChangeText={(text) => setDraft((d) => ({ ...d, [field.key]: text }))}
                            onBlur={() => setTouched((s) => ({ ...s, [field.key]: true }))}
                            keyboardType={field.keyboard}
                            autoCapitalize={'autoCapitalize' in field ? field.autoCapitalize : undefined}
                            tabular={'tabular' in field ? field.tabular : undefined}
                            error={errorFor(field.key)}
                            hint={'hintKey' in field ? t(field.hintKey) : undefined}
                            testID={`input-${field.key}`}
                        />
                    ))}
                </YStack>
            </Surface>

            {/* Says what this screen will not do, and why, rather than staying silent. */}
            <Micro testID="dispatch-owned">{t('profile.dispatchOwned')}</Micro>
            <Micro testID="no-password">{t('profile.noPasswordChange')}</Micro>

            {queued ? <Banner tone="neutral" message={t('profile.queued')} testID="profile-queued" /> : null}
            {error ? <ErrorState title={t('profile.saveFailed')} body={error} onRetry={clearError} retryLabel={t('common.dismiss')} testID="profile-error" /> : null}

            <XStack gap={space[2]}>
                <Button flex={1} variant="ghost" onPress={onCancel} testID="profile-cancel">
                    {t('common.cancel')}
                </Button>
                <Button flex={2} disabled={changed.length === 0 || invalid} loading={isSaving} onPress={submit} testID="profile-save">
                    {t('profile.save')}
                </Button>
            </XStack>
        </ScrollView>
    );
}

export default ProfileEditScreen;
