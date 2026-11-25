/**
 * Your details — R2 frame A7, in the round 3 look.
 *
 * Only the driver's *own* details. Status, vendor and current job are writable
 * on the same endpoint, and all of them belong to dispatch — a driver setting
 * their own status to "available" from the phone would be editing the
 * dispatcher's view of the fleet.
 *
 * Three things `PUT /v1/drivers/{id}` and its neighbours allow, all used here:
 *
 *   - **name, email, phone** go to the linked user; **city, country** to the
 *     driver (DriverController@update). Nothing is required on an update, so
 *     only changed fields are sent and an unchanged form makes no request.
 *   - **photo** as a base64 image becomes the user's avatar.
 *   - **password** has its own endpoint, `POST drivers/{id}/change-password`,
 *     which asks for the current one and answers with a new token. The general
 *     update no longer accepts a password at all, which is why this screen used
 *     to say it could not be changed.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useUpdateDriver, useUpdateDriverPhoto, useChangePassword, type DriverRecord, type DriverProfileDraft } from '../data';
import { ACTION_RADIUS, BigButton } from '../onboarding/AuthScaffold';
import { Avatar, Card, MenuRow, Screen, Section, SmallButton } from './me/parts';
import type { CapturedPhoto } from '../../components/CameraCapture';

/* VisionCamera initialises its native module at import; load it only when the driver asks for a photo. */
const lazyCamera = () => require('../../components/CameraCapture').default as React.ComponentType<{ onDone?: (photos: CapturedPhoto[]) => void }>;

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
/** The server's own floor (DriverController@changePassword). */
const MIN_PASSWORD = 8;

export function ProfileEditScreen({
    driverId,
    driver,
    onSaved,
    onNewToken,
}: {
    driverId?: string;
    driver?: DriverRecord | null;
    onSaved?: (driver: DriverRecord) => void;
    /** Kept for callers; the title bar's back control is the way out now. */
    onCancel?: () => void;
    /**
     * A password change returns a new token and deletes the old one. Whoever
     * owns the session must take it, so the password section is only offered
     * when this is wired.
     */
    onNewToken?: (token: string) => void;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { save, isSaving, queued, error, clearError } = useUpdateDriver(driverId);
    const { savePhoto, isSaving: isSavingPhoto, error: photoError } = useUpdateDriverPhoto(driverId);
    const password = useChangePassword(driverId);

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
    const [camera, setCamera] = useState(false);
    // The photo just saved, shown at once; the driver record refetches on return.
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [photoQueued, setPhotoQueued] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');

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

    const takePhoto = useCallback(
        async (taken: CapturedPhoto[]) => {
            setCamera(false);
            const first = taken.map((p) => p.base64 ?? '').find(Boolean);
            if (!first) return;
            const result = await savePhoto(first);
            if (result === 'queued') setPhotoQueued(true);
            else if (result) setPhotoUrl(result.photo_url ?? result.avatar_url ?? null);
        },
        [savePhoto]
    );

    const passwordReady = currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD;
    const submitPassword = useCallback(async () => {
        const token = await password.change(currentPassword, newPassword);
        if (token) {
            setCurrentPassword('');
            setNewPassword('');
            setChangingPassword(false);
            onNewToken?.(token);
        }
    }, [password, currentPassword, newPassword, onNewToken]);

    return (
        <Screen
            testID="profile-edit"
            footer={
                <BigButton disabled={changed.length === 0 || invalid} loading={isSaving} onPress={submit} testID="profile-save">
                    {t('profile.save')}
                </BigButton>
            }
        >
            {!isOnline ? <Banner tone="neutral" message={t('profile.offlineNotice')} testID="profile-offline" /> : null}

            <XStack alignItems="center" gap={14} testID="profile-photo">
                <Avatar url={photoUrl ?? driver?.photo_url ?? driver?.avatar_url} name={valueOf('name')} size={76} />
                <YStack flex={1} gap={space[2]} alignItems="flex-start">
                    {/* A photo is megabytes; it is only offered with a connection. */}
                    {isOnline ? (
                        <SmallButton label={isSavingPhoto ? t('common.saving') : camera ? t('common.cancel') : t('me.profile.changePhoto')} onPress={isSavingPhoto ? undefined : () => setCamera((open) => !open)} testID="profile-change-photo" />
                    ) : (
                        <Secondary fontSize={13}>{t('me.profile.photoNeedsSignal')}</Secondary>
                    )}
                    {photoError ? (
                        <Secondary fontSize={13} tone="danger" testID="profile-photo-error">
                            {t('me.profile.photoFailed')}
                        </Secondary>
                    ) : null}
                    {photoQueued ? <Secondary fontSize={13}>{t('me.savedOnPhone')}</Secondary> : null}
                </YStack>
            </XStack>

            {camera
                ? (() => {
                      const Camera = lazyCamera();
                      return <Camera onDone={(taken) => void takePhoto(taken)} />;
                  })()
                : null}

            <Card gap={space[4]}>
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
            </Card>

            {queued ? <Banner tone="neutral" message={t('profile.queued')} testID="profile-queued" /> : null}
            {error ? <ErrorState title={t('profile.saveFailed')} body={error} onRetry={clearError} retryLabel={t('common.dismiss')} testID="profile-error" /> : null}

            {/* Never queued: a password change that lands an hour later, on a handset someone else may be holding by then, is not what was asked for. */}
            {onNewToken && isOnline ? (
                <Section title={t('me.profile.security')}>
                    {changingPassword ? (
                        <Card gap={space[4]} testID="profile-password">
                            <Field label={t('me.profile.currentPassword')} value={currentPassword} onChangeText={setCurrentPassword} secure autoCapitalize="none" autoComplete="current-password" testID="input-current-password" />
                            <Field
                                label={t('me.profile.newPassword')}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                secure
                                autoCapitalize="none"
                                autoComplete="off"
                                hint={t('me.profile.passwordHint', { count: MIN_PASSWORD })}
                                testID="input-new-password"
                            />
                            {password.error ? <Banner tone="danger" message={password.error === 'no-token' ? t('me.profile.passwordFailed') : password.error} testID="profile-password-error" /> : null}
                            <Secondary fontSize={13} lineHeight={18}>
                                {t('me.profile.passwordSignsOthersOut')}
                            </Secondary>
                            <XStack gap={space[2]}>
                                <Button
                                    flex={1}
                                    height={52}
                                    borderRadius={ACTION_RADIUS}
                                    variant="secondary"
                                    onPress={() => {
                                        setChangingPassword(false);
                                        password.clearError();
                                    }}
                                    testID="profile-password-cancel"
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button flex={1} height={52} borderRadius={ACTION_RADIUS} disabled={!passwordReady} loading={password.isSaving} onPress={submitPassword} testID="profile-password-save">
                                    {t('me.profile.changePassword')}
                                </Button>
                            </XStack>
                        </Card>
                    ) : (
                        <Card flush>
                            <MenuRow first height={60} icon="lock" label={t('me.profile.changePassword')} onPress={() => setChangingPassword(true)} testID="profile-change-password" />
                        </Card>
                    )}
                </Section>
            ) : null}

            {/* Says what this screen will not do, and why, rather than staying silent. */}
            <Body fontSize={13} lineHeight={18} tone="secondary" testID="dispatch-owned">
                {t('me.profile.dispatchOwned')}
            </Body>
        </Screen>
    );
}

export default ProfileEditScreen;
